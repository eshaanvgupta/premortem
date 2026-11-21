// Read-only check of public production routes and the branded mainnet configuration.
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const url = 'https://premortem-protocol.guppy-ai.chatgpt.site';
const routes = [
  '/',
  '/lab',
  '/arena',
  '/capsule?id=1',
  '/deploy',
  '/proof',
  '/recorder',
  '/me',
  '/developers',
  '/security',
  '/submission',
  '/api/health',
];
const http = await Promise.all(
  routes.map(async (route) => {
    const r = await fetch(url + route, { signal: AbortSignal.timeout(20000) });
    return {
      route,
      status: r.status,
      contentType: r.headers.get('content-type'),
      csp: r.headers.get('content-security-policy'),
      nosniff: r.headers.get('x-content-type-options'),
    };
  }),
);
const health = await (await fetch(url + '/api/health')).json();
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage(
      mobile
        ? { viewport: { width: 393, height: 851 }, isMobile: true, deviceScaleFactor: 1 }
        : { viewport: { width: 1440, height: 1000 } },
    );
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    checks.push({
      device: mobile ? 'mobile' : 'desktop',
      title: await page.title(),
      brand: await page.locator('header a.brand').innerText(),
      documentCsp: Boolean(
        await page.locator('meta[http-equiv="Content-Security-Policy"]').count(),
      ),
      horizontalOverflow: await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    });
    await page.screenshot({
      path: `artifacts/screenshots/nexora-public-${mobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
    if (!mobile) {
      await page.goto(url + '/deploy', { waitUntil: 'networkidle' });
      checks.push({
        deploymentDisabled: await page
          .getByRole('button', { name: 'Connect MetaMask and estimate gas' })
          .isDisabled(),
        actualContractVisible: (await page.locator('body').innerText()).includes(
          'Registry already configured',
        ),
      });
      await page.screenshot({
        path: 'artifacts/screenshots/nexora-deploy-public.png',
        fullPage: true,
      });
      await page.goto(url + '/proof', { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: 'artifacts/screenshots/nexora-proof-public.png',
        fullPage: true,
      });
      checks.push({ proofText: (await page.locator('main').innerText()).slice(0, 2500) });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
const report = {
  checkedAt: new Date().toISOString(),
  product: 'NEXORA',
  url,
  publicUnauthenticated: true,
  health,
  mainnetContract: '0x042632f7476D6293145D13d17CD8834922Eb2F39',
  validationTransactionsSent: 0,
  http,
  browser: { errors, checks },
};
await writeFile('artifacts/public-hosting-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      health,
      http200: http.filter((r) => r.status === 200).length,
      totalRoutes: http.length,
      errors,
      checks,
    },
    null,
    2,
  ),
);
if (
  http.some((r) => r.status !== 200) ||
  errors.length ||
  health.product !== 'NEXORA' ||
  !health.deployed ||
  checks.some((r) => r.horizontalOverflow) ||
  !checks.find((r) => r.deploymentDisabled)
)
  process.exitCode = 1;
