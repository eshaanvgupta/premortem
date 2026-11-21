import { decodeEventLog, type Address, type Hex } from 'viem';
import { REGISTRY_ABI } from './abi';
import { assertBsc, createBscClient, safeRpcError, toRpcClient, type RpcClient } from './client';
import { COMPETITION_END, COMPETITION_START, FINALITY_BLOCKS } from './constants';
import { addressSchema } from './schema';

export interface ProtocolEvent {
  eventName: string;
  args: Record<string, unknown>;
  address: Address;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: number;
  timestamp: bigint;
  confirmed: boolean;
}
export interface EventScan {
  chainId: 56;
  address: Address;
  events: ProtocolEvent[];
  coverage: 'complete' | 'partial';
  fromBlock: bigint;
  toBlock: bigint;
  latestBlock: bigint;
  confirmedThrough: bigint;
  nextBlock: bigint;
  errors: string[];
  checkpoint: { blockNumber: bigint; blockHash: Hex } | null;
}
interface RawLog {
  address: string;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: Hex;
  removed?: boolean;
}
export interface ScanOptions {
  address: string;
  fromBlock: bigint;
  toBlock?: bigint;
  client?: RpcClient;
  rpcUrls?: readonly string[];
  chunkSize?: bigint;
  maxChunks?: number;
  confirmations?: bigint;
}
export const hexQuantity = (value: bigint): Hex => `0x${value.toString(16)}`;
export async function scanProtocolEvents(options: ScanOptions): Promise<EventScan> {
  const address = addressSchema.parse(options.address);
  const client = options.client ?? toRpcClient(createBscClient(options.rpcUrls));
  await assertBsc(client);
  const head = await client.request({ method: 'eth_blockNumber' });
  if (typeof head !== 'string') throw new Error('RPC returned invalid latest block');
  const latestBlock = BigInt(head);
  const confirmations = options.confirmations ?? FINALITY_BLOCKS;
  const confirmedThrough = latestBlock > confirmations ? latestBlock - confirmations : 0n;
  const toBlock =
    options.toBlock === undefined
      ? latestBlock
      : options.toBlock < latestBlock
        ? options.toBlock
        : latestBlock;
  const fromBlock = options.fromBlock;
  const step = options.chunkSize ?? 2_000n;
  const maxChunks = options.maxChunks ?? 50;
  if (
    fromBlock < 0n ||
    fromBlock > toBlock ||
    step < 1n ||
    step > 5_000n ||
    !Number.isInteger(maxChunks) ||
    maxChunks < 1 ||
    maxChunks > 1000 ||
    confirmations < 0n
  )
    throw new Error('Invalid bounded scan options');
  const events: ProtocolEvent[] = [];
  const errors: string[] = [];
  const anchor = (await client.request({
    method: 'eth_getBlockByNumber',
    params: [hexQuantity(toBlock), false],
  })) as { hash?: Hex } | null;
  if (!anchor?.hash || !/^0x[0-9a-f]{64}$/i.test(anchor.hash))
    throw new Error('No canonical scan anchor');
  const timestamps = new Map<string, bigint>();
  let nextBlock = fromBlock;
  for (let page = 0; nextBlock <= toBlock && page < maxChunks; page++) {
    const end = nextBlock + step - 1n < toBlock ? nextBlock + step - 1n : toBlock;
    try {
      const response = await client.request({
        method: 'eth_getLogs',
        params: [{ address, fromBlock: hexQuantity(nextBlock), toBlock: hexQuantity(end) }],
      });
      if (!Array.isArray(response)) throw new Error('RPC returned non-array logs');
      // Large result sets can indicate a provider response cap; never present them as complete history.
      if (response.length >= 1_000)
        throw new Error('Possible provider log cap reached; retry with smaller block chunks');
      const pageEvents: ProtocolEvent[] = [];
      for (const raw of response as RawLog[]) {
        if (raw.removed) continue;
        if (
          raw.address?.toLowerCase() !== address.toLowerCase() ||
          !raw.blockHash ||
          !raw.transactionHash ||
          !raw.blockNumber ||
          !raw.logIndex
        )
          throw new Error('RPC returned malformed or foreign event');
        const blockNumber = BigInt(raw.blockNumber);
        if (blockNumber < nextBlock || blockNumber > end)
          throw new Error('RPC event outside requested block range');
        let parsed;
        try {
          parsed = decodeEventLog({
            abi: REGISTRY_ABI,
            data: raw.data,
            topics: raw.topics as [Hex, ...Hex[]],
            strict: true,
          });
        } catch {
          continue;
        } // Unknown event signatures are not protocol participation.
        const key = `${raw.blockNumber}:${raw.blockHash}`;
        let timestamp = timestamps.get(key);
        if (timestamp === undefined) {
          const block = (await client.request({
            method: 'eth_getBlockByNumber',
            params: [raw.blockNumber, false],
          })) as { hash?: string; timestamp?: string } | null;
          if (
            !block ||
            block.hash?.toLowerCase() !== raw.blockHash.toLowerCase() ||
            !block.timestamp
          )
            throw new Error('Event block reorg or unavailable; resync required');
          timestamp = BigInt(block.timestamp);
          timestamps.set(key, timestamp);
        }
        pageEvents.push({
          eventName: parsed.eventName,
          args: parsed.args as unknown as Record<string, unknown>,
          address,
          blockNumber,
          blockHash: raw.blockHash,
          transactionHash: raw.transactionHash,
          logIndex: Number(BigInt(raw.logIndex)),
          timestamp,
          confirmed: blockNumber <= confirmedThrough,
        });
      }
      events.push(...pageEvents);
      nextBlock = end + 1n;
    } catch (error) {
      errors.push(`Blocks ${nextBlock}-${end}: ${safeRpcError(error)}`);
      break;
    }
  }
  if (nextBlock <= toBlock && errors.length === 0)
    errors.push('Scan page budget reached. Continue from nextBlock; displayed history is partial.');
  const finalAnchor = (await client.request({
    method: 'eth_getBlockByNumber',
    params: [hexQuantity(toBlock), false],
  })) as { hash?: string } | null;
  if (finalAnchor?.hash?.toLowerCase() !== anchor.hash.toLowerCase()) {
    events.length = 0;
    nextBlock = fromBlock;
    errors.push(
      'Scan anchor changed during ingestion; discard mixed-fork observations and resync.',
    );
  }
  let checkpoint: EventScan['checkpoint'] = null;
  if (nextBlock > fromBlock) {
    try {
      const block = (await client.request({
        method: 'eth_getBlockByNumber',
        params: [hexQuantity(nextBlock - 1n), false],
      })) as { hash?: Hex } | null;
      if (!block?.hash || !/^0x[0-9a-f]{64}$/i.test(block.hash))
        throw new Error('Missing canonical checkpoint block');
      checkpoint = { blockNumber: nextBlock - 1n, blockHash: block.hash };
    } catch (error) {
      errors.push(`Checkpoint unavailable: ${safeRpcError(error)}`);
    }
  }
  const unique = new Map(
    events.map((event) => [`${event.blockHash}:${event.transactionHash}:${event.logIndex}`, event]),
  );
  return {
    chainId: 56,
    address,
    events: [...unique.values()].sort((a, b) =>
      a.blockNumber < b.blockNumber
        ? -1
        : a.blockNumber > b.blockNumber
          ? 1
          : a.logIndex - b.logIndex,
    ),
    coverage: nextBlock > toBlock ? 'complete' : 'partial',
    fromBlock,
    toBlock,
    latestBlock,
    confirmedThrough,
    nextBlock,
    errors,
    checkpoint,
  };
}

/** Continue a bounded scan and replace the reorg overlap rather than repeatedly starting at deployment. */
export async function syncProtocolEvents(
  options: ScanOptions & { previous?: EventScan | null; cacheKey?: string },
): Promise<EventScan> {
  const client = options.client ?? toRpcClient(createBscClient(options.rpcUrls));
  await assertBsc(client);
  const address = addressSchema.parse(options.address);
  let previous =
    options.previous ??
    (options.cacheKey ? await readCachedPublicScan(options.cacheKey, client) : null);
  if (
    previous &&
    (previous.chainId !== 56 ||
      previous.address?.toLowerCase() !== address.toLowerCase() ||
      previous.fromBlock !== options.fromBlock ||
      previous.nextBlock < options.fromBlock ||
      !previous.checkpoint)
  )
    previous = null;
  if (previous?.checkpoint) {
    const block = (await client.request({
      method: 'eth_getBlockByNumber',
      params: [hexQuantity(previous.checkpoint.blockNumber), false],
    })) as { hash?: string } | null;
    if (block?.hash?.toLowerCase() !== previous.checkpoint.blockHash.toLowerCase()) previous = null;
  }
  const overlap = options.confirmations ?? FINALITY_BLOCKS;
  if ((options.chunkSize ?? 2_000n) * BigInt(options.maxChunks ?? 50) <= overlap)
    throw new Error('Sync scan budget must exceed the finality overlap to make forward progress');
  const resume = previous
    ? previous.nextBlock > overlap
      ? previous.nextBlock - overlap
      : options.fromBlock
    : options.fromBlock;
  const fromBlock = resume > options.fromBlock ? resume : options.fromBlock;
  const fresh = await scanProtocolEvents({ ...options, client, fromBlock });
  if (!previous) {
    if (options.cacheKey)
      try {
        await cachePublicScan(options.cacheKey, fresh);
      } catch {
        fresh.errors.push('Optional public cache unavailable; live chain results remain usable.');
      }
    return fresh;
  }
  const prefix = previous.events
    .filter(
      (event) =>
        event.blockNumber < fromBlock && event.address.toLowerCase() === address.toLowerCase(),
    )
    .map((event) => ({ ...event, confirmed: event.blockNumber <= fresh.confirmedThrough }));
  const result = { ...fresh, fromBlock: options.fromBlock, events: [...prefix, ...fresh.events] };
  if (options.cacheKey)
    try {
      await cachePublicScan(options.cacheKey, result);
    } catch {
      result.errors.push('Optional public cache unavailable; live chain results remain usable.');
    }
  return result;
}

export function participationStats(
  events: readonly ProtocolEvent[],
  options: { start?: bigint; end?: bigint } = {},
) {
  const start = options.start ?? COMPETITION_START;
  const end = options.end ?? COMPETITION_END;
  const holderActions = new Set([
    'CapsuleCreated',
    'EvidenceAdded',
    'ReviewSubmitted',
    'ReviewCommitted',
    'ReviewRevealed',
  ]);
  const deduped = [
    ...new Map(
      events.map((event) => [
        `${event.blockHash}:${event.transactionHash}:${event.logIndex}`,
        event,
      ]),
    ).values(),
  ];
  const confirmed = deduped.filter(
    (event) =>
      event.confirmed &&
      event.timestamp >= start &&
      event.timestamp < end &&
      holderActions.has(event.eventName),
  );
  const addresses = [
    ...new Set(
      confirmed
        .map((event) => String(event.args.actor).toLowerCase())
        .filter((actor) => /^0x[0-9a-f]{40}$/.test(actor)),
    ),
  ].sort();
  return {
    uniqueHolders: addresses.length,
    addresses,
    confirmedActions: confirmed.length,
    pendingActions: deduped.filter(
      (event) =>
        !event.confirmed &&
        event.timestamp >= start &&
        event.timestamp < end &&
        holderActions.has(event.eventName),
    ).length,
    transactions: [...new Set(confirmed.map((event) => event.transactionHash))].length,
    threshold: 30,
    thresholdReached: addresses.length >= 30,
    start: start.toString(),
    end: end.toString(),
    limitation:
      'Distinct holder addresses in observed protocol events; not proof of unique people or organizer recognition. Completeness depends on scan coverage and deployment authenticity.',
  };
}

/** Cache only public logs. Always rescan the finality overlap; never add stale cached counts to new scans. */
export async function cachePublicScan(key: string, scan: EventScan): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('scans', 'readwrite');
      tx.objectStore('scans').put(
        JSON.stringify(scan, (_, value: unknown) =>
          typeof value === 'bigint' ? { $bigint: value.toString() } : value,
        ),
        key,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function readCachedPublicScan(
  key: string,
  client: RpcClient,
): Promise<EventScan | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openCache();
  try {
    const serialized = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('scans', 'readonly');
      const request = tx.objectStore('scans').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (typeof serialized !== 'string') return null;
    const scan = JSON.parse(serialized, (_, value: unknown) =>
      value && typeof value === 'object' && '$bigint' in value
        ? BigInt(String((value as { $bigint: unknown }).$bigint))
        : value,
    ) as EventScan;
    await assertBsc(client);
    if (
      scan.chainId !== 56 ||
      !scan.address ||
      !scan.checkpoint ||
      !Array.isArray(scan.events) ||
      scan.checkpoint.blockNumber !== scan.nextBlock - 1n
    )
      return null;
    const block = (await client.request({
      method: 'eth_getBlockByNumber',
      params: [hexQuantity(scan.checkpoint.blockNumber), false],
    })) as { hash?: string } | null;
    if (block?.hash?.toLowerCase() !== scan.checkpoint.blockHash.toLowerCase()) return null;
    return scan;
  } catch {
    return null;
  } finally {
    db.close();
  }
}
function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('premortem-public-chain-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('scans');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
