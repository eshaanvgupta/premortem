import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { encodeFunctionData, keccak256, stringToHex, type Address, type Hex } from 'viem';
import {
  actionSchema,
  bytes32Schema,
  canonicalJson,
  createBscClient,
  decodeAction,
  hashAction,
  hashManifest,
  inspectAction,
  KNOWN_ACTION_ABI,
  MAX_CALLDATA_BYTES,
  publicLabel,
  reviewCommitment,
  safeRpcError,
  type RpcClient,
} from '../src';

const from = '0x1111111111111111111111111111111111111111' as Address;
const to = '0x2222222222222222222222222222222222222222' as Address;
const other = '0x3333333333333333333333333333333333333333' as Address;
const digest = keccak256(stringToHex('evidence'));
const blockHash = keccak256(stringToHex('block'));
const salt = keccak256(stringToHex('private random salt in real usage'));
function testClient(overrides: Record<string, unknown | Error> = {}) {
  const responses: Record<string, unknown | Error> = {
    eth_chainId: '0x38',
    eth_getBlockByNumber: { number: '0x123', hash: blockHash, timestamp: '0x654321' },
    eth_getCode: '0x60016000',
    eth_call: '0x',
    eth_estimateGas: '0x5208',
    ...overrides,
  };
  const request = vi.fn(async ({ method }: { method: string; params?: readonly unknown[] }) => {
    const value = responses[method];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new Error('unsupported method');
    return value;
  });
  return { request } satisfies RpcClient;
}

describe('validation and canonical evidence', () => {
  it('normalizes addresses, calldata and defaults without number precision loss', () => {
    const parsed = actionSchema.parse({
      from,
      to,
      data: '0xABCDEF',
      value: (2n ** 255n).toString(),
    });
    expect(parsed.data).toBe('0xabcdef');
    expect(parsed.value).toBe((2n ** 255n).toString());
    expect(parsed.chainId).toBe(56);
  });
  it.each(['0x1', '1234', '0xz1', `0x${'ff'.repeat(MAX_CALLDATA_BYTES + 1)}`])(
    'rejects malformed or oversized calldata case %#',
    (data) => expect(() => actionSchema.parse({ from, to, data })).toThrow(),
  );
  it.each(['-1', '01', '1.2', '1e3', (2n ** 256n).toString()])('rejects invalid wei %s', (value) =>
    expect(() => actionSchema.parse({ from, to, value })).toThrow(),
  );
  it('rejects incorrect chain, checksum and unknown secret-shaped fields', () => {
    expect(() => actionSchema.parse({ from, to, chainId: 97 })).toThrow();
    expect(() =>
      actionSchema.parse({ from, to: '0x60b9262456dE011F7d15a54CdD8c48bAaa8B022F' }),
    ).toThrow();
    expect(() => actionSchema.parse({ from, to, privateKey: 'not accepted' })).toThrow();
  });
  it('rejects zero digest, controls, Unicode, blank and long public labels', () => {
    expect(() => bytes32Schema.parse(`0x${'00'.repeat(32)}`)).toThrow();
    for (const value of ['', 'hello\nworld', 'risk\u202E', 'a'.repeat(97)])
      expect(() => publicLabel(value)).toThrow();
  });
  it('canonicalizes key order and nested objects', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: '3' } })).toBe('{"a":{"x":"3","y":2},"z":1}');
    expect(hashManifest({ a: 1, b: [true, null] })).toBe(hashManifest({ b: [true, null], a: 1 }));
  });
  it.each([NaN, Infinity, 9007199254740992, undefined, new Date()])(
    'rejects noncanonical input %s',
    (value) => expect(() => canonicalJson(value)).toThrow(),
  );
  it('does not lose integer precision across arbitrary uint256 strings', () =>
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 2n ** 256n - 1n }), (value) => {
        expect(actionSchema.parse({ from, to, value: value.toString() }).value).toBe(
          value.toString(),
        );
        expect(canonicalJson({ value })).toBe(`{"value":"${value}"}`);
      }),
      { numRuns: 250 },
    ));
  it('JSON parsing dangerous keys cannot mutate object prototypes', () => {
    expect(canonicalJson(JSON.parse('{"__proto__":{"polluted":true},"a":1}'))).toBe(
      '{"__proto__":{"polluted":true},"a":1}',
    );
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('domain-separated hashing', () => {
  const action = {
    chainId: 56,
    protocol: to,
    creator: from,
    target: other,
    value: 0n,
    data: '0x12345678' as Hex,
    salt,
    blockNumber: 100n,
    blockHash,
  };
  const review = {
    chainId: 56,
    protocol: to,
    capsuleId: 1n,
    reviewer: from,
    verdict: 1,
    confidence: 75,
    evidenceDigest: digest,
    category: 2,
    salt,
  };
  it('action binds all contextual identity and payload fields', () => {
    const original = hashAction(action);
    for (const changes of [
      { chainId: 97 },
      { protocol: other },
      { creator: other },
      { target: from },
      { value: 1n },
      { data: '0x' as Hex },
      { salt: digest },
      { blockNumber: 101n },
      { blockHash: digest },
    ])
      expect(hashAction({ ...action, ...changes })).not.toBe(original);
  });
  it('review commitment binds chain, contract, capsule, reviewer and every disclosed field', () => {
    const original = reviewCommitment(review);
    for (const changes of [
      { chainId: 97 },
      { protocol: other },
      { capsuleId: 2n },
      { reviewer: other },
      { verdict: 2 },
      { confidence: 74 },
      { evidenceDigest: salt },
      { category: 1 },
      { salt: digest },
    ])
      expect(reviewCommitment({ ...review, ...changes })).not.toBe(original);
  });
  it('hashes are stable across repeated values', () =>
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), (confidence) => {
        expect(reviewCommitment({ ...review, confidence })).toBe(
          reviewCommitment({ ...review, confidence }),
        );
      }),
    ));
});

describe('selector intelligence', () => {
  it('detects exact allowance amount and makes no ABI authenticity claim', () => {
    const data = encodeFunctionData({
      abi: KNOWN_ACTION_ABI,
      functionName: 'approve',
      args: [other, 2n ** 256n - 1n],
    });
    const decoded = decodeAction(data);
    expect(decoded.functionName).toBe('approve');
    expect(decoded.args[1]).toBe((2n ** 256n - 1n).toString());
    expect(decoded.abiVerified).toBe(false);
  });
  it('marks unknown, empty and malformed selectors explicitly', () => {
    expect(decodeAction('0x12345678').status).toBe('UNKNOWN');
    expect(decodeAction('0x').status).toBe('EMPTY');
    expect(decodeAction('0x095ea7b3').status).toBe('MALFORMED');
    expect(decodeAction('0x12').status).toBe('MALFORMED');
  });
  it('arbitrary bytes always have explicit decode status', () =>
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        const data =
          `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}` as Hex;
        expect(['KNOWN_SELECTOR', 'UNKNOWN', 'EMPTY', 'MALFORMED']).toContain(
          decodeAction(data).status,
        );
      }),
      { numRuns: 250 },
    ));
});

describe('read-only deterministic preflight', () => {
  it('uses exact sender target value data and historical block for both simulations', async () => {
    const client = testClient();
    const result = await inspectAction({ from, to, value: '123', data: '0x12345678' }, { client });
    const tx = { from, to, value: '0x7b', data: '0x12345678' };
    expect(client.request).toHaveBeenCalledWith({ method: 'eth_call', params: [tx, '0x123'] });
    expect(client.request).toHaveBeenCalledWith({
      method: 'eth_estimateGas',
      params: [tx, '0x123'],
    });
    expect(result.context.blockNumber).toBe('291');
    expect(result.simulation.trace.status).toBe('UNAVAILABLE');
    expect(
      result.findings.every(
        (finding) => finding.source && finding.ruleVersion && finding.limitations,
      ),
    ).toBe(true);
    expect(result.evidenceRoot).toBe(hashManifest(result.findings));
  });
  it('fails closed on wrong network before reading code or simulating', async () => {
    const client = testClient({ eth_chainId: '0x61' });
    await expect(inspectAction({ from, to }, { client })).rejects.toThrow('network mismatch');
    expect(client.request).toHaveBeenCalledTimes(1);
  });
  it('rejects absent or malformed block context', async () => {
    await expect(
      inspectAction({ from, to }, { client: testClient({ eth_getBlockByNumber: null }) }),
    ).rejects.toThrow('block context');
  });
  it('unlimited approval remains critical even when eth_call succeeds', async () => {
    const data = encodeFunctionData({
      abi: KNOWN_ACTION_ABI,
      functionName: 'approve',
      args: [other, 2n ** 256n - 1n],
    });
    const result = await inspectAction({ from, to, data }, { client: testClient() });
    expect(result.findings.find((finding) => finding.id === 'authority.allowance')?.severity).toBe(
      'critical',
    );
    expect(result.decoded.abiVerified).toBe(false);
  });
  it('fails RPC simulation to UNKNOWN without a safe fallback', async () => {
    const result = await inspectAction(
      { from, to },
      {
        client: testClient({
          eth_call: new Error('execution reverted'),
          eth_estimateGas: new Error('unsupported'),
        }),
      },
    );
    expect(result.simulation.call.status).toBe('FAILURE');
    expect(result.findings.find((finding) => finding.id === 'rpc.call')?.severity).toBe('unknown');
    expect(result.findings.find((finding) => finding.id === 'rpc.gas')?.severity).toBe('unknown');
  });
  it('rejects malformed successful provider responses', async () => {
    const result = await inspectAction(
      { from, to },
      { client: testClient({ eth_call: { safe: true }, eth_estimateGas: 'not gas' }) },
    );
    expect(result.simulation.call.status).toBe('FAILURE');
    expect(result.simulation.estimateGas.status).toBe('FAILURE');
  });
  it('warns on false token return and no-code target', async () => {
    const data = encodeFunctionData({
      abi: KNOWN_ACTION_ABI,
      functionName: 'transfer',
      args: [other, 1n],
    });
    const result = await inspectAction(
      { from, to, data },
      { client: testClient({ eth_getCode: '0x', eth_call: `0x${'0'.repeat(64)}` }) },
    );
    expect(result.findings.some((finding) => finding.id === 'rpc.false-return')).toBe(true);
    expect(result.findings.find((finding) => finding.id === 'rpc.code')?.severity).toBe('warning');
  });
  it('detects recipient mismatch, operator authority and admin changes', async () => {
    const transfer = await inspectAction(
      {
        from,
        to,
        data: encodeFunctionData({
          abi: KNOWN_ACTION_ABI,
          functionName: 'transfer',
          args: [other, 1n],
        }),
        expectedRecipient: from,
      },
      { client: testClient() },
    );
    expect(transfer.findings.some((finding) => finding.id === 'assets.recipient-mismatch')).toBe(
      true,
    );
    const approval = await inspectAction(
      {
        from,
        to,
        data: encodeFunctionData({
          abi: KNOWN_ACTION_ABI,
          functionName: 'setApprovalForAll',
          args: [other, true],
        }),
      },
      { client: testClient() },
    );
    expect(approval.findings.find((finding) => finding.id === 'authority.operator')?.severity).toBe(
      'critical',
    );
    const admin = await inspectAction(
      {
        from,
        to,
        data: encodeFunctionData({
          abi: KNOWN_ACTION_ABI,
          functionName: 'transferOwnership',
          args: [other],
        }),
        value: '1',
      },
      { client: testClient() },
    );
    expect(admin.findings.some((finding) => finding.id === 'authority.admin')).toBe(true);
    expect(admin.findings.some((finding) => finding.id === 'value.nonpayable')).toBe(true);
  });
  it('redacts provider URLs and credentials in error artifacts', () =>
    expect(
      safeRpcError(new Error('failed https://rpc.example/key-secret api_key=secret token:abc')),
    ).not.toContain('key-secret'));
  it('does not accept credential-bearing or non HTTP RPC URLs', () => {
    expect(() => createBscClient(['file:///etc/passwd'])).toThrow();
    expect(() => createBscClient(['https://user:pass@example.org'])).toThrow();
    expect(() => createBscClient([])).toThrow();
  });
});
