import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { toEventSelector, toFunctionSelector, type Abi } from 'viem';
import { hashAction, REGISTRY_ABI, reviewCommitment } from '../src';

describe('compiled contract interoperability', () => {
  it('every SDK method and event matches compiled Solidity selectors and data layout', () => {
    const compiled = JSON.parse(
      readFileSync(new URL('../../contracts/abi/PremortemRegistry.json', import.meta.url), 'utf8'),
    ) as Abi;
    const selectors = new Set(
      compiled.flatMap((item) =>
        item.type === 'function'
          ? [toFunctionSelector(item)]
          : item.type === 'event'
            ? [toEventSelector(item)]
            : [],
      ),
    );
    for (const item of REGISTRY_ABI) {
      if (item.type === 'function') expect(selectors.has(toFunctionSelector(item))).toBe(true);
      if (item.type === 'event') expect(selectors.has(toEventSelector(item))).toBe(true);
    }
    const sdkCapsule = REGISTRY_ABI.find(
      (item) => item.type === 'function' && item.name === 'getCapsule',
    );
    const compiledCapsule = compiled.find(
      (item) => item.type === 'function' && item.name === 'getCapsule',
    );
    if (sdkCapsule?.type !== 'function' || compiledCapsule?.type !== 'function')
      throw new Error('Missing getCapsule');
    const normalize = (value: unknown) =>
      JSON.parse(
        JSON.stringify(value, (key, entry: unknown) =>
          key === 'internalType' || (key === 'name' && entry === '') ? undefined : entry,
        ),
      );
    expect(normalize(compiledCapsule.outputs)).toEqual(normalize(sdkCapsule.outputs));
  });
  it('matches shared cross-language hashing vectors', () => {
    const a = '0x1111111111111111111111111111111111111111';
    const b = '0x2222222222222222222222222222222222222222';
    const d = `0x${'11'.repeat(32)}` as const;
    expect(
      hashAction({
        chainId: 56,
        protocol: a,
        creator: b,
        target: a,
        value: 123n,
        data: '0x12345678',
        salt: d,
        blockNumber: 123456n,
        blockHash: d,
      }),
    ).toBe('0x706ec86672d5285a3a477fb1d3f412f4d0bcb173ffbaf64568241056d5ae7485');
    expect(
      reviewCommitment({
        chainId: 56,
        protocol: a,
        capsuleId: 1n,
        reviewer: b,
        verdict: 1,
        confidence: 80,
        evidenceDigest: d,
        category: 2,
        salt: d,
      }),
    ).toBe('0x3815e9d19be7c66bb1b0f88d3119f9c41c55eab299ea6e45aa8ec5738aceea33');
  });
});
