import { createPublicClient, fallback, http } from 'viem';
import { BSC_CHAIN, DEFAULT_RPC_URLS } from './constants';

export interface RpcClient {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
}
export function createBscClient(rpcUrls: readonly string[] = DEFAULT_RPC_URLS) {
  if (rpcUrls.length === 0) throw new Error('At least one RPC endpoint is required');
  for (const raw of rpcUrls) {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      throw new Error('RPC must be an HTTP(S) URL without embedded credentials');
  }
  return createPublicClient({
    chain: BSC_CHAIN,
    transport: fallback(
      rpcUrls.map((url) => http(url, { timeout: 12_000, retryCount: 1 })),
      { rank: false, retryCount: 0 },
    ),
  });
}
/** Official dataseed hosts document disabled logs and can return misleading empty arrays. */
export function logRpcUrls(rpcUrls: readonly string[] = DEFAULT_RPC_URLS): string[] {
  const supported = rpcUrls.filter(
    (raw) =>
      !/^bsc-dataseed(?:[0-9]+|-public)?\.(?:bnbchain\.org|binance\.org)$/i.test(
        new URL(raw).hostname,
      ),
  );
  if (!supported.length)
    throw new Error(
      'Configure a log-capable BSC RPC. Official dataseed endpoints are excluded from event indexing.',
    );
  return supported;
}
export function createBscLogClient(rpcUrls?: readonly string[]) {
  return createBscClient(logRpcUrls(rpcUrls));
}
export function toRpcClient(client: unknown): RpcClient {
  return client as RpcClient;
}
export async function assertBsc(client: RpcClient): Promise<void> {
  const chain = await client.request({ method: 'eth_chainId' });
  if (typeof chain !== 'string' || BigInt(chain) !== 56n)
    throw new Error(`RPC network mismatch: expected chain 56, received ${String(chain)}`);
}
export function safeRpcError(error: unknown): string {
  // Provider error strings may contain credential-bearing URLs; retain only a short redacted message.
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/[^\s"'<>]+/g, '[RPC endpoint]')
    .replace(/(?:api[_-]?key|token|authorization)[=: ]+[^\s,]+/gi, '[redacted]')
    .slice(0, 600);
}
