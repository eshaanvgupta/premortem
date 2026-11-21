import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runContracts } from './contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractRoot = path.join(root, 'packages/contracts');
const requireCore = createRequire(path.join(root, 'packages/core/package.json'));
const { getAddress, keccak256, encodeAbiParameters, encodeFunctionData, parseAbi } =
  requireCore('viem');
const official = getAddress('0x60b9262456de011f7d15a54cdd8c48baaa8b022f');
const endpoint = process.env.BSC_RPC_URL || 'https://bsc-dataseed-public.bnbchain.org';
const rpcUrl = new URL(endpoint);
if (!['https:', 'http:'].includes(rpcUrl.protocol) || rpcUrl.username || rpcUrl.password)
  throw new Error('Use an HTTP(S) RPC endpoint without embedded credentials.');

async function rpc(method, params = []) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

function assertSafeAbi(abi) {
  const expected = new Set([
    'ACTION_TYPEHASH',
    'AGENT_ID',
    'MAX_PHASE',
    'MIN_PHASE',
    'OFFICIAL_AGENT_ID',
    'REVIEW_TYPEHASH',
    'VERSION_HASH',
    'addEvidence',
    'capsuleCount',
    'commitReview',
    'createCapsule',
    'finalizeCapsule',
    'getCapsule',
    'getReviewTotals',
    'hasCommitted',
    'hasReviewed',
    'hashAction',
    'revealReview',
    'reviewCommitment',
    'reviewOpen',
  ]);
  for (const entry of abi) {
    if (
      entry.type === 'fallback' ||
      entry.type === 'receive' ||
      entry.stateMutability === 'payable'
    )
      throw new Error('Unexpected payable/fallback surface.');
    if (entry.type === 'function' && !expected.delete(entry.name))
      throw new Error(`Unexpected contract method: ${entry.name}`);
  }
  if (expected.size) throw new Error('Compiled ABI is missing expected methods.');
}

async function networkChecks() {
  if (BigInt(await rpc('eth_chainId')) !== 56n)
    throw new Error('Refusing: RPC must report BSC mainnet chain56.');
  const code = await rpc('eth_getCode', [official, 'latest']);
  if (code === '0x' || !/^0x[0-9a-f]+$/i.test(code))
    throw new Error('Official Agent ID code unavailable.');
  // Nonzero neutral probe: ERC721 balanceOf(address(0)) may revert. No user identity claim is inferred.
  const probe = '0x1111111111111111111111111111111111111111';
  const balanceData = encodeFunctionData({
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: [probe],
  });
  const balance = await rpc('eth_call', [
    { to: official, gas: '0x186a0', data: balanceData },
    'latest',
  ]);
  if (!/^0x[0-9a-f]{64}$/i.test(balance))
    throw new Error('Official Agent ID balanceOf returned malformed ABI data.');
  return {
    officialAgentId: official,
    officialAgentIdCodeHash: keccak256(code),
    balanceOfInterfaceChecked: true,
    balanceProbe: probe,
    probeEstablishesUserIdentity: false,
    gasPriceWei: BigInt(await rpc('eth_gasPrice')).toString(),
    headBlock: BigInt(await rpc('eth_blockNumber')).toString(),
  };
}

function officialRuntime(artifact) {
  let runtime = artifact.deployedBytecode.object.slice(2);
  const encodedId = official.toLowerCase().slice(2).padStart(64, '0');
  for (const references of Object.values(artifact.deployedBytecode.immutableReferences))
    for (const reference of references) {
      if (reference.length !== 32) throw new Error('Unexpected immutable reference length.');
      runtime = `${runtime.slice(0, reference.start * 2)}${encodedId}${runtime.slice((reference.start + reference.length) * 2)}`;
    }
  return `0x${runtime}`;
}

async function main() {
  const mode = process.argv[2];
  if (mode !== 'prepare' && mode !== 'verify')
    throw new Error('Use prepare or verify. This tool never signs or broadcasts.');
  await runContracts('test');
  await runContracts('build');
  const artifact = JSON.parse(
    await readFile(
      path.join(contractRoot, 'out/PremortemRegistry.sol/PremortemRegistry.json'),
      'utf8',
    ),
  );
  assertSafeAbi(artifact.abi);
  if (
    artifact.metadata.compiler.version !== '0.8.39+commit.ce47f2c8' ||
    artifact.metadata.settings.optimizer.runs !== 200 ||
    artifact.metadata.settings.evmVersion !== 'paris'
  )
    throw new Error('Compiler/settings mismatch.');
  const network = await networkChecks();
  if (mode === 'prepare') {
    const bundle = path.join(root, 'release/mainnet');
    await mkdir(bundle, { recursive: true });
    const constructorArgs = encodeAbiParameters([{ type: 'address' }], [official]);
    let gasEstimate = null;
    let gasEstimateStatus = 'DEPLOYER_ADDRESS required for sender-specific estimate';
    if (process.env.DEPLOYER_ADDRESS) {
      const from = getAddress(process.env.DEPLOYER_ADDRESS);
      try {
        gasEstimate = BigInt(
          await rpc('eth_estimateGas', [
            { from, data: `${artifact.bytecode.object}${constructorArgs.slice(2)}`, value: '0x0' },
          ]),
        ).toString();
        gasEstimateStatus = 'RPC estimate only; no transaction sent';
      } catch (error) {
        gasEstimateStatus = error.message;
      }
    }
    const report = {
      protocolVersion: 'PREMORTEM/1',
      state: 'PREPARED_NOT_DEPLOYED',
      chainId: 56,
      address: null,
      transactionHash: null,
      explorerVerification: 'NOT_DONE',
      ...network,
      compiler: artifact.metadata.compiler.version,
      optimizerRuns: 200,
      evmVersion: 'paris',
      expectedRuntimeCodeHash: keccak256(officialRuntime(artifact)),
      adminPowers: [],
      payableMethods: [],
      gasEstimate,
      gasEstimateStatus,
      estimatedFeeWei: gasEstimate
        ? (BigInt(gasEstimate) * BigInt(network.gasPriceWei)).toString()
        : null,
      approvedForBroadcast: false,
      remaining: [
        'Operator authorization for deployment',
        'Funded local keystore or hardware signer',
        'Successful deployment receipt',
        'BscScan source verification',
        'Actual Agent ID holder consent and wallet write smoke',
        'Public source/site publication approval',
      ],
    };
    await copyFile(
      path.join(contractRoot, 'src/PremortemRegistry.sol'),
      path.join(bundle, 'PremortemRegistry.sol'),
    );
    await writeFile(path.join(bundle, 'abi.json'), `${JSON.stringify(artifact.abi, null, 2)}\n`);
    const { compilationTarget: _target, ...settings } = artifact.metadata.settings;
    const standard = {
      language: 'Solidity',
      sources: {
        'src/PremortemRegistry.sol': {
          content: await readFile(path.join(contractRoot, 'src/PremortemRegistry.sol'), 'utf8'),
        },
      },
      settings: {
        ...settings,
        outputSelection: {
          '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'] },
        },
      },
    };
    await writeFile(
      path.join(bundle, 'standard-input.json'),
      `${JSON.stringify(standard, null, 2)}\n`,
    );
    await writeFile(
      path.join(bundle, 'constructor-arguments.txt'),
      `${constructorArgs.slice(2)}\n`,
    );
    await writeFile(path.join(bundle, 'readiness.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const manifestFile =
    process.env.DEPLOYMENT_MANIFEST || path.join(contractRoot, 'deployments/mainnet.json');
  let manifest;
  if (process.env.DEPLOYMENT_TRANSACTION) {
    if (!/^0x[0-9a-f]{64}$/i.test(process.env.DEPLOYMENT_TRANSACTION)) {
      throw new Error('DEPLOYMENT_TRANSACTION must be a32-byte confirmed deployment hash.');
    }
    const candidateReceipt = await rpc('eth_getTransactionReceipt', [
      process.env.DEPLOYMENT_TRANSACTION,
    ]);
    if (!candidateReceipt?.contractAddress || candidateReceipt.status !== '0x1') {
      throw new Error('DEPLOYMENT_TRANSACTION has no successful direct contract-creation receipt.');
    }
    manifest = {
      chainId: 56,
      address: candidateReceipt.contractAddress,
      transactionHash: process.env.DEPLOYMENT_TRANSACTION,
    };
  } else {
    manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  }
  const address = getAddress(manifest.address);
  if (manifest.chainId !== 56 || !/^0x[0-9a-f]{64}$/i.test(manifest.transactionHash))
    throw new Error('Invalid mainnet deployment manifest.');
  const receipt = await rpc('eth_getTransactionReceipt', [manifest.transactionHash]);
  if (
    !receipt ||
    receipt.status !== '0x1' ||
    receipt.contractAddress?.toLowerCase() !== address.toLowerCase()
  )
    throw new Error('Manifest does not match a successful contract creation receipt.');
  const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (
    block.hash !== receipt.blockHash ||
    BigInt(network.headBlock) < BigInt(receipt.blockNumber) + 20n
  )
    throw new Error('Deployment receipt is reorganized or has fewer than20 confirmations.');
  const code = await rpc('eth_getCode', [address, 'latest']);
  const expected = officialRuntime(artifact);
  const encodedId = official.toLowerCase().slice(2).padStart(64, '0');
  if (code.toLowerCase() !== expected.toLowerCase())
    throw new Error(
      'Deployed runtime differs from locally tested artifact and official immutable identity.',
    );
  const identityData = encodeFunctionData({ abi: artifact.abi, functionName: 'AGENT_ID' });
  const identity = await rpc('eth_call', [{ to: address, data: identityData }, 'latest']);
  if (identity.toLowerCase() !== `0x${encodedId}`)
    throw new Error('Deployed identity getter mismatch.');
  if (process.env.DEPLOYMENT_TRANSACTION) {
    await mkdir(path.dirname(manifestFile), { recursive: true });
    await writeFile(
      manifestFile,
      `${JSON.stringify({ ...manifest, protocolVersion: 'PREMORTEM/1', officialAgentId: official, deploymentBlock: BigInt(receipt.blockNumber).toString(), deploymentBlockHash: receipt.blockHash, compiler: artifact.metadata.compiler.version, runtimeCodeHash: keccak256(code), bscScanSourceVerification: 'NOT_ESTABLISHED' }, null, 2)}\n`,
    );
  }
  console.log(
    JSON.stringify(
      {
        status: 'ONCHAIN_CODE_AND_RECEIPT_VERIFIED',
        chainId: 56,
        address,
        transactionHash: manifest.transactionHash,
        deploymentBlock: BigInt(receipt.blockNumber).toString(),
        codeHash: keccak256(code),
        bscScanSourceVerification: 'NOT_ESTABLISHED_BY_THIS_COMMAND',
        explorer: `https://bscscan.com/address/${address}#code`,
        note: 'Upload the Standard JSON package to BscScan or use an operator API key. Compilation and runtime matching do not establish explorer verification.',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
