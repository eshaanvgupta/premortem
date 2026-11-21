'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPublicClient, fallback, http, parseAbi, keccak256, type Address } from 'viem';
import {
  REGISTRY_ABI,
  syncProtocolEvents,
  FINALITY_BLOCKS,
  type EventScan,
  BSC_CHAIN as bsc,
} from '@premortem/core';
import { AGENT_ID, REGISTRY, DEPLOYMENT_BLOCK, RPC_URLS, EXPECTED_CODE_HASH } from './config';
export const client = createPublicClient({
  chain: bsc,
  transport: fallback(
    RPC_URLS.map((url) => http(url, { timeout: 10000, retryCount: 0 })),
    { rank: false },
  ),
});
export const identityAbi = parseAbi(['function balanceOf(address) view returns(uint256)']);
export async function validateRegistry() {
  if (!REGISTRY)
    throw new Error(
      'No deployed registry configured. Contract deployment requires operator authorization.',
    );
  if ((await client.getChainId()) !== 56)
    throw new Error('RPC network mismatch. Expected chain 56.');
  const code = await client.getCode({ address: REGISTRY });
  if (!code || code === '0x') throw new Error('Configured registry has no bytecode.');
  if (!EXPECTED_CODE_HASH || !/^0x[0-9a-f]{64}$/i.test(EXPECTED_CODE_HASH))
    throw new Error(
      'Expected protocol runtime hash is not configured. Verify the deployment against the tested artifact first.',
    );
  if (keccak256(code).toLowerCase() !== EXPECTED_CODE_HASH.toLowerCase())
    throw new Error('Protocol runtime does not match the configured tested bytecode hash.');
  const identity = await client.readContract({
    address: REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'AGENT_ID',
  });
  if (String(identity).toLowerCase() !== AGENT_ID.toLowerCase())
    throw new Error('Registry does not use the official Agent ID contract.');
  return REGISTRY;
}
export function useChain() {
  const queryClient = useQueryClient();
  const queryKey = ['chain', REGISTRY, DEPLOYMENT_BLOCK?.toString()];
  return useQuery({
    queryKey,
    queryFn: async () => {
      const address = await validateRegistry();
      if (DEPLOYMENT_BLOCK === undefined)
        throw new Error('Deployment block is missing. History cannot be considered complete.');
      const [scan, count] = await Promise.all([
        syncProtocolEvents({
          address,
          fromBlock: DEPLOYMENT_BLOCK,
          rpcUrls: RPC_URLS,
          chunkSize: 1000n,
          maxChunks: 20,
          confirmations: FINALITY_BLOCKS,
          previous: queryClient.getQueryData<EventScan>(queryKey),
          cacheKey: `56:${address}:${DEPLOYMENT_BLOCK}`,
        }),
        client.readContract({ address, abi: REGISTRY_ABI, functionName: 'capsuleCount' }),
      ]);
      return { ...scan, count };
    },
    enabled: Boolean(REGISTRY),
    refetchInterval: 30000,
  });
}
export function useCapsule(id: string) {
  return useQuery({
    queryKey: ['capsule', id, REGISTRY],
    queryFn: async () => {
      const address = await validateRegistry();
      if (!/^\d+$/.test(id) || BigInt(id) < 1n) throw new Error('Invalid capsule ID');
      return client.readContract({
        address,
        abi: REGISTRY_ABI,
        functionName: 'getCapsule',
        args: [BigInt(id)],
      });
    },
    enabled: Boolean(REGISTRY) && /^\d+$/.test(id),
    refetchInterval: 15000,
  });
}
export function useIdentity(address: string) {
  return useQuery({
    queryKey: ['identity', address],
    queryFn: async () => {
      if ((await client.getChainId()) !== 56) throw new Error('RPC network mismatch');
      return client.readContract({
        address: AGENT_ID,
        abi: identityAbi,
        functionName: 'balanceOf',
        args: [address as Address],
      });
    },
    enabled: /^0x[0-9a-fA-F]{40}$/.test(address),
  });
}
