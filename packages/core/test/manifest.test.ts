import { describe, expect, it } from 'vitest';
import { keccak256, stringToHex, type Address } from 'viem';
import { hashAction, inspectAction, verifyManifest, type RpcClient } from '../src';

const creator = '0x1111111111111111111111111111111111111111' as Address;
const registry = '0x2222222222222222222222222222222222222222' as Address;
const target = '0x3333333333333333333333333333333333333333' as Address;
const salt = keccak256(stringToHex('fixture salt'));
const blockHash = keccak256(stringToHex('fixture block'));
async function prepared() {
  const rpc: RpcClient = {
    request: async ({ method }) => {
      const results: Record<string, unknown> = {
        eth_chainId: '0x38',
        eth_getBlockByNumber: { number: '0x64', hash: blockHash, timestamp: '0x1234' },
        eth_getCode: '0x6001',
        eth_call: '0x',
        eth_estimateGas: '0x5208',
      };
      return results[method];
    },
  };
  const manifest = await inspectAction(
    { from: creator, to: target, data: '0x12345678' },
    { client: rpc },
  );
  const actionHash = hashAction({
    chainId: 56,
    protocol: registry,
    creator,
    target,
    value: 0n,
    data: manifest.action.data,
    salt,
    blockNumber: 100n,
    blockHash,
  });
  return {
    exported: { ...manifest, salt, canonicalAction: actionHash },
    options: {
      registry,
      creator,
      expected: {
        actionHash,
        evidenceRoot: manifest.evidenceRoot,
        simulationHash: manifest.simulationHash,
      },
    },
  };
}
describe('offline anchored manifest verification', () => {
  it('verifies a complete normalized export against all three actual capsule hashes', async () => {
    const { exported, options } = await prepared();
    const result = verifyManifest(JSON.parse(JSON.stringify(exported)), options);
    expect(result.verified).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.checks.sourceMatchesCreator).toBe(true);
  });
  it('rejects unsigned hash comparisons missing on-chain context', async () => {
    const { exported, options } = await prepared();
    const result = verifyManifest(exported, { registry: options.registry, creator });
    expect(result.verified).toBe(false);
    expect(result.checks.onchainComparisonProvided).toBe(false);
  });
  it('rejects a creator/source mismatch rather than rebinding someone else simulation', async () => {
    const { exported, options } = await prepared();
    const result = verifyManifest(exported, { ...options, creator: target });
    expect(result.verified).toBe(false);
    expect(result.checks.sourceMatchesCreator).toBe(false);
  });
  it('rejects changed calldata and historical block context', async () => {
    const { exported, options } = await prepared();
    expect(
      verifyManifest({ ...exported, action: { ...exported.action, data: '0xabcdef12' } }, options)
        .verified,
    ).toBe(false);
    expect(
      verifyManifest({ ...exported, context: { ...exported.context, blockNumber: '101' } }, options)
        .verified,
    ).toBe(false);
  });
  it('rejects changed findings, false selector claims and code metadata', async () => {
    const { exported, options } = await prepared();
    const forged = {
      ...exported,
      findings: exported.findings.map((finding, index) =>
        index ? finding : { ...finding, observed: 'Falsified confidence' },
      ),
    };
    expect(verifyManifest(forged, options).checks.deterministicFindings).toBe(false);
    expect(
      verifyManifest(
        { ...exported, decoded: { ...exported.decoded, functionName: 'approve' } },
        options,
      ).checks.decodedAction,
    ).toBe(false);
    expect(
      verifyManifest({ ...exported, code: { ...exported.code, bytes: 999 } }, options).checks
        .codeMetadata,
    ).toBe(false);
  });
  it('rejects a substituted registry, salt and wrong capsule hashes', async () => {
    const { exported, options } = await prepared();
    expect(verifyManifest(exported, { ...options, registry: target }).verified).toBe(false);
    expect(verifyManifest({ ...exported, salt: blockHash }, options).verified).toBe(false);
    expect(
      verifyManifest(exported, {
        ...options,
        expected: { ...options.expected, evidenceRoot: blockHash },
      }).verified,
    ).toBe(false);
  });
  it('handles malformed, huge, unsafe numeric and zero-salt files without throwing', async () => {
    const { exported, options } = await prepared();
    for (const malformed of [
      null,
      { ...exported, salt: `0x${'00'.repeat(32)}` },
      { ...exported, unwanted: 'secret' },
      { large: 'x'.repeat(1_000_001) },
      { bad: NaN },
    ]) {
      const result = verifyManifest(malformed, options);
      expect(result.verified).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
