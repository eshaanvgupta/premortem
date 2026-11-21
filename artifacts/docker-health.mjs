const paths = ['/api/health', '/', '/lab', '/arena', '/recorder', '/proof', '/me', '/security', '/developers', '/submission'];
if (process.getuid() === 0) throw new Error('Runtime must use a nonroot UID.');
const observations = [];
for (const path of paths) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, { signal: AbortSignal.timeout(10000) });
  const body = await response.text();
  const observation = { path, status: response.status, bytes: Buffer.byteLength(body), csp: Boolean(response.headers.get('content-security-policy')), nosniff: response.headers.get('x-content-type-options') === 'nosniff' };
  if (path === '/api/health') {
    const health = JSON.parse(body);
    observation.health = health;
    if (health.status !== 'ok' || health.chainId !== 56 || health.deployed !== false) throw new Error('Incorrect unconfigured production health response.');
  }
  if (response.status !== 200 || !observation.csp || !observation.nosniff) throw new Error(`Runtime route/security header failure: ${path}`);
  observations.push(observation);
}
console.log(JSON.stringify({ image: 'premortem-validation:20261120', environment: 'local-container-network-none', publishedPorts: [], userId: process.getuid(), passedRoutes: observations.length, failedRoutes: 0, observations }, null, 2));
