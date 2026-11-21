import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = JSON.parse(
  await readFile(path.join(root, 'out/PremortemRegistry.sol/PremortemRegistry.json'), 'utf8'),
);
await mkdir(path.join(root, 'abi'), { recursive: true });
await writeFile(
  path.join(root, 'abi/PremortemRegistry.json'),
  `${JSON.stringify(artifact.abi, null, 2)}\n`,
);
const metadata = artifact.metadata;
const { compilationTarget: _compilationTarget, ...settings } = metadata.settings;
const standardInput = {
  language: 'Solidity',
  sources: {
    'src/PremortemRegistry.sol': {
      content: await readFile(path.join(root, 'src/PremortemRegistry.sol'), 'utf8'),
    },
  },
  settings: {
    ...settings,
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'] } },
  },
};
await mkdir(path.join(root, 'verification'), { recursive: true });
await writeFile(
  path.join(root, 'verification/standard-input.json'),
  `${JSON.stringify(standardInput, null, 2)}\n`,
);
await writeFile(
  path.join(root, 'verification/compiler.json'),
  `${JSON.stringify({ compiler: metadata.compiler.version, contract: 'src/PremortemRegistry.sol:PremortemRegistry', constructorArguments: '00000000000000000000000060b9262456de011f7d15a54cdd8c48baaa8b022f', settings }, null, 2)}\n`,
);
console.log(
  `Exported ${artifact.abi.length} ABI entries; runtime bytecode ${artifact.deployedBytecode.object.length / 2} bytes`,
);
