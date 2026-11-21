// Generates reviewable creation data from the locally compiled, tested artifact. Never broadcasts.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const requireCore = createRequire(new URL('../packages/core/package.json', import.meta.url));
const { encodeAbiParameters, getAddress, keccak256 } = requireCore('viem');
const artifact = JSON.parse(
  await readFile(
    new URL(
      '../packages/contracts/out/PremortemRegistry.sol/PremortemRegistry.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
if (
  artifact.metadata.compiler.version !== '0.8.39+commit.ce47f2c8' ||
  artifact.metadata.settings.optimizer.runs !== 200 ||
  artifact.metadata.settings.evmVersion !== 'paris'
)
  throw new Error('Unexpected compiler settings');
const identity = getAddress('0x60b9262456de011f7d15a54cdd8c48baaa8b022f');
const constructorArguments = encodeAbiParameters([{ type: 'address' }], [identity]);
const initcode = artifact.bytecode.object + constructorArguments.slice(2);
let runtime = artifact.deployedBytecode.object.slice(2);
for (const refs of Object.values(artifact.deployedBytecode.immutableReferences))
  for (const ref of refs) {
    if (ref.length !== 32) throw new Error('Unexpected immutable');
    runtime =
      runtime.slice(0, ref.start * 2) +
      identity.slice(2).toLowerCase().padStart(64, '0') +
      runtime.slice((ref.start + ref.length) * 2);
  }
const expectedRuntimeCodeHash = keccak256(`0x${runtime}`);
if (
  expectedRuntimeCodeHash !== '0x75f282f00279ca552e0ff2a4ec944f96b24815466582339548a62e98f2e05e14'
)
  throw new Error('Artifact changed: review and explicitly update the deployment pin.');
const bundle = {
  protocolVersion: 'PREMORTEM/1',
  chainId: 56,
  value: '0',
  officialAgentId: identity,
  officialAgentIdCodeHash: '0xc4006e6e6ffaaf6996116617392beabe4f5f0a0795841322f91c2ceac34d6ace',
  compiler: artifact.metadata.compiler.version,
  optimizerRuns: 200,
  evmVersion: 'paris',
  initcode,
  initcodeHash: keccak256(initcode),
  constructorArguments,
  expectedRuntimeCodeHash,
};
await mkdir(new URL('../apps/web/lib/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../apps/web/lib/deployment.json', import.meta.url),
  JSON.stringify(bundle, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    status: 'CREATION_DATA_PREPARED_NOT_BROADCAST',
    initcodeHash: bundle.initcodeHash,
    expectedRuntimeCodeHash,
    initcodeBytes: (initcode.length - 2) / 2,
  }),
);
