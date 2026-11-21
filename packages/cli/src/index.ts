#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Command } from 'commander';
import {
  createBscClient,
  inspectAction,
  OFFICIAL_AGENT_ID,
  FINALITY_BLOCKS,
  safeRpcError,
  verifyReceipt,
  toRpcClient,
} from '@premortem/core';
import { formatEther, getAddress, isHex, keccak256, parseAbi, type Address, type Hex } from 'viem';
import { prepareAction } from './action.js';
import { developerMode, previewAndExecute, runBaw, cleanText } from './adapter.js';

const print = (value: unknown): void => {
  stdout.write(
    `${JSON.stringify(value, (_, field: unknown) => (typeof field === 'bigint' ? field.toString() : field), 2)}\n`,
  );
};
const client = () =>
  createBscClient(process.env.BSC_RPC_URL ? [process.env.BSC_RPC_URL] : undefined);
const registryAddress = (): Address => {
  if (!process.env.PREMORTEM_REGISTRY)
    throw new Error(
      'PREMORTEM_REGISTRY is unset. Configure the actual verified mainnet deployment address.',
    );
  return getAddress(process.env.PREMORTEM_REGISTRY);
};
const idAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);
const registryAbi = parseAbi(['function AGENT_ID() view returns (address)']);

async function identityChecks(from: Address, rpc = client()) {
  if ((await rpc.getChainId()) !== 56)
    throw new Error('RPC chain mismatch: official Agent ID must be queried on BSC mainnet 56.');
  const identityCode = await rpc.getCode({ address: OFFICIAL_AGENT_ID });
  if (!identityCode || identityCode === '0x')
    throw new Error('Official Agent ID bytecode unavailable.');
  const balance = await rpc.readContract({
    address: OFFICIAL_AGENT_ID,
    abi: idAbi,
    functionName: 'balanceOf',
    args: [from],
  });
  return { balance, officialAgentIdCodeHash: keccak256(identityCode) };
}

async function protocolChecks(from: Address, requireIdentity: boolean) {
  const rpc = client();
  if ((await rpc.getChainId()) !== 56)
    throw new Error('RPC chain mismatch: BSC mainnet 56 is required.');
  const registry = registryAddress();
  const code = await rpc.getCode({ address: registry });
  if (!code || code === '0x')
    throw new Error('Configured protocol has no bytecode. No transaction can be prepared.');
  const expectedCodeHash = process.env.PREMORTEM_CODE_HASH;
  if (!expectedCodeHash || !/^0x[0-9a-fA-F]{64}$/.test(expectedCodeHash))
    throw new Error(
      'PREMORTEM_CODE_HASH must pin the independently verified deployed runtime bytecode hash.',
    );
  if (keccak256(code).toLowerCase() !== expectedCodeHash.toLowerCase())
    throw new Error('Protocol runtime bytecode hash differs from the authenticated deployment.');
  const identity = await rpc.readContract({
    address: registry,
    abi: registryAbi,
    functionName: 'AGENT_ID',
  });
  if (identity.toLowerCase() !== OFFICIAL_AGENT_ID.toLowerCase())
    throw new Error('Configured protocol uses a nonofficial identity registry.');
  const { balance } = await identityChecks(from, rpc);
  if (requireIdentity && balance === 0n)
    throw new Error(
      'The actual sender does not hold Agent ID. Claim only through Binance App > Wallet > Agent ID banner.',
    );
  return { rpc, registry, balance, runtimeCodeHash: keccak256(code) };
}

async function readAction(file: string) {
  const contents = await readFile(file, 'utf8');
  if (contents.length > 100_000) throw new Error('Action file exceeds 100 KB.');
  return prepareAction(JSON.parse(contents), registryAddress());
}

async function receipt(hash: string) {
  if (!isHex(hash) || hash.length !== 66) throw new Error('Expected a 32-byte transaction hash.');
  const rpc = client();
  if ((await rpc.getChainId()) !== 56) throw new Error('RPC chain mismatch.');
  const tx = await rpc.getTransaction({ hash: hash as Hex });
  if (tx.to?.toLowerCase() !== registryAddress().toLowerCase() || tx.value !== 0n)
    throw new Error('Receipt is not a zero-value transaction to the configured protocol.');
  await protocolChecks(getAddress(tx.from), false);
  const mined = await rpc.waitForTransactionReceipt({
    hash: hash as Hex,
    confirmations: Number(FINALITY_BLOCKS) + 1,
    timeout: 120_000,
  });
  const block = await rpc.getBlock({ blockNumber: mined.blockNumber });
  if (block.hash !== mined.blockHash)
    throw new Error('Receipt block was reorganized. Refresh before relying on it.');
  if (mined.status !== 'success')
    throw new Error(`Transaction reverted: https://bscscan.com/tx/${hash}`);
  const evidence = await verifyReceipt({
    address: registryAddress(),
    transactionHash: hash,
    client: toRpcClient(rpc),
    confirmations: FINALITY_BLOCKS,
    expectedCodeHash: process.env.PREMORTEM_CODE_HASH as Hex,
  });
  if (!evidence.verified) throw new Error(`Receipt evidence not verified: ${evidence.reason}`);
  print({
    status: 'confirmed',
    descendantBlocksRequired: FINALITY_BLOCKS,
    transactionHash: hash,
    blockNumber: mined.blockNumber,
    blockHash: mined.blockHash,
    gasUsed: mined.gasUsed,
    gasCostWei: mined.gasUsed * mined.effectiveGasPrice,
    gasCostBNB: formatEther(mined.gasUsed * mined.effectiveGasPrice),
    eventEvidence: evidence,
    explorer: `https://bscscan.com/tx/${hash}`,
    caution: 'RPC-checked confirmation; this is not a consensus light-client proof.',
  });
}

async function execute(file: string, expectedMethod?: string) {
  // Required before constructing calldata or attempting the wallet preview.
  await developerMode(runBaw);
  const transaction = await readAction(file);
  if (expectedMethod && expectedMethod !== transaction.method)
    throw new Error(
      `This command requires ${expectedMethod}; file contains ${transaction.method}.`,
    );
  const { rpc } = await protocolChecks(
    getAddress(transaction.from),
    transaction.method !== 'finalizeCapsule',
  );
  await rpc.call({
    account: getAddress(transaction.from),
    to: getAddress(transaction.to),
    data: transaction.data as Hex,
    value: 0n,
  });
  const gas = await rpc.estimateGas({
    account: getAddress(transaction.from),
    to: getAddress(transaction.to),
    data: transaction.data as Hex,
    value: 0n,
  });
  const gasPriceWei = await rpc.getGasPrice();
  print({
    gasEstimate: gas,
    gasPriceWei,
    estimatedGasCostWei: gas * gasPriceWei,
    estimatedGasCostBNB: formatEther(gas * gasPriceWei),
    disclaimer: 'Estimate only. Wallet preview is authoritative for the requested signing flow.',
  });
  const result = await previewAndExecute(transaction, {
    runner: runBaw,
    show: print,
    modeChecked: true,
    confirm: async (summary) => {
      if (!stdin.isTTY || !stdout.isTTY)
        throw new Error(
          'Interactive terminal required. No --yes or automated confirmation is supported.',
        );
      const prompt = createInterface({ input: stdin, output: stdout });
      try {
        return (
          (
            await prompt.question(
              `${summary}\nType CONFIRM MAINNET to authorize this exact transaction: `,
            )
          ).trim() === 'CONFIRM MAINNET'
        );
      } finally {
        prompt.close();
      }
    },
  });
  if (result.status === 'BROADCASTED' && result.txHash) await receipt(result.txHash);
}

const program = new Command()
  .name('nexora')
  .description(
    'NEXORA local Agentic Wallet adapter. No custody, no credential storage, no action execution.',
  )
  .version('1.0.0');
program
  .command('doctor')
  .requiredOption('--from <address>', 'Actual locally chosen Agentic Wallet address')
  .action(async ({ from }: { from: string }) => {
    const checks: Record<string, unknown> = {};
    let failed = false;
    try {
      const rpc = client();
      checks.chainId = await rpc.getChainId();
      if (checks.chainId !== 56) throw new Error('Expected mainnet chain 56.');
    } catch (error) {
      failed = true;
      checks.rpcError = cleanText(safeRpcError(error));
    }
    try {
      const sender = getAddress(from);
      const result = await identityChecks(sender);
      checks.identity = {
        holderAddress: sender,
        officialAgentId: OFFICIAL_AGENT_ID,
        officialAgentIdCodeHash: result.officialAgentIdCodeHash,
        agentIdBalance: result.balance,
        holdsAgentId: result.balance > 0n,
        ...(result.balance === 0n
          ? {
              access: 'READ_ONLY',
              onboarding: 'Claim only in Binance App > Wallet homepage > Agent ID banner.',
            }
          : {}),
      };
    } catch (error) {
      failed = true;
      checks.identityError = cleanText(safeRpcError(error));
    }
    try {
      const result = await protocolChecks(getAddress(from), false);
      checks.registry = result.registry;
      checks.protocolRuntimeCodeHash = result.runtimeCodeHash;
      checks.protocolStatus = 'MATCHES_PINNED_RUNTIME';
    } catch (error) {
      failed = true;
      checks.protocolError = cleanText(safeRpcError(error));
    }
    try {
      checks.developerMode = await developerMode(runBaw);
    } catch (error) {
      failed = true;
      checks.walletError = cleanText(safeRpcError(error));
    }
    print(checks);
    if (failed) process.exitCode = 1;
  });
program
  .command('inspect')
  .requiredOption('--to <address>')
  .requiredOption('--from <address>')
  .option('--data <hex>', 'Exact calldata', '0x')
  .option('--value <wei>', 'Integer wei', '0')
  .action(async (options: { to: string; from: string; data: string; value: string }) =>
    print(
      await inspectAction(options, {
        rpcUrls: process.env.BSC_RPC_URL ? [process.env.BSC_RPC_URL] : undefined,
      }),
    ),
  );
program
  .command('execute')
  .requiredOption('--file <path>', 'Narrowly scoped protocol action JSON')
  .action(async ({ file }: { file: string }) => execute(file));
program
  .command('receipt')
  .requiredOption('--hash <hash>')
  .action(async ({ hash }: { hash: string }) => receipt(hash));
const capsule = program.command('capsule');
capsule
  .command('prepare')
  .requiredOption('--file <path>')
  .action(async ({ file }: { file: string }) => {
    const transaction = await readAction(file);
    const { rpc } = await protocolChecks(
      getAddress(transaction.from),
      transaction.method !== 'finalizeCapsule',
    );
    await rpc.call({
      account: getAddress(transaction.from),
      to: getAddress(transaction.to),
      value: 0n,
      data: transaction.data as Hex,
    });
    const gasEstimate = await rpc.estimateGas({
      account: getAddress(transaction.from),
      to: getAddress(transaction.to),
      value: 0n,
      data: transaction.data as Hex,
    });
    const gasPriceWei = await rpc.getGasPrice();
    print({
      ...transaction,
      gasEstimate,
      gasPriceWei,
      estimatedGasCostWei: gasEstimate * gasPriceWei,
      estimatedGasCostBNB: formatEther(gasEstimate * gasPriceWei),
      note: 'Prepared only; no signing. Zero BNB transfer plus network gas.',
    });
  });
for (const [name, method] of [
  ['create', 'createCapsule'],
  ['finalize', 'finalizeCapsule'],
] as const)
  capsule
    .command(name)
    .requiredOption('--file <path>')
    .action(async ({ file }: { file: string }) => execute(file, method));
const review = program.command('review');
for (const [name, method] of [
  ['open', 'reviewOpen'],
  ['commit', 'commitReview'],
  ['reveal', 'revealReview'],
] as const)
  review
    .command(name)
    .requiredOption('--file <path>')
    .action(async ({ file }: { file: string }) => execute(file, method));
program
  .command('evidence')
  .command('add')
  .requiredOption('--file <path>')
  .action(async ({ file }: { file: string }) => execute(file, 'addEvidence'));
program.parseAsync().catch((error: unknown) => {
  stdout.write(`ERROR: ${cleanText(safeRpcError(error))}\n`);
  process.exitCode = 1;
});
