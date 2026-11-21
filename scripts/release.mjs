import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Deterministic source-and-evidence archive, never a publish/deploy command.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'release');
const allowedRoots = new Set([
  'apps',
  'packages',
  'docs',
  'scripts',
  'tests',
  '.github',
  'artifacts',
]);
const allowedFiles = new Set([
  'README.md',
  'LICENSE',
  '.env.example',
  '.gitignore',
  '.gitattributes',
  '.dockerignore',
  '.prettierignore',
  '.prettierrc.json',
  'Dockerfile',
  'docker-compose.yml',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'eslint.config.mjs',
  'playwright.config.ts',
  'playwright.protocol.config.ts',
  'playwright.deployment.config.ts',
  'AGENTS.md',
]);
const forbidden = new Set([
  'node_modules',
  '.git',
  '.next',
  '.tools',
  '.research',
  'out',
  'cache',
  'dist',
  'coverage',
  'broadcast',
  'test-results',
  'playwright-report',
  '.aws',
  '.ssh',
  '.gnupg',
  '.npmrc',
  '.pypirc',
  '.netrc',
  '.DS_Store',
]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:DEPLOYER_PRIVATE_KEY|PRIVATE_KEY)\s*[=:]\s*["']?(?:0x)?[a-f0-9]{64}/i,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /sk-proj-[A-Za-z0-9_-]{30,}/,
];
const ignoredName = (name) =>
  forbidden.has(name) ||
  name === 'github-repository.json' ||
  (name.toUpperCase().includes('SECRET') && name !== 'secret-scan.mjs') ||
  /^local-fixture(?:[.-].*)?\.json$/i.test(name) ||
  /^test-(?:action|manifest|receipt|decision-receipt|reveal)(?:[.-].*)?\.json$/i.test(name) ||
  name.startsWith('.next') ||
  name === '.turbo' ||
  (name.startsWith('.env') && name !== '.env.example') ||
  /(?:\.log|\.tsbuildinfo|\.pem|\.key|\.p12|\.pfx|\.keystore|\.db|\.sqlite|\.sqlite3|\.tar|\.tgz|\.tar\.gz|\.zip)$/i.test(
    name,
  );
const digest = (data) => createHash('sha256').update(data).digest('hex');
const entries = [];
let totalBytes = 0;
async function collect(directory) {
  if ((await lstat(directory)).isSymbolicLink())
    throw new Error('Refusing to package a symbolic-link directory.');
  const children = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  );
  for (const entry of children) {
    if (ignoredName(entry.name) || entry.isSymbolicLink()) continue;
    const absolute = join(directory, entry.name);
    const path = relative(root, absolute).split(sep).join('/');
    if (path.startsWith('../') || path.startsWith('/'))
      throw new Error('Archive path escapes workspace.');
    if (entry.isDirectory()) {
      await collect(absolute);
      continue;
    }
    if (!entry.isFile()) continue;
    const data = await readFile(absolute);
    totalBytes += data.length;
    if (totalBytes > 100 * 1024 * 1024)
      throw new Error('Release exceeds 100 MiB; review unexpected files before packaging.');
    if (
      /\.(?:[cm]?[jt]sx?|md|json|ya?ml|toml|sol|txt|sh)$/.test(entry.name) ||
      entry.name === '.env.example'
    ) {
      if (secretPatterns.some((pattern) => pattern.test(data.toString('utf8'))))
        throw new Error(
          `Potential credential in ${path}; release blocked without printing its contents.`,
        );
    }
    entries.push({ path, data, mode: path.endsWith('.sh') ? 0o755 : 0o644 });
  }
}

for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) =>
  a.name.localeCompare(b.name, 'en'),
)) {
  if (entry.isSymbolicLink()) continue;
  if (entry.isDirectory() && allowedRoots.has(entry.name)) await collect(join(root, entry.name));
  else if (entry.isFile() && allowedFiles.has(entry.name)) {
    const data = await readFile(join(root, entry.name));
    if (secretPatterns.some((pattern) => pattern.test(data.toString('utf8'))))
      throw new Error(`Potential credential in ${entry.name}; release blocked.`);
    entries.push({ path: entry.name, data, mode: 0o644 });
  }
}
// Include the generated public mainnet verification bundle, excluding any
// future signer files through the same deny rules. Archive output is omitted.
try {
  await collect(join(root, 'release', 'mainnet'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
for (const required of [
  'package.json',
  'pnpm-lock.yaml',
  'packages/contracts/src/PremortemRegistry.sol',
  'packages/contracts/abi/PremortemRegistry.json',
  'packages/cli/src/index.ts',
  'packages/core/src/index.ts',
  'apps/web/package.json',
  'packages/agent-skill/SKILL.md',
]) {
  if (!entries.some((entry) => entry.path === required))
    throw new Error(`Required release input missing: ${required}`);
}
const manifest = {
  format: 'nexora-source-release/1',
  protocolVersion: 'PREMORTEM/1',
  broadcastOrPublish: false,
  reproducibility:
    'Identical input bytes produce identical sorted tar/gzip bytes; modes and timestamps are fixed. Manifest excludes itself to avoid a circular hash.',
  exclusions: [
    ...forbidden,
    '.env files except .env.example',
    'credential file extensions',
    'ephemeral local fixture/action/manifest/reveal JSON',
    'SECRET-named files except source secret-scan.mjs',
    'logs',
    'archive outputs',
    'symbolic links',
    'unknown root files',
  ],
  files: entries.map((entry) => ({
    path: entry.path,
    bytes: entry.data.length,
    sha256: digest(entry.data),
  })),
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
entries.push({ path: 'RELEASE_MANIFEST.json', data: manifestBytes, mode: 0o644 });

function tarEntry(entry) {
  let name = entry.path;
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const split = name.lastIndexOf('/');
    if (split === -1) throw new Error(`Archive filename too long: ${name}`);
    prefix = name.slice(0, split);
    name = name.slice(split + 1);
  }
  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155)
    throw new Error(`Archive path too long: ${entry.path}`);
  const header = Buffer.alloc(512);
  const text = (value, offset, length) => header.write(value, offset, length, 'utf8');
  const octal = (value, offset, length) =>
    text(`${value.toString(8).padStart(length - 1, '0')}\0`, offset, length);
  text(name, 0, 100);
  octal(entry.mode, 100, 8);
  octal(0, 108, 8);
  octal(0, 116, 8);
  octal(entry.data.length, 124, 12);
  octal(0, 136, 12);
  header.fill(0x20, 148, 156);
  text('0', 156, 1);
  text('ustar\0', 257, 6);
  text('00', 263, 2);
  text(prefix, 345, 155);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  text(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return [header, entry.data, Buffer.alloc((512 - (entry.data.length % 512)) % 512)];
}
const archive = gzipSync(Buffer.concat([...entries.flatMap(tarEntry), Buffer.alloc(1024)]), {
  level: 9,
});
const archiveHash = digest(archive);
try {
  if ((await lstat(output)).isSymbolicLink())
    throw new Error('Refusing symbolic-link release output.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true });
for (const name of ['nexora-source.tar.gz', 'source-manifest.json', 'source-checksum.json']) {
  try {
    if ((await lstat(join(output, name))).isSymbolicLink())
      throw new Error('Refusing symbolic-link release file.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await writeFile(join(output, 'nexora-source.tar.gz'), archive);
await writeFile(join(output, 'source-manifest.json'), manifestBytes);
await writeFile(
  join(output, 'source-checksum.json'),
  `${JSON.stringify({ archive: 'nexora-source.tar.gz', sha256: archiveHash, bytes: archive.length, files: entries.length }, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      archive: 'release/nexora-source.tar.gz',
      sha256: archiveHash,
      bytes: archive.length,
      files: entries.length,
      sourceAndEvidenceOnly: true,
      broadcast: false,
      published: false,
    },
    null,
    2,
  ),
);
