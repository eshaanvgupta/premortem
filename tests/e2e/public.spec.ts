import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('home communicates real launch state and works on mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('FUTURE');
  await expect(page.getByText('PREDEPLOYMENT · REGISTRY NOT CONFIGURED')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Enter Preflight Lab' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveJSProperty('scrollWidth', 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
for (const route of [
  '/lab',
  '/arena',
  '/recorder',
  '/proof',
  '/me',
  '/security',
  '/developers',
  '/submission',
])
  test(`${route} renders a truthful public screen`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
test('empty arena has no fabricated capsule cards', async ({ page }) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Registry awaiting deployment' })).toBeVisible();
  await expect(page.locator('.capsule-card')).toHaveCount(0);
});
test('keyboard command palette and reduced motion', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Motion: system' }).click();
  await expect(page.getByRole('button', { name: 'Motion: reduced' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('read-only lab validates network and never requests a signature', async ({ page }) => {
  let walletCalls = 0;
  await page.addInitScript(() => {
    (window as any).ethereum = {
      request: () => {
        throw new Error('Wallet must not be invoked during inspection');
      },
    };
  });
  await page.route('https://**/*', async (route) => {
    let payload: any;
    try {
      payload = route.request().postDataJSON();
    } catch {
      return route.continue();
    }
    if (!payload?.method) return route.continue();
    if (payload.method.startsWith('eth_send') || payload.method.includes('sign')) walletCalls++;
    return route.fulfill({
      json: {
        jsonrpc: '2.0',
        id: payload.id,
        result: payload.method === 'eth_chainId' ? '0x1' : null,
      },
    });
  });
  await page.goto('/lab');
  await page.getByLabel('Source wallet').fill('0x1111111111111111111111111111111111111111');
  await page.getByLabel('Target address').fill('0x2222222222222222222222222222222222222222');
  await page.getByRole('button', { name: 'Run deterministic preflight' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'network mismatch' })).toBeVisible();
  expect(walletCalls).toBe(0);
});
test('deterministic inspector shows actual fixture evidence and unknowns (test-only RPC)', async ({
  page,
}) => {
  await page.route('https://**/*', async (route) => {
    let p: any;
    try {
      p = route.request().postDataJSON();
    } catch {
      return route.continue();
    }
    if (!p?.method) return route.continue();
    const results: Record<string, unknown> = {
      eth_chainId: '0x38',
      eth_getBlockByNumber: {
        number: '0x64',
        hash: `0x${'11'.repeat(32)}`,
        timestamp: '0x6b000000',
      },
      eth_getCode: '0x6000',
      eth_call: '0x',
      eth_estimateGas: '0x5208',
    };
    return route.fulfill({ json: { jsonrpc: '2.0', id: p.id, result: results[p.method] ?? null } });
  });
  await page.goto('/lab');
  await page.getByLabel('Source wallet').fill('0x1111111111111111111111111111111111111111');
  await page.getByLabel('Target address').fill('0x2222222222222222222222222222222222222222');
  await page.getByLabel('Exact calldata').fill('0xdeadbeef');
  await page.getByRole('button', { name: 'Run deterministic preflight' }).click();
  await expect(page.getByRole('heading', { name: 'The Future Tree' })).toBeVisible();
  await expect(page.getByText('PROBABILITY UNAVAILABLE', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download action file' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Unknown selector' })).toBeVisible();
});
test('no identity does not manufacture an onboarding login', async ({ page }) => {
  await page.route('https://**/*', async (route) => {
    let p: any;
    try {
      p = route.request().postDataJSON();
    } catch {
      return route.continue();
    }
    if (!p?.method) return route.continue();
    return route.fulfill({
      json: {
        jsonrpc: '2.0',
        id: p.id,
        result: p.method === 'eth_chainId' ? '0x38' : `0x${'0'.repeat(64)}`,
      },
    });
  });
  await page.goto('/me');
  await page
    .getByLabel('Your public wallet address')
    .fill('0x1111111111111111111111111111111111111111');
  await expect(
    page.getByText('This wallet has no official Agent ID.', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open official Agentic Wallet setup' }),
  ).toHaveAttribute('href', /web3.binance.com/);
});
test('public pages pass WCAG 2 AA axe checks', async ({ page }) => {
  for (const route of ['/', '/lab', '/arena', '/recorder', '/security']) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  }
});
test('capture real rendered interface', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'chromium') return;
  await page.goto('/');
  await page.screenshot({
    path: 'artifacts/screenshots/home-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.goto('/lab');
  await page.screenshot({
    path: 'artifacts/screenshots/lab-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.screenshot({
    path: 'artifacts/screenshots/home-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
