import { getAddress, isAddress, type Address } from 'viem';
export const AGENT_ID = getAddress('0x60b9262456de011f7d15a54cdd8c48baaa8b022f');
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const candidate = process.env.NEXT_PUBLIC_PREMORTEM_REGISTRY;
export const REGISTRY: Address | undefined =
  candidate && isAddress(candidate) ? getAddress(candidate) : undefined;
export const EXPECTED_CODE_HASH = process.env.NEXT_PUBLIC_PREMORTEM_CODE_HASH;
export const DEPLOYMENT_BLOCK = /^\d+$/.test(process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK ?? '')
  ? BigInt(process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK!)
  : undefined;
export const RPC_URLS = [
  ...new Set(
    [
      process.env.NEXT_PUBLIC_BSC_RPC_URL,
      'https://bsc-dataseed-public.bnbchain.org',
      'https://bsc-rpc.publicnode.com',
      'https://rpc-bnb.blockmachine.io',
    ].filter(Boolean),
  ),
] as string[];
export const COMPETITION_START = Date.parse('2026-11-18T08:00:00Z') / 1000;
export const COMPETITION_END = Date.parse('2026-12-09T08:00:00Z') / 1000;
export const explorer = (value: string, kind: 'address' | 'tx' = 'address') =>
  `https://bscscan.com/${kind}/${value}`;
export const short = (value: string) =>
  value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
export function json(value: unknown) {
  return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}
export function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([json(value)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
