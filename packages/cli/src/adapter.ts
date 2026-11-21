import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { z } from 'zod';

export type Runner = (args: readonly string[]) => Promise<unknown>;
export type Presenter = (value: unknown) => void;
export type Confirmation = (summary: string) => Promise<boolean>;

/** Spawn the trusted, locally installed baw executable. Never invoke a shell. */
export const runBaw: Runner = (args) =>
  new Promise((resolve, reject) => {
    let executable = 'baw';
    let commandArgs = [...args];
    if (process.platform === 'win32' || process.env.BAW_CLI_JS) {
      // Windows cannot safely spawn npm .cmd shims without a shell. Resolve the
      // official package's JS entry and run Node directly instead.
      const configured = process.env.BAW_CLI_JS;
      if (configured && (!isAbsolute(configured) || !configured.endsWith('.js'))) {
        reject(
          new Error(
            'BAW_CLI_JS must be an absolute path to the trusted official CLI JavaScript entry.',
          ),
        );
        return;
      }
      const script =
        configured ??
        (process.env.PATH ?? '')
          .split(delimiter)
          .flatMap((directory) => [
            join(directory, 'node_modules', '@binance', 'agentic-wallet', 'dist', 'index.js'),
            join(directory, '..', '@binance', 'agentic-wallet', 'dist', 'index.js'),
          ])
          .find(existsSync);
      if (!script || !existsSync(script)) {
        reject(
          new Error(
            'Official baw JS entry not found. Install the official skill/CLI in your trusted environment, or set local BAW_CLI_JS to its absolute dist/index.js path.',
          ),
        );
        return;
      }
      executable = process.execPath;
      commandArgs = [script, ...args];
    }
    const child = spawn(executable, commandArgs, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let bytes = 0;
    const limit = 2 * 1024 * 1024;
    child.stdout.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > limit) {
        child.kill();
        reject(new Error('baw response exceeded 2 MiB; output suppressed.'));
      } else output += data.toString('utf8');
    });
    // Do not echo raw stderr: an authentication failure may include sensitive context.
    child.stderr.resume();
    const timeout = setTimeout(() => child.kill(), 120_000);
    child.on('error', () => {
      clearTimeout(timeout);
      reject(
        new Error(
          'Unable to start trusted local baw CLI. Install and configure the official Binance skill in your own agent environment.',
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      try {
        const result: unknown = JSON.parse(output);
        if (code !== 0) {
          assertSuccess(result);
          throw new Error('baw failed; raw process output suppressed.');
        }
        resolve(result);
      } catch (error) {
        reject(
          error instanceof SyntaxError
            ? new Error('baw did not return valid JSON; output suppressed.')
            : error,
        );
      }
    });
  });

const envelope = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({ code: z.union([z.string(), z.number()]).optional(), message: z.string().optional() })
    .optional(),
});
export function assertSuccess(response: unknown): unknown {
  const parsed = envelope.parse(response);
  if (!parsed.success)
    throw new Error(
      `baw ${parsed.error?.code ?? 'ERROR'}: ${cleanText(parsed.error?.message ?? 'Request refused')}`,
    );
  return parsed.data;
}

export function cleanText(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return (
        code > 31 &&
        !(code >= 127 && code <= 159) &&
        !(code >= 0x202a && code <= 0x202e) &&
        !(code >= 0x2066 && code <= 0x2069)
      );
    })
    .join('')
    .slice(0, 4000);
}

/** Only allowlisted preview fields reach the terminal; auth envelopes are never logged. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[depth limit]';
  if (typeof value === 'string') return cleanText(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => redact(entry, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, entry]) => [
          cleanText(key),
          /private|secret|session|token$|password|credential|clientid|pairing|authorization/i.test(
            key,
          )
            ? '[REDACTED]'
            : redact(entry, depth + 1),
        ]),
    );
  return value;
}

const modeSchema = z.object({
  devMode: z.object({
    enabled: z.literal(true),
    expiresAt: z.number().int().positive(),
    balanceExceeded: z.boolean().optional(),
  }),
});
export async function developerMode(
  runner: Runner,
  now = Date.now(),
): Promise<{ enabled: true; expiresAt: number }> {
  const parsed = modeSchema.safeParse(
    assertSuccess(await runner(['wallet', 'settings', '--json'])),
  );
  if (
    !parsed.success ||
    parsed.data.devMode.expiresAt * 1000 <= now ||
    parsed.data.devMode.balanceExceeded === true
  ) {
    throw new Error(
      'Developer Mode is disabled, expired, over its balance cap, or its response is unsupported. Open Binance App > Agentic Wallet > Settings > Developer Mode; review the warning and enable it yourself, then retry.',
    );
  }
  return { enabled: true, expiresAt: parsed.data.devMode.expiresAt };
}

const previewSchema = z.object({
  requestId: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9_.:-]+$/),
  parsedTx: z.record(z.string(), z.unknown()),
  risks: z.record(z.string(), z.unknown()),
  simulationResult: z
    .object({
      simulationCode: z.string(),
      simulationErrorDetail: z.unknown().optional(),
      authorityChanges: z.unknown().optional(),
    })
    .passthrough(),
  expiresAt: z.number().int().positive(),
  requireConfirmation: z.boolean(),
});
const executionSchema = z.object({
  status: z.string(),
  txHash: z.string().nullable().optional(),
  orderId: z.string().optional(),
  message: z.string().nullable().optional(),
});
export interface ProtocolTransaction {
  from: string;
  to: string;
  data: string;
  value: '0';
  chainId: 56;
  method: string;
  args: unknown[];
  calldataHash: string;
}

/** The official guide does not promise raw-transaction echoes. Validate all
 * recognized fields that are present and require parsed destination + zero
 * amount. A future/opaque shape is blocked until explicitly supported. The
 * returned requestId is still a trusted-wallet-backend binding, not a proof. */
export function assertPreviewMatches(
  parsed: Record<string, unknown>,
  transaction: ProtocolTransaction,
): void {
  const present = (keys: string[]) =>
    keys.filter((key) => parsed[key] !== undefined && parsed[key] !== null);
  const destination = present(['contractAddress', 'to']);
  const amount = present(['amount', 'value']);
  if (destination.length === 0 || amount.length === 0)
    throw new Error(
      'Unsupported wallet preview: cannot verify destination and zero transfer value. Nothing executed.',
    );
  const matchAddress = (field: string, expected: string) => {
    if (
      typeof parsed[field] !== 'string' ||
      !/^0x[0-9a-fA-F]{40}$/.test(parsed[field] as string) ||
      (parsed[field] as string).toLowerCase() !== expected.toLowerCase()
    )
      throw new Error(
        `Wallet preview ${field} differs from the exact prepared transaction. Execution blocked.`,
      );
  };
  for (const field of destination) matchAddress(field, transaction.to);
  for (const field of present(['from', 'sender', 'fromAddress']))
    matchAddress(field, transaction.from);
  for (const field of present(['recipient'])) matchAddress(field, transaction.to);
  for (const field of amount) {
    const value = parsed[field];
    if (!(value === 0 || (typeof value === 'string' && /^(?:0+|0x0+)$/i.test(value))))
      throw new Error(`Wallet preview ${field} is not zero. Execution blocked.`);
  }
  for (const field of present(['chainId', 'binanceChainId'])) {
    const value = parsed[field];
    if (!(value === 56 || value === '56' || value === '0x38'))
      throw new Error('Wallet preview network differs from BSC mainnet. Execution blocked.');
  }
  for (const field of present(['inputData', 'data', 'calldata'])) {
    if (
      typeof parsed[field] !== 'string' ||
      (parsed[field] as string).toLowerCase() !== transaction.data.toLowerCase()
    )
      throw new Error(
        'Wallet preview calldata differs from exact prepared bytes. Execution blocked.',
      );
  }
  if (
    parsed.isMax === true ||
    (typeof parsed.transactionType === 'string' &&
      /(?:send|transfer|approv|swap|deploy|permit)/i.test(parsed.transactionType))
  )
    throw new Error(
      'Wallet parsed an asset/authority operation rather than a protocol review. Execution blocked.',
    );
}

/** Does not retry execute: an ambiguous response must never cause duplicate signing. */
export async function previewAndExecute(
  transaction: ProtocolTransaction,
  dependencies: {
    runner: Runner;
    show: Presenter;
    confirm: Confirmation;
    now?: () => number;
    modeChecked?: boolean;
  },
): Promise<{ status: string; txHash?: string | null; orderId?: string; message?: string | null }> {
  const now = dependencies.now ?? Date.now;
  if (!dependencies.modeChecked) await developerMode(dependencies.runner, now());
  dependencies.show({
    network: 'BNB Smart Chain mainnet',
    ...transaction,
    note: 'Zero BNB transferred; network gas is paid. Advisory review only. This does not execute the proposed action.',
  });
  const preview = previewSchema.parse(
    assertSuccess(
      await dependencies.runner([
        'contract-call',
        'preview',
        '--binanceChainId',
        '56',
        '--from',
        transaction.from,
        '--to',
        transaction.to,
        '--value',
        '0',
        '--inputData',
        transaction.data,
        '--json',
      ]),
    ),
  );
  dependencies.show(
    redact({
      parsedTx: preview.parsedTx,
      risks: preview.risks,
      simulationResult: preview.simulationResult,
      authorityChanges: preview.simulationResult.authorityChanges,
      expiresAt: preview.expiresAt,
      requireAppConfirmation: preview.requireConfirmation,
    }),
  );
  assertPreviewMatches(preview.parsedTx, transaction);
  dependencies.show({
    bindingLimit:
      'Only fields echoed by the official wallet are compared. The official preview request ID binds omitted raw fields on its trusted backend; this is not an independently verifiable signed-transaction proof.',
  });
  if (
    preview.simulationResult.simulationCode !== '000000000' ||
    preview.simulationResult.simulationErrorDetail
  )
    throw new Error(
      'Wallet preview simulation failed or returned an unsupported result. Execution blocked.',
    );
  if (preview.expiresAt <= now())
    throw new Error(
      'Preview expired. Run the command again for a new preview and fresh confirmation.',
    );
  const accepted = await dependencies.confirm(
    `Authorize ${transaction.method} on BSC MAINNET at ${transaction.to}, value 0 BNB plus gas, calldata ${transaction.calldataHash}?`,
  );
  if (!accepted) throw new Error('User rejected; nothing executed.');
  if (preview.expiresAt <= now())
    throw new Error(
      'Preview expired during confirmation. Run the command again; fresh confirmation is required.',
    );
  // Recheck after the human prompt; Developer Mode can expire while the prompt is open.
  await developerMode(dependencies.runner, now());
  const execution = executionSchema.parse(
    assertSuccess(
      await dependencies.runner([
        'contract-call',
        'execute',
        '--requestId',
        preview.requestId,
        '--json',
      ]),
    ),
  );
  if (execution.status === 'PENDING_CONFIRMATION') {
    dependencies.show({
      status: execution.status,
      orderId: execution.orderId,
      message:
        'Confirm in the Binance App. No confirmed chain receipt yet. Do not execute the same preview again. Use receipt --hash after the App supplies a transaction hash.',
    });
    return execution;
  }
  if (execution.status !== 'BROADCASTED' || !/^0x[0-9a-fA-F]{64}$/.test(execution.txHash ?? ''))
    throw new Error(
      `Wallet returned ${cleanText(execution.status)}; no confirmed transaction. Do not retry execute blindly. Check your official wallet history.`,
    );
  return execution;
}
