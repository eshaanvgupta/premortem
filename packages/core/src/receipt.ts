import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  type Hex,
} from 'viem';
import { REGISTRY_ABI } from './abi';
import { assertBsc, createBscClient, toRpcClient, type RpcClient } from './client';
import { FINALITY_BLOCKS, OFFICIAL_AGENT_ID, PROTOCOL_VERSION } from './constants';
import { addressSchema } from './schema';
import { hexQuantity, type ProtocolEvent } from './events';
import { canonicalJson } from './hash';

export interface VerifyReceiptOptions {
  transactionHash: string;
  address: string;
  client?: RpcClient;
  rpcUrls?: readonly string[];
  confirmations?: bigint;
  capsuleId?: bigint;
  expectedCodeHash?: Hex;
}
export async function verifyReceipt(options: VerifyReceiptOptions) {
  const address = addressSchema.parse(options.address);
  if (!/^0x[0-9a-f]{64}$/i.test(options.transactionHash))
    throw new Error('Invalid transaction hash');
  const client = options.client ?? toRpcClient(createBscClient(options.rpcUrls));
  await assertBsc(client);
  const [rawReceipt, head] = await Promise.all([
    client.request({ method: 'eth_getTransactionReceipt', params: [options.transactionHash] }),
    client.request({ method: 'eth_blockNumber' }),
  ]);
  type Receipt = {
    status: Hex;
    to: string | null;
    from: string;
    transactionHash: Hex;
    blockNumber: Hex;
    blockHash: Hex;
    logs: {
      address: string;
      data: Hex;
      topics: Hex[];
      logIndex: Hex;
      transactionHash: Hex;
      blockHash: Hex;
      blockNumber: Hex;
    }[];
  };
  const receipt = rawReceipt as Receipt | null;
  if (!receipt)
    return {
      verified: false,
      status: 'PENDING' as const,
      reason: 'No mined receipt is available',
      events: [],
      chainId: 56,
      contract: address,
      transactionHash: options.transactionHash,
    };
  if (receipt.transactionHash?.toLowerCase() !== options.transactionHash.toLowerCase())
    throw new Error('RPC receipt hash mismatch');
  if (receipt.to?.toLowerCase() !== address.toLowerCase())
    throw new Error('Receipt destination differs from selected protocol');
  if (receipt.status !== '0x1')
    return {
      verified: false,
      status: 'REVERTED' as const,
      reason: 'Transaction reverted',
      events: [],
      chainId: 56,
      contract: address,
      transactionHash: options.transactionHash,
    };
  if (typeof head !== 'string') throw new Error('Invalid RPC head');
  const blockNumber = BigInt(receipt.blockNumber);
  const block = (await client.request({
    method: 'eth_getBlockByNumber',
    params: [receipt.blockNumber, false],
  })) as { hash?: string; timestamp?: string } | null;
  if (block?.hash?.toLowerCase() !== receipt.blockHash.toLowerCase() || !block.timestamp)
    throw new Error('Receipt block is not canonical; possible reorg');
  const identityData = await client.request({
    method: 'eth_call',
    params: [
      { to: address, data: encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'AGENT_ID' }) },
      receipt.blockNumber,
    ],
  });
  if (typeof identityData !== 'string')
    throw new Error('Cannot validate protocol Agent ID dependency');
  const identity = decodeFunctionResult({
    abi: REGISTRY_ABI,
    functionName: 'AGENT_ID',
    data: identityData as Hex,
  });
  if (identity.toLowerCase() !== OFFICIAL_AGENT_ID.toLowerCase())
    throw new Error('Selected registry does not reference the official Agent ID');
  let registryRuntimeVerified = false;
  if (options.expectedCodeHash) {
    if (
      !/^0x[0-9a-f]{64}$/i.test(options.expectedCodeHash) ||
      /^0x0{64}$/i.test(options.expectedCodeHash)
    )
      throw new Error('Invalid pinned runtime hash');
    const code = await client.request({
      method: 'eth_getCode',
      params: [address, receipt.blockNumber],
    });
    if (
      typeof code !== 'string' ||
      !/^0x(?:[0-9a-f]{2})+$/i.test(code) ||
      keccak256(code as Hex).toLowerCase() !== options.expectedCodeHash.toLowerCase()
    )
      throw new Error('Registry runtime differs from pinned deployment hash');
    registryRuntimeVerified = true;
  }
  const confirmations = BigInt(head) >= blockNumber ? BigInt(head) - blockNumber : 0n;
  if (BigInt(head) < blockNumber) throw new Error('Receipt block is ahead of RPC head');
  if ((options.confirmations ?? FINALITY_BLOCKS) < 0n)
    throw new Error('Invalid confirmation depth');
  const confirmed = confirmations >= (options.confirmations ?? FINALITY_BLOCKS);
  const events: ProtocolEvent[] = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) continue;
    if (
      log.transactionHash?.toLowerCase() !== receipt.transactionHash.toLowerCase() ||
      log.blockHash?.toLowerCase() !== receipt.blockHash.toLowerCase() ||
      BigInt(log.blockNumber) !== blockNumber
    )
      throw new Error('Receipt log inclusion metadata mismatch');
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: REGISTRY_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
    } catch {
      continue;
    }
    const args = decoded.args as unknown as Record<string, unknown>;
    if (options.capsuleId !== undefined && args.capsuleId !== options.capsuleId) continue;
    events.push({
      eventName: decoded.eventName,
      args,
      address,
      blockNumber,
      blockHash: receipt.blockHash,
      transactionHash: receipt.transactionHash,
      logIndex: Number(BigInt(log.logIndex)),
      timestamp: BigInt(block.timestamp),
      confirmed,
    });
  }
  return {
    verified: confirmed && events.length > 0,
    registryRuntimeVerified,
    registryAuthenticity: registryRuntimeVerified ? 'MATCHES_PINNED_RUNTIME' : 'NOT_ATTESTED',
    status: confirmed ? ('CONFIRMED' as const) : ('PENDING_CONFIRMATIONS' as const),
    reason: events.length
      ? 'Receipt, destination, canonical block, official identity dependency and event signatures checked by this client'
      : 'No matching protocol events',
    chainId: 56,
    contract: address,
    transactionHash: options.transactionHash,
    blockNumber: blockNumber.toString(),
    blockHash: receipt.blockHash,
    confirmations: confirmations.toString(),
    events,
    limitation:
      'Independent RPC checks are not a light-client proof. A runtime hash pin must come from an authenticated deployment; a malicious imitation can otherwise emit matching events.',
  };
}

export async function buildDecisionReceipt(options: {
  address: string;
  capsuleId: bigint;
  events: readonly ProtocolEvent[];
  client?: RpcClient;
  rpcUrls?: readonly string[];
  expectedCodeHash?: Hex;
}) {
  const client = options.client ?? toRpcClient(createBscClient(options.rpcUrls));
  await assertBsc(client);
  const address = addressSchema.parse(options.address);
  const matching = options.events.filter(
    (event) =>
      event.address.toLowerCase() === address.toLowerCase() &&
      event.args.capsuleId === options.capsuleId,
  );
  const hashes = [...new Set(matching.map((event) => event.transactionHash))];
  const verifications = [];
  for (const transactionHash of hashes)
    verifications.push(
      await verifyReceipt({
        address,
        transactionHash,
        capsuleId: options.capsuleId,
        client,
        expectedCodeHash: options.expectedCodeHash,
      }),
    );
  const actualEvents = verifications.flatMap((item) => item.events);
  const sameEvent = (supplied: ProtocolEvent, actual: ProtocolEvent) =>
    supplied.address.toLowerCase() === actual.address.toLowerCase() &&
    supplied.eventName === actual.eventName &&
    supplied.transactionHash.toLowerCase() === actual.transactionHash.toLowerCase() &&
    supplied.blockNumber === actual.blockNumber &&
    supplied.blockHash.toLowerCase() === actual.blockHash.toLowerCase() &&
    supplied.logIndex === actual.logIndex &&
    supplied.timestamp === actual.timestamp &&
    canonicalJson(supplied.args) === canonicalJson(actual.args);
  const suppliedEventChecks = matching.map((supplied) => ({
    transactionHash: supplied.transactionHash,
    logIndex: supplied.logIndex,
    matchesReceipt: actualEvents.some((actual) => sameEvent(supplied, actual)),
  }));
  const head = await client.request({ method: 'eth_blockNumber' });
  if (typeof head !== 'string') throw new Error('Invalid latest block');
  const finalizedHead = BigInt(head) > FINALITY_BLOCKS ? BigInt(head) - FINALITY_BLOCKS : 0n;
  const data = await client.request({
    method: 'eth_call',
    params: [
      {
        to: address,
        data: encodeFunctionData({
          abi: REGISTRY_ABI,
          functionName: 'getCapsule',
          args: [options.capsuleId],
        }),
      },
      hexQuantity(finalizedHead),
    ],
  });
  if (typeof data !== 'string') throw new Error('Missing capsule data');
  const capsule = decodeFunctionResult({
    abi: REGISTRY_ABI,
    functionName: 'getCapsule',
    data: data as Hex,
  });
  const creationEvidenceVerified = actualEvents.some(
    (event) =>
      event.confirmed &&
      event.eventName === 'CapsuleCreated' &&
      String(event.args.actor).toLowerCase() === capsule.creator.toLowerCase() &&
      event.args.actionHash === capsule.actionHash &&
      event.args.evidenceRoot === capsule.evidenceRoot &&
      event.args.simulationHash === capsule.simulationHash &&
      event.args.label === capsule.label,
  );
  return {
    protocolVersion: PROTOCOL_VERSION,
    chainId: 56,
    contract: address,
    capsuleId: options.capsuleId.toString(),
    actionHash: capsule.actionHash,
    evidenceRoot: capsule.evidenceRoot,
    simulationHash: capsule.simulationHash,
    reviewerCounts: {
      approvals: capsule.approvals,
      rejections: capsule.rejections,
      insufficient: capsule.insufficient,
      commitments: capsule.commitments,
    },
    verdict: ['PENDING', 'APPROVED', 'REJECTED', 'INCONCLUSIVE'][capsule.outcome],
    capsule,
    checkedAtBlock: finalizedHead.toString(),
    eventEvidence: verifications,
    suppliedEventChecks,
    unrelatedSuppliedEvents: options.events.length - matching.length,
    creationEvidenceVerified,
    allSuppliedEventsVerified:
      matching.length > 0 &&
      matching.length === options.events.length &&
      verifications.every((item) => item.verified) &&
      suppliedEventChecks.every((item) => item.matchesReceipt),
    limitation:
      'Supplied event fields are compared with canonical receipt logs. Full historical completeness requires a complete event scan. Community opinion is advisory, not a safety guarantee.',
  };
}
