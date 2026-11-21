import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const ignored = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'dist',
  '.tools',
  'cache',
  'artifacts',
  'test-results',
  'playwright-report',
]);
let failures = 0;
let checked = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      ignored.has(entry.name) ||
      entry.name.startsWith('.next') ||
      entry.name === '.research' ||
      entry.name === 'release'
    )
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') {
      console.error(`Untracked environment file requires local review: ${path}`);
      continue;
    }
    if (
      !/\.(?:[cm]?[jt]sx?|md|json|ya?ml|toml|sol|txt)$/.test(entry.name) ||
      entry.name === 'pnpm-lock.yaml'
    )
      continue;
    const text = await readFile(path, 'utf8');
    checked++;
    const patterns = [
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      /(?:DEPLOYER_PRIVATE_KEY|PRIVATE_KEY)\s*[=:]\s*["']?(?:0x)?[a-f0-9]{64}/i,
      /gh[pousr]_[A-Za-z0-9]{36,}/,
      /sk-proj-[A-Za-z0-9_-]{30,}/,
    ];
    if (patterns.some((pattern) => pattern.test(text))) {
      console.error(`Potential secret: ${path}`);
      failures++;
    }
  }
}
await walk('.');
console.log(
  `Secret pattern scan: ${checked} source files checked, ${failures} potential secrets. This is not a complete credential audit.`,
);
process.exitCode = failures ? 1 : 0;
