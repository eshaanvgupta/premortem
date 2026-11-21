import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { startLocalFixture } from './contracts.mjs';
const requireCore = createRequire(new URL('../packages/core/package.json', import.meta.url));
const { keccak256 } = requireCore('viem');
const fixture = await startLocalFixture({ port: 18546, chainId: 56 });
let server;
const miners = setInterval(() => {
  fixture.rpc('evm_mine').catch(() => {});
}, 150);
async function run(command, args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}
try {
  const code = await fixture.rpc('eth_getCode', [fixture.registryAddress, 'latest']);
  const env = {
    NEXT_PUBLIC_BSC_RPC_URL: fixture.endpoint,
    NEXT_PUBLIC_PREMORTEM_REGISTRY: fixture.registryAddress,
    NEXT_PUBLIC_PREMORTEM_CODE_HASH: keccak256(code),
    NEXT_PUBLIC_DEPLOYMENT_BLOCK: '0',
    PREMORTEM_BUILD_DIR: '.next-protocol',
  };
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/local-fixture.json',
    JSON.stringify(
      {
        testOnly: true,
        endpoint: fixture.endpoint,
        registry: fixture.registryAddress,
        accounts: fixture.accounts,
        codeHash: keccak256(code),
      },
      null,
      2,
    ),
  );
  if (!process.argv.includes('--reuse-build'))
    await run(
      process.execPath,
      ['apps/web/node_modules/next/dist/bin/next', 'build', 'apps/web', '--webpack'],
      env,
    );
  server = spawn(
    process.execPath,
    [
      'apps/web/node_modules/next/dist/bin/next',
      'start',
      'apps/web',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3100',
    ],
    { env: { ...process.env, ...env }, stdio: 'inherit', windowsHide: true },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3100/api/health')).ok) break;
    } catch {
      /* startup */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  await run(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.protocol.config.ts'],
    {},
  );
} finally {
  clearInterval(miners);
  server?.kill('SIGTERM');
  fixture.close();
}
