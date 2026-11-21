import { describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  keccak256,
  parseAbiParameters,
  stringToHex,
  type Address,
} from 'viem';
import {
  buildDecisionReceipt,
  COMPETITION_END,
  COMPETITION_START,
  OFFICIAL_AGENT_ID,
  participationStats,
  REGISTRY_ABI,
  scanProtocolEvents,
  syncProtocolEvents,
  verifyReceipt,
  type ProtocolEvent,
  type RpcClient,
} from '../src';

const protocol = '0x2222222222222222222222222222222222222222' as Address;
const actor = '0x1111111111111111111111111111111111111111' as Address;
const blockHash = keccak256(stringToHex('block'));
const txHash = keccak256(stringToHex('transaction'));
const evidenceDigest = keccak256(stringToHex('evidence'));
const topics = encodeEventTopics({
  abi: REGISTRY_ABI,
  eventName: 'ReviewSubmitted',
  args: { capsuleId: 1n, actor, evidenceDigest },
});
const log = {
  address: protocol,
  blockNumber: '0x64',
  blockHash,
  transactionHash: txHash,
  logIndex: '0x0',
  topics,
  data: encodeAbiParameters(parseAbiParameters('uint8,uint8,uint8'), [1, 75, 2]),
};
const event = (changes: Partial<ProtocolEvent> = {}): ProtocolEvent => ({
  eventName: 'ReviewSubmitted',
  args: { actor, capsuleId: 1n, evidenceDigest },
  address: protocol,
  blockNumber: 100n,
  blockHash,
  transactionHash: txHash,
  logIndex: 0,
  timestamp: COMPETITION_START,
  confirmed: true,
  ...changes,
});
function clientFor(overrides: Record<string, unknown | Error> = {}) {
  const responses: Record<string, unknown | Error> = {
    eth_chainId: '0x38',
    eth_blockNumber: '0x80',
    eth_getLogs: [log],
    eth_getBlockByNumber: { hash: blockHash, timestamp: `0x${COMPETITION_START.toString(16)}` },
    eth_getTransactionReceipt: {
      status: '0x1',
      from: actor,
      to: protocol,
      transactionHash: txHash,
      blockNumber: '0x64',
      blockHash,
      logs: [log],
    },
    eth_call: encodeFunctionResult({
      abi: REGISTRY_ABI,
      functionName: 'AGENT_ID',
      result: OFFICIAL_AGENT_ID,
    }),
    ...overrides,
  };
  const request = vi.fn(async ({ method }: { method: string; params?: readonly unknown[] }) => {
    const value = responses[method];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new Error('unsupported');
    return value;
  });
  return { request } satisfies RpcClient;
}

describe('bounded chain event ingestion', () => {
  it('continues past the first page budget while replacing the reorg overlap', async () => {
    const client = clientFor({ eth_getLogs: [] });
    const initial = await scanProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      client,
      chunkSize: 5n,
      maxChunks: 2,
      confirmations: 2n,
    });
    expect(initial.nextBlock).toBe(110n);
    expect(initial.checkpoint?.blockNumber).toBe(109n);
    const next = await syncProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      client,
      previous: initial,
      chunkSize: 5n,
      maxChunks: 2,
      confirmations: 2n,
    });
    expect(next.fromBlock).toBe(100n);
    expect(next.nextBlock).toBe(118n);
    expect(next.coverage).toBe('partial');
    expect(client.request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [{ address: protocol, fromBlock: '0x6c', toBlock: '0x70' }],
    });
  });
  it('restarts at deployment if the saved checkpoint is no longer canonical', async () => {
    const initial = await scanProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      client: clientFor({ eth_getLogs: [] }),
      chunkSize: 5n,
      maxChunks: 2,
    });
    const client = clientFor({
      eth_getLogs: [],
      eth_getBlockByNumber: { hash: evidenceDigest, timestamp: '0x1' },
    });
    const next = await syncProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      previous: initial,
      client,
      chunkSize: 5n,
      maxChunks: 2,
      confirmations: 2n,
    });
    expect(next.nextBlock).toBe(110n);
    expect(client.request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [{ address: protocol, fromBlock: '0x64', toBlock: '0x68' }],
    });
  });
  it('refuses a sync budget that would repeatedly rescan only the overlap', async () => {
    await expect(
      syncProtocolEvents({
        address: protocol,
        fromBlock: 100n,
        client: clientFor(),
        chunkSize: 1n,
        maxChunks: 2,
        confirmations: 2n,
      }),
    ).rejects.toThrow('forward progress');
  });
  it('decodes actual ABI-shaped event bytes and canonical timestamp', async () => {
    const client = clientFor();
    const scan = await scanProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      toBlock: 100n,
      client,
    });
    expect(scan.coverage).toBe('complete');
    expect(scan.events).toHaveLength(1);
    expect(scan.events[0].args.actor).toBe(actor);
    expect(scan.events[0].args.capsuleId).toBe(1n);
    expect(scan.events[0].confirmed).toBe(true);
    expect(scan.events[0].timestamp).toBe(COMPETITION_START);
    expect(client.request).toHaveBeenCalledWith({
      method: 'eth_getLogs',
      params: [{ address: protocol, fromBlock: '0x64', toBlock: '0x64' }],
    });
  });
  it('labels provider log refusal as partial history and preserves continuation', async () => {
    const scan = await scanProtocolEvents({
      address: protocol,
      fromBlock: 90n,
      client: clientFor({ eth_getLogs: new Error('method disabled') }),
    });
    expect(scan.coverage).toBe('partial');
    expect(scan.nextBlock).toBe(90n);
    expect(scan.events).toHaveLength(0);
    expect(scan.errors[0]).toContain('method disabled');
  });
  it('never claims page-budget exhaustion is complete', async () => {
    const scan = await scanProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      client: clientFor({ eth_getLogs: [] }),
      chunkSize: 1n,
      maxChunks: 2,
    });
    expect(scan.coverage).toBe('partial');
    expect(scan.nextBlock).toBe(102n);
  });
  it('detects reorg instead of committing stale page events', async () => {
    const scan = await scanProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      toBlock: 100n,
      client: clientFor({ eth_getBlockByNumber: { hash: evidenceDigest, timestamp: '0x1' } }),
    });
    expect(scan.coverage).toBe('partial');
    expect(scan.events).toHaveLength(0);
    expect(scan.errors[0]).toContain('reorg');
  });
  it('rejects foreign source events and suspected result truncation', async () => {
    const foreign = await scanProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      toBlock: 100n,
      client: clientFor({ eth_getLogs: [{ ...log, address: actor }] }),
    });
    expect(foreign.coverage).toBe('partial');
    expect(foreign.events).toHaveLength(0);
    const capped = await scanProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      toBlock: 100n,
      client: clientFor({ eth_getLogs: Array.from({ length: 1000 }, () => log) }),
    });
    expect(capped.coverage).toBe('partial');
    expect(capped.errors[0]).toContain('cap');
  });
  it('ignores unknown event signatures and removed logs', async () => {
    const scan = await scanProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      toBlock: 100n,
      client: clientFor({
        eth_getLogs: [
          { ...log, removed: true },
          { ...log, topics: [evidenceDigest] },
        ],
      }),
    });
    expect(scan.coverage).toBe('complete');
    expect(scan.events).toHaveLength(0);
  });
  it('requires chain 56 and bounded options', async () => {
    await expect(
      scanProtocolEvents({
        address: protocol,
        fromBlock: 0n,
        client: clientFor({ eth_chainId: '0x1' }),
      }),
    ).rejects.toThrow('mismatch');
    await expect(
      scanProtocolEvents({
        address: protocol,
        fromBlock: 0n,
        chunkSize: 6000n,
        client: clientFor(),
      }),
    ).rejects.toThrow('bounded');
  });
  it('deduplicates repeated logs from a provider', async () => {
    const scan = await scanProtocolEvents({
      address: protocol,
      fromBlock: 100n,
      toBlock: 100n,
      client: clientFor({ eth_getLogs: [log, log] }),
    });
    expect(scan.events).toHaveLength(1);
  });
});

describe('genuine participation metrics', () => {
  it('deduplicates holders and repeated event copies', () => {
    const stats = participationStats([
      event(),
      event(),
      event({ eventName: 'EvidenceAdded', logIndex: 1 }),
    ]);
    expect(stats.uniqueHolders).toBe(1);
    expect(stats.confirmedActions).toBe(2);
    expect(stats.transactions).toBe(1);
    expect(stats.thresholdReached).toBe(false);
  });
  it('excludes permissionless finalizers, pending events and out-of-window actions', () => {
    const stats = participationStats([
      event({ eventName: 'CapsuleFinalized' }),
      event({ confirmed: false, logIndex: 1 }),
      event({ timestamp: COMPETITION_START - 1n, logIndex: 2 }),
      event({ timestamp: COMPETITION_END, logIndex: 3 }),
    ]);
    expect(stats.uniqueHolders).toBe(0);
    expect(stats.pendingActions).toBe(1);
  });
  it('counts exact start as inclusive and end as exclusive', () => {
    expect(participationStats([event()]).uniqueHolders).toBe(1);
    expect(participationStats([event({ timestamp: COMPETITION_END - 1n })]).uniqueHolders).toBe(1);
  });
});

describe('independent transaction receipt verifier', () => {
  it('checks a pinned registry runtime and rejects a substituted deployment', async () => {
    const runtime = '0x60016000';
    const result = await verifyReceipt({
      address: protocol,
      transactionHash: txHash,
      client: clientFor({ eth_getCode: runtime }),
      expectedCodeHash: keccak256(runtime),
    });
    expect(result.verified).toBe(true);
    expect('registryRuntimeVerified' in result && result.registryRuntimeVerified).toBe(true);
    await expect(
      verifyReceipt({
        address: protocol,
        transactionHash: txHash,
        client: clientFor({ eth_getCode: runtime }),
        expectedCodeHash: evidenceDigest,
      }),
    ).rejects.toThrow('pinned deployment');
  });
  function decisionClient() {
    const base = clientFor();
    const capsuleData = encodeFunctionResult({
      abi: REGISTRY_ABI,
      functionName: 'getCapsule',
      result: {
        creator: actor,
        createdAt: COMPETITION_START,
        commitDeadline: COMPETITION_START + 1000n,
        revealDeadline: COMPETITION_START + 2000n,
        minQuorum: 2,
        reviewMode: 1,
        outcome: 0,
        approvals: 1,
        rejections: 0,
        insufficient: 0,
        commitments: 1,
        actionHash: evidenceDigest,
        evidenceRoot: evidenceDigest,
        simulationHash: evidenceDigest,
        label: 'Actual fixture capsule',
      },
    });
    return {
      request: async (args: { method: string; params?: readonly unknown[] }) => {
        if (
          args.method === 'eth_call' &&
          (args.params?.[0] as { data?: string }).data?.startsWith('0x')
        ) {
          const requestData = (args.params?.[0] as { data?: string }).data ?? '';
          if (requestData.length > 10) return capsuleData;
        }
        return base.request(args);
      },
    } satisfies RpcClient;
  }
  it('checks supplied event fields against real receipt inclusion rather than accepting a real transaction hash', async () => {
    const valid = event({
      args: { capsuleId: 1n, actor, evidenceDigest, verdict: 1, confidence: 75, category: 2 },
    });
    const validResult = await buildDecisionReceipt({
      address: protocol,
      capsuleId: 1n,
      events: [valid],
      client: decisionClient(),
    });
    expect(validResult.allSuppliedEventsVerified).toBe(true);
    expect(validResult.creationEvidenceVerified).toBe(false);
    const forged = { ...valid, args: { ...valid.args, verdict: 2 } };
    const forgedResult = await buildDecisionReceipt({
      address: protocol,
      capsuleId: 1n,
      events: [forged],
      client: decisionClient(),
    });
    expect(forgedResult.allSuppliedEventsVerified).toBe(false);
    expect(forgedResult.suppliedEventChecks[0].matchesReceipt).toBe(false);
  });
  it('does not verify missing, unrelated or forged inclusion metadata', async () => {
    const empty = await buildDecisionReceipt({
      address: protocol,
      capsuleId: 1n,
      events: [],
      client: decisionClient(),
    });
    expect(empty.allSuppliedEventsVerified).toBe(false);
    const unrelated = await buildDecisionReceipt({
      address: protocol,
      capsuleId: 1n,
      events: [event({ args: { capsuleId: 99n } })],
      client: decisionClient(),
    });
    expect(unrelated.allSuppliedEventsVerified).toBe(false);
    const tampered = await buildDecisionReceipt({
      address: protocol,
      capsuleId: 1n,
      events: [event({ logIndex: 7 })],
      client: decisionClient(),
    });
    expect(tampered.allSuppliedEventsVerified).toBe(false);
  });
  it('verifies destination, canonical block, identity dependency and ABI event', async () => {
    const result = await verifyReceipt({
      address: protocol,
      transactionHash: txHash,
      client: clientFor(),
      capsuleId: 1n,
    });
    expect(result.verified).toBe(true);
    expect(result.status).toBe('CONFIRMED');
    expect(result.events).toHaveLength(1);
  });
  it('returns pending for no receipt and pending confirmations for near-head block', async () => {
    expect(
      (
        await verifyReceipt({
          address: protocol,
          transactionHash: txHash,
          client: clientFor({ eth_getTransactionReceipt: null }),
        })
      ).status,
    ).toBe('PENDING');
    const result = await verifyReceipt({
      address: protocol,
      transactionHash: txHash,
      client: clientFor({ eth_blockNumber: '0x65' }),
    });
    expect(result.verified).toBe(false);
    expect(result.status).toBe('PENDING_CONFIRMATIONS');
  });
  it('rejects receipt destination and identity substitution', async () => {
    await expect(
      verifyReceipt({ address: actor, transactionHash: txHash, client: clientFor() }),
    ).rejects.toThrow('destination');
    await expect(
      verifyReceipt({
        address: protocol,
        transactionHash: txHash,
        client: clientFor({
          eth_call: encodeFunctionResult({
            abi: REGISTRY_ABI,
            functionName: 'AGENT_ID',
            result: actor,
          }),
        }),
      }),
    ).rejects.toThrow('official Agent ID');
  });
  it('does not verify unrelated capsule events', async () => {
    const result = await verifyReceipt({
      address: protocol,
      transactionHash: txHash,
      client: clientFor(),
      capsuleId: 99n,
    });
    expect(result.verified).toBe(false);
    expect(result.events).toHaveLength(0);
  });
  it('rejects a noncanonical receipt block', async () => {
    await expect(
      verifyReceipt({
        address: protocol,
        transactionHash: txHash,
        client: clientFor({ eth_getBlockByNumber: { hash: evidenceDigest, timestamp: '0x1' } }),
      }),
    ).rejects.toThrow('canonical');
  });
  it('rejects invalid transaction hashes before querying RPC', async () => {
    const client = clientFor();
    await expect(
      verifyReceipt({ address: protocol, transactionHash: '0x1234', client }),
    ).rejects.toThrow('Invalid transaction hash');
    expect(client.request).not.toHaveBeenCalled();
  });
});
