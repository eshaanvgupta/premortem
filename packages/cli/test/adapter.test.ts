import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { toFunctionSelector, type Abi, type AbiFunction } from 'viem';
import {
  assertPreviewMatches,
  developerMode,
  previewAndExecute,
  redact,
  type ProtocolTransaction,
  type Runner,
} from '../src/adapter.js';
import { prepareAction, writeAbi } from '../src/action.js';

const now = 1_800_000_000_000;
const mode = {
  success: true,
  data: { devMode: { enabled: true, expiresAt: now / 1000 + 1000, balanceExceeded: false } },
};
const preview = {
  success: true,
  data: {
    requestId: 'request-id',
    parsedTx: {
      transactionType: 'ContractCall',
      contractAddress: '0x2222222222222222222222222222222222222222',
      amount: '0',
    },
    risks: { riskDetails: [] },
    simulationResult: { simulationCode: '000000000', authorityChanges: [] },
    expiresAt: now + 60_000,
    requireConfirmation: false,
  },
};
const tx: ProtocolTransaction = {
  chainId: 56,
  from: '0x1111111111111111111111111111111111111111',
  to: '0x2222222222222222222222222222222222222222',
  value: '0',
  data: '0x1234',
  method: 'finalizeCapsule',
  args: ['1'],
  calldataHash: `0x${'aa'.repeat(32)}`,
};
function runnerFor(responses: unknown[]): Runner & ReturnType<typeof vi.fn> {
  let index = 0;
  return vi.fn(async () => responses[index++]) as Runner & ReturnType<typeof vi.fn>;
}
const execute = (runner: Runner, confirm = async () => true, clock = () => now) =>
  previewAndExecute(tx, { runner, show: vi.fn(), confirm, now: clock });

describe('official local wallet boundary', () => {
  it('requires enabled, unexpired developer mode before preview', async () => {
    const runner = runnerFor([{ success: true, data: { devMode: { enabled: false } } }]);
    await expect(execute(runner)).rejects.toThrow('Developer Mode');
    expect(runner).toHaveBeenCalledTimes(1);
  });
  it('treats settings expiresAt as seconds', async () => {
    await expect(developerMode(runnerFor([mode]), now)).resolves.toEqual({
      enabled: true,
      expiresAt: now / 1000 + 1000,
    });
  });
  it('rejects expired mode', async () => {
    await expect(
      developerMode(
        runnerFor([
          { success: true, data: { devMode: { enabled: true, expiresAt: now / 1000 - 1 } } },
        ]),
        now,
      ),
    ).rejects.toThrow();
  });
  it('rejects unknown expiry', async () => {
    await expect(
      developerMode(
        runnerFor([{ success: true, data: { devMode: { enabled: true, expiresAt: null } } }]),
        now,
      ),
    ).rejects.toThrow();
  });
  it('rejects exceeded balance cap', async () => {
    await expect(
      developerMode(
        runnerFor([
          {
            success: true,
            data: { devMode: { enabled: true, expiresAt: now / 1000 + 50, balanceExceeded: true } },
          },
        ]),
        now,
      ),
    ).rejects.toThrow();
  });
  it('does not execute failed preview', async () => {
    const runner = runnerFor([
      mode,
      { success: false, error: { code: 351803, message: 'High risk transaction' } },
    ]);
    await expect(execute(runner)).rejects.toThrow('351803: High risk transaction');
    expect(runner).toHaveBeenCalledTimes(2);
  });
  it('does not execute unsupported simulation', async () => {
    const runner = runnerFor([
      mode,
      { ...preview, data: { ...preview.data, simulationResult: { simulationCode: 'FAILED' } } },
    ]);
    await expect(execute(runner)).rejects.toThrow('simulation failed');
    expect(runner).toHaveBeenCalledTimes(2);
  });
  it('requires explicit consent even when requireConfirmation false', async () => {
    const runner = runnerFor([mode, preview]);
    const confirm = vi.fn(async () => false);
    await expect(execute(runner, confirm)).rejects.toThrow('User rejected');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledTimes(2);
  });
  it('checks expiry before confirmation', async () => {
    const runner = runnerFor([mode, { ...preview, data: { ...preview.data, expiresAt: now - 1 } }]);
    const confirm = vi.fn(async () => true);
    await expect(execute(runner, confirm)).rejects.toThrow('expired');
    expect(confirm).not.toHaveBeenCalled();
  });
  it('checks expiry after confirmation', async () => {
    let time = now;
    const runner = runnerFor([mode, preview]);
    await expect(
      execute(
        runner,
        async () => {
          time += 100_000;
          return true;
        },
        () => time,
      ),
    ).rejects.toThrow('expired during');
    expect(runner).toHaveBeenCalledTimes(2);
  });
  it('rechecks settings and executes only the successful preview request ID', async () => {
    const runner = runnerFor([
      mode,
      preview,
      mode,
      { success: true, data: { status: 'BROADCASTED', txHash: `0x${'11'.repeat(32)}` } },
    ]);
    await expect(execute(runner)).resolves.toMatchObject({ status: 'BROADCASTED' });
    expect(runner.mock.calls[1]?.[0]).toEqual([
      'contract-call',
      'preview',
      '--binanceChainId',
      '56',
      '--from',
      tx.from,
      '--to',
      tx.to,
      '--value',
      '0',
      '--inputData',
      tx.data,
      '--json',
    ]);
    expect(runner.mock.calls[3]?.[0]).toEqual([
      'contract-call',
      'execute',
      '--requestId',
      'request-id',
      '--json',
    ]);
  });
  it('preserves pending App confirmation without claiming broadcast', async () => {
    const runner = runnerFor([
      mode,
      preview,
      mode,
      { success: true, data: { status: 'PENDING_CONFIRMATION', txHash: null, orderId: 'order-1' } },
    ]);
    await expect(execute(runner)).resolves.toMatchObject({
      status: 'PENDING_CONFIRMATION',
      txHash: null,
    });
    expect(runner).toHaveBeenCalledTimes(4);
  });
  it('never retries ambiguous execute failure', async () => {
    const runner = runnerFor([
      mode,
      preview,
      mode,
      { success: false, error: { message: 'Preview expired' } },
    ]);
    await expect(execute(runner)).rejects.toThrow('Preview expired');
    expect(runner).toHaveBeenCalledTimes(4);
  });
  it('redacts credential fields recursively and strips terminal escapes', () => {
    expect(
      redact({ sessionToken: 'secret', data: { privateKey: 'key', note: '\u001b[31mHELLO' } }),
    ).toEqual({
      sessionToken: '[REDACTED]',
      data: { privateKey: '[REDACTED]', note: '[31mHELLO' },
    });
  });
  it('rejects opaque parsed previews before asking or executing', async () => {
    const runner = runnerFor([mode, { ...preview, data: { ...preview.data, parsedTx: {} } }]);
    const confirm = vi.fn(async () => true);
    await expect(execute(runner, confirm)).rejects.toThrow('Unsupported wallet preview');
    expect(confirm).not.toHaveBeenCalled();
    expect(runner).toHaveBeenCalledTimes(2);
  });
  it('rejects destination substitution even with a successful wallet preview', async () => {
    const runner = runnerFor([
      mode,
      {
        ...preview,
        data: { ...preview.data, parsedTx: { ...preview.data.parsedTx, contractAddress: tx.from } },
      },
    ]);
    await expect(execute(runner)).rejects.toThrow('differs');
    expect(runner).toHaveBeenCalledTimes(2);
  });
  it.each(['from', 'sender', 'fromAddress'])('checks optional source field %s', (field) => {
    expect(() => assertPreviewMatches({ ...preview.data.parsedTx, [field]: tx.to }, tx)).toThrow(
      'differs',
    );
  });
  it.each(['inputData', 'data', 'calldata'])('checks optional raw bytes field %s', (field) => {
    expect(() =>
      assertPreviewMatches({ ...preview.data.parsedTx, [field]: '0xabcdef' }, tx),
    ).toThrow('calldata differs');
  });
  it('checks optional chain IDs and rejects nonzero or malformed amounts', () => {
    for (const value of [1, '1', '-0', '0.0', '900719925474099300000'])
      expect(() => assertPreviewMatches({ ...preview.data.parsedTx, amount: value }, tx)).toThrow(
        'not zero',
      );
    expect(() => assertPreviewMatches({ ...preview.data.parsedTx, chainId: 97 }, tx)).toThrow(
      'network differs',
    );
    expect(() =>
      assertPreviewMatches({ ...preview.data.parsedTx, binanceChainId: '1' }, tx),
    ).toThrow('network differs');
  });
  it('rejects asset-operation parsing and maximum-authority indicators', () => {
    for (const transactionType of ['Send', 'Transfer', 'Approve', 'Swap', 'Permit'])
      expect(() => assertPreviewMatches({ ...preview.data.parsedTx, transactionType }, tx)).toThrow(
        'asset/authority',
      );
    expect(() => assertPreviewMatches({ ...preview.data.parsedTx, isMax: true }, tx)).toThrow(
      'asset/authority',
    );
  });
  it('compares all available fields while accepting integer-zero formats', () => {
    expect(() =>
      assertPreviewMatches(
        {
          transactionType: 'ContractCall',
          to: tx.to,
          contractAddress: tx.to,
          amount: '0',
          value: '0x00',
          from: tx.from,
          sender: tx.from,
          recipient: tx.to,
          inputData: tx.data,
          chainId: 56,
          binanceChainId: '56',
        },
        tx,
      ),
    ).not.toThrow();
  });
});

const hash = `0x${'ab'.repeat(32)}`;
const action = {
  version: 'premortem-action/1',
  chainId: 56,
  registry: tx.to,
  from: tx.from,
  method: 'finalizeCapsule',
  args: ['9007199254740993'],
  value: '0',
};
describe('action files', () => {
  it('matches every write selector against the compiled Solidity ABI', () => {
    const compiled = JSON.parse(
      readFileSync(new URL('../../contracts/abi/PremortemRegistry.json', import.meta.url), 'utf8'),
    ) as Abi;
    for (const method of writeAbi) {
      const target = compiled.find(
        (entry): entry is AbiFunction => entry.type === 'function' && entry.name === method.name,
      );
      expect(target, method.name).toBeDefined();
      expect(toFunctionSelector(target!)).toBe(toFunctionSelector(method));
      expect(target?.stateMutability).toBe('nonpayable');
    }
  });
  it('encodes uint256 without floating point precision loss', () => {
    const prepared = prepareAction(action);
    expect(prepared.data.endsWith('0020000000000001')).toBe(true);
  });
  it('rejects numeric uint256', () => {
    expect(() => prepareAction({ ...action, args: [9007199254740992] })).toThrow();
  });
  it('rejects asset transfer methods', () => {
    expect(() => prepareAction({ ...action, method: 'transfer' })).toThrow();
  });
  it('rejects nonzero value', () => {
    expect(() => prepareAction({ ...action, value: '1' })).toThrow();
  });
  it('rejects substituted calldata', () => {
    expect(() => prepareAction({ ...action, data: '0x1234' })).toThrow('does not match');
  });
  it('rejects substituted calldata hashes', () => {
    expect(() => prepareAction({ ...action, calldataHash: hash })).toThrow('hash mismatch');
  });
  it('rejects unexpected fields and alternate chains', () => {
    expect(() => prepareAction({ ...action, chainId: 97 })).toThrow();
    expect(() => prepareAction({ ...action, privateKey: 'secret' })).toThrow();
  });
  it('rejects registry substitution', () => {
    expect(() => prepareAction(action, tx.from as `0x${string}`)).toThrow('differs');
  });
  it('rejects malicious control and bidi labels', () => {
    expect(() =>
      prepareAction({ ...action, method: 'addEvidence', args: ['1', hash, 0, 'line\u202eattack'] }),
    ).toThrow();
  });
  it('encodes all protocol write paths', () => {
    const entries = [
      [
        'createCapsule',
        [hash, hash, hash, 'Approve allowance review', '1900000000', '1900000300', 2, 1],
      ],
      ['addEvidence', ['1', hash, 0, 'Observation one']],
      ['reviewOpen', ['1', 0, 80, hash, 0]],
      ['commitReview', ['1', hash]],
      ['revealReview', ['1', 2, 80, hash, hash, 1]],
      ['finalizeCapsule', ['1']],
    ];
    for (const [method, args] of entries)
      expect(prepareAction({ ...action, method, args }).data.length).toBeGreaterThan(10);
  });
});
