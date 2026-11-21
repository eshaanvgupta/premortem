// Isolated EVM test only: all transaction submissions stay on localhost.
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { startLocalFixture } from './contracts.mjs';
const requireCore = createRequire(new URL('../packages/core/package.json', import.meta.url));
const { keccak256 } = requireCore('viem');
const snapshot = JSON.parse(
  await readFile('tests/fixtures/official-agent-id-runtime.json', 'utf8'),
);
if (
  keccak256(snapshot.code) !== '0xc4006e6e6ffaaf6996116617392beabe4f5f0a0795841322f91c2ceac34d6ace'
)
  throw new Error('Unexpected official identity code snapshot.');
const fixture = await startLocalFixture({ port: 18547, chainId: 56 });
let server;
const miners = setInterval(() => {
  fixture.rpc('evm_mine').catch(() => {});
}, 150);
try {
  await mkdir('.tools', { recursive: true });
  await fixture.rpc('anvil_setCode', [snapshot.address, snapshot.code]);
  await writeFile(
    '.tools/deployment-local-fixture.json',
    JSON.stringify({ testOnly: true, endpoint: fixture.endpoint, accounts: fixture.accounts }),
  );
  server = spawn(process.execPath, ['scripts/serve-static.mjs'], {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, PORT: '3200' },
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3200/deploy')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* server may still be starting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready)
    throw new Error('Static export server did not become ready. Run pnpm build:static first.');
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'playwright.deployment.config.ts',
      ],
      { stdio: 'inherit', windowsHide: true },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Deployment browser tests exited ${code}`)),
    );
  });
} finally {
  clearInterval(miners);
  server?.kill('SIGTERM');
  fixture.close();
}
