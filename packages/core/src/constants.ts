import { defineChain, getAddress, parseAbi } from 'viem';

export const BSC_CHAIN_ID = 56 as const;
export const OFFICIAL_AGENT_ID = getAddress('0x60b9262456de011f7d15a54cdd8c48baaa8b022f');
export const PROTOCOL_VERSION = 'PREMORTEM/1';
export const RULE_VERSION = 'premortem-rules/1.0.0';
export const DEFAULT_RPC_URLS = [
  'https://bsc-dataseed-public.bnbchain.org',
  'https://bsc-rpc.publicnode.com',
  'https://rpc-bnb.blockmachine.io',
] as const;
export const BSC_CHAIN = defineChain({
  id: BSC_CHAIN_ID,
  name: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: [DEFAULT_RPC_URLS[0]] } },
  blockExplorers: { default: { name: 'BscScan', url: 'https://bscscan.com' } },
});
export const EXPLORER = 'https://bscscan.com';
export const COMPETITION_START = 1794988800n; // 2026-11-18T08:00:00Z
export const COMPETITION_END = 1796803200n; // 2026-12-09T08:00:00Z, exclusive
export const AGENT_ID_ABI = parseAbi(['function balanceOf(address owner) view returns (uint256)']);
export const MAX_CALLDATA_BYTES = 32_768;
export const FINALITY_BLOCKS = 20n;
