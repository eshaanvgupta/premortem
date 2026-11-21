import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const production = process.argv.includes('--mainnet');
let publicConfiguration = {};
if (production) {
  const manifest = JSON.parse(
    await readFile('packages/contracts/deployments/mainnet.json', 'utf8'),
  );
  const site = JSON.parse(await readFile('packages/contracts/deployments/site.json', 'utf8'));
  if (
    manifest.chainId !== 56 ||
    !/^0x[0-9a-f]{40}$/i.test(manifest.address) ||
    !/^\d+$/.test(manifest.deploymentBlock) ||
    manifest.runtimeCodeHash !==
      '0x75f282f00279ca552e0ff2a4ec944f96b24815466582339548a62e98f2e05e14'
  )
    throw new Error('Invalid production deployment manifest.');
  publicConfiguration = {
    NEXT_PUBLIC_PREMORTEM_REGISTRY: manifest.address,
    NEXT_PUBLIC_PREMORTEM_CODE_HASH: manifest.runtimeCodeHash,
    NEXT_PUBLIC_DEPLOYMENT_BLOCK: manifest.deploymentBlock,
    NEXT_PUBLIC_BSC_RPC_URL: 'https://bsc-rpc.publicnode.com',
    NEXT_PUBLIC_SITE_URL: site.url,
  };
}
const child = spawn(
  process.execPath,
  ['apps/web/node_modules/next/dist/bin/next', 'build', 'apps/web', '--webpack'],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, ...publicConfiguration, PREMORTEM_STATIC_EXPORT: '1' },
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
