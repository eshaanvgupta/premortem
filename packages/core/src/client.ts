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
