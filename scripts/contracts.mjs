import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractRoot = path.join(root, 'packages/contracts');
const requireCore = createRequire(path.join(root, 'packages/core/package.json'));

export function findFoundry(tool = 'forge') {
  const native = process.platform === 'win32' ? `${tool}.exe` : tool;
  const found = spawnSync(native, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  if (found.status === 0) return { command: native, prefix: [], solcArgs: [], cwd: contractRoot };
  if (process.platform === 'win32') {
    for (const folder of ['/root/premortem-tools', '/root/.foundry/bin']) {
      const binary = `${folder}/${tool}`;
      const prefix = ['-d', 'Ubuntu-24.04', '--cd', contractRoot, '--exec'];
      const probe = spawnSync('wsl.exe', [...prefix, binary, '--version'], {
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
      });
      if (probe.status === 0) {
        const compiler = spawnSync(
          'wsl.exe',
          [...prefix, '/root/premortem-tools/solc', '--version'],
          { encoding: 'utf8', timeout: 5000, windowsHide: true },
        );
        return {
          command: 'wsl.exe',
          prefix: [...prefix, binary],
          solcArgs: compiler.status === 0 ? ['--use', '/root/premortem-tools/solc'] : [],
          cwd: contractRoot,
        };
      }
    }
  }
  throw new Error(
    'Foundry unavailable. Install official Foundry (forge/anvil), with Solidity 0.8.39. Windows hosts may use Ubuntu-24.04 WSL. No contract command was run.',
  );
}

function runTool(config, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.command, [...config.prefix, ...args], {
      cwd: config.cwd,
      windowsHide: true,
      stdio: 'inherit',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Foundry command failed with exit ${code}`)),
    );
  });
}

export async function runContracts(mode = 'test') {
  const config = findFoundry();
  const commands = {
    test: ['test', '-vvv', ...config.solcArgs],
    build: ['build', '--build-info', ...config.solcArgs],
    gas: ['test', '--gas-report', ...config.solcArgs],
    snapshot: ['snapshot', '--check', ...config.solcArgs],
    fmt: ['fmt', '--check'],
  };
  if (mode === 'smoke') return smoke(config);
  if (!(mode in commands)) throw new Error(`Unsupported contract command: ${mode}`);
  await runTool(config, commands[mode]);
}

export async function startLocalFixture({ port = 18545, chainId = 56 } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || ![56, 31337].includes(chainId))
    throw new Error('Invalid local fixture port/chain.');
  const forge = findFoundry();
  await runTool(forge, ['test', ...forge.solcArgs]);
  const anvil = findFoundry('anvil');
  const endpoint = `http://127.0.0.1:${port}`;
  const rpc = async (method, params = []) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  };
  // Refuse to reuse another process or touch existing chain state.
  try {
    await rpc('eth_chainId');
    throw new Error(
      `Smoke port${port} already occupied. Stop that local test node before running smoke.`,
    );
  } catch (error) {
    if (String(error).includes('already occupied')) throw error;
  }
  const child = spawn(
    anvil.command,
    [
      ...anvil.prefix,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--chain-id',
      String(chainId),
      '--silent',
    ],
    { cwd: contractRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let processError;
  child.on('error', (error) => {
    processError = error;
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (processError) throw processError;
      try {
        if (BigInt(await rpc('eth_chainId')) === BigInt(chainId)) {
          ready = true;
          break;
        }
      } catch {
        /* wait for startup */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error(`Ephemeral Anvil failed to start on localhost:${port}.`);
    const { encodeAbiParameters, keccak256 } = requireCore('viem');
    const registry = JSON.parse(
      await readFile(
        path.join(contractRoot, 'out/PremortemRegistry.sol/PremortemRegistry.json'),
        'utf8',
      ),
    );
    const mock = JSON.parse(
      await readFile(
        path.join(contractRoot, 'out/PremortemRegistry.t.sol/MockAgentId.json'),
        'utf8',
      ),
    );
    const accounts = await rpc('eth_accounts');
    const registryAddress = '0x0000000000000000000000000000000000001000';
    const identityAddress = '0x60b9262456de011f7d15a54cdd8c48baaa8b022f';
    let runtime = registry.deployedBytecode.object.slice(2);
    const encodedIdentity = identityAddress.slice(2).padStart(64, '0');
    for (const references of Object.values(registry.deployedBytecode.immutableReferences))
      for (const reference of references) {
        if (reference.length !== 32)
          throw new Error('Unexpected immutable length in test fixture.');
        runtime = `${runtime.slice(0, reference.start * 2)}${encodedIdentity}${runtime.slice((reference.start + 32) * 2)}`;
      }
    // TEST ONLY: inject isolated EVM state. No contract-creation transaction is ever broadcast.
    await rpc('anvil_setCode', [identityAddress, mock.deployedBytecode.object]);
    await rpc('anvil_setCode', [registryAddress, `0x${runtime}`]);
    for (const account of accounts.slice(0, 3)) {
      const slot = keccak256(
        encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [account, 0n]),
      );
      await rpc('anvil_setStorageAt', [identityAddress, slot, `0x${'1'.padStart(64, '0')}`]);
    }
    return {
      rpc,
      endpoint,
      registryAddress,
      identityAddress,
      accounts,
      registry,
      close: () => child.kill('SIGTERM'),
    };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

async function smoke() {
  const fixture = await startLocalFixture({ chainId: 31337 });
  const { rpc, accounts, registry, registryAddress } = fixture;
  const { encodeFunctionData, decodeFunctionResult, decodeEventLog } = requireCore('viem');
  try {
    const receipts = [];
    const send = async (from, to, data) => {
      const hash = await rpc('eth_sendTransaction', [
        { from, ...(to ? { to } : {}), data, value: '0x0', gas: '0x7a1200' },
      ]);
      let receipt;
      for (let attempt = 0; attempt < 40; attempt++) {
        receipt = await rpc('eth_getTransactionReceipt', [hash]);
        if (receipt) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (receipt?.status !== '0x1')
        throw new Error(
          `Ephemeral test transaction reverted at ${data.slice(0, 10)}: ${hash} (gas ${receipt?.gasUsed})`,
        );
      receipts.push(receipt);
      return receipt;
    };
    const call = (method, args) =>
      encodeFunctionData({ abi: registry.abi, functionName: method, args });
    const block = await rpc('eth_getBlockByNumber', ['latest', false]);
    const deadline = BigInt(block.timestamp) + 600n;
    const digest = `0x${'11'.repeat(32)}`;
    await send(
      accounts[0],
      registryAddress,
      call('createCapsule', [
        digest,
        digest,
        digest,
        'Local test evidence review',
        deadline,
        deadline,
        2,
        0,
      ]),
    );
    await send(
      accounts[1],
      registryAddress,
      call('addEvidence', [1n, digest, 1, 'Test-only observed allowance authority']),
    );
    await send(accounts[1], registryAddress, call('reviewOpen', [1n, 1, 80, digest, 1]));
    await send(accounts[2], registryAddress, call('reviewOpen', [1n, 1, 90, digest, 1]));
    await rpc('evm_increaseTime', [601]);
    await rpc('evm_mine');
    const finalReceipt = await send(accounts[3], registryAddress, call('finalizeCapsule', [1n]));
    const result = await rpc('eth_call', [
      { to: registryAddress, data: call('getCapsule', [1n]) },
      'latest',
    ]);
    const capsule = decodeFunctionResult({
      abi: registry.abi,
      functionName: 'getCapsule',
      data: result,
    });
    if (capsule.outcome !== 1 || capsule.approvals !== 2)
      throw new Error('Unexpected local review outcome.');
    const finalEvent = decodeEventLog({ abi: registry.abi, ...finalReceipt.logs[0] });
    if (finalEvent.eventName !== 'CapsuleFinalized') throw new Error('Finalization event missing.');
    const report = {
      environment: 'ephemeral-test-only-state-injection',
      chainId: 31337,
      realAgentIdUsed: false,
      deploymentTransactions: 0,
      liveNetworkTransactions: 0,
      workflows: [
        'identity fixture',
        'capsule create',
        'evidence add',
        'two independent open reviews',
        'time boundary',
        'permissionless finalize',
        'state and event verification',
      ],
      transactions: receipts.length,
      passed: 7,
      failed: 0,
    };
    await mkdir(path.join(contractRoot, 'reports'), { recursive: true });
    await writeFile(
      path.join(contractRoot, 'reports/anvil-smoke.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fixture.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runContracts(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
