import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { keccak256 } from 'viem';
import bundle from '../../apps/web/lib/deployment.json';
const fixture = JSON.parse(readFileSync('.tools/deployment-local-fixture.json', 'utf8'));
test('deployment requires an installed wallet and never signs on load', async ({ page }) => {
  await page.goto('/deploy');
  await expect(
    page.getByRole('button', { name: 'Request MetaMask deployment confirmation' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect MetaMask and estimate gas' }).click();
  await expect(page.locator('.notice.error')).toContainText('MetaMask installed and unlocked');
});
test('wallet on another chain cannot deploy', async ({ page }) => {
  await page.addInitScript((account) => {
    (window as any).ethereum = {
      request: async ({ method }: any) => (method === 'eth_chainId' ? '0x1' : [account]),
    };
  }, fixture.accounts[0]);
  await page.goto('/deploy');
  await page.getByRole('button', { name: 'Connect MetaMask and estimate gas' }).click();
  await expect(page.locator('.notice.error')).toContainText('chain 56');
  await expect(
    page.getByRole('button', { name: 'Request MetaMask deployment confirmation' }),
  ).toHaveCount(0);
});
test('isolated local EVM: exact creation, verified runtime, receipt recovery and duplicate prevention', async ({
  page,
}) => {
  // Browser calls are redirected only inside this test; no mainnet submissions or genuine holder claims.
  await page.route('https://**/*', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.abort();
      return;
    }
    const response = await fetch(fixture.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: request.postData(),
    });
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: await response.text(),
    });
  });
  await page.addInitScript(
    ({ endpoint, account }) => {
      (window as any).__deploymentSends = 0;
      (window as any).ethereum = {
        request: async ({ method, params = [] }: any) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
          if (method === 'eth_sendTransaction') {
            if ((window as any).__rejectDeployment) {
              (window as any).__rejectDeployment = false;
              throw Object.assign(new Error('User rejected the request'), { code: 4001 });
            }
            if (params[0].to !== undefined || params[0].value !== '0x0')
              throw new Error('Not a zero-value contract creation');
            (window as any).__deploymentSends++;
          }
          const r = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          });
          const x = await r.json();
          if (x.error) throw new Error(x.error.message);
          return x.result;
        },
      };
    },
    { endpoint: fixture.endpoint, account: fixture.accounts[0] },
  );
  await page.goto('/deploy');
  await page.getByRole('button', { name: 'Connect MetaMask and estimate gas' }).click();
  await expect(page.getByRole('status')).toContainText('Live estimate obtained');
  expect(await page.evaluate(() => (window as any).__deploymentSends)).toBe(0);
  await page.evaluate(() => {
    (window as any).__rejectDeployment = true;
  });
  await page.getByRole('button', { name: 'Request MetaMask deployment confirmation' }).click();
  await expect(page.locator('.notice.error')).toContainText('rejected');
  await expect(
    page.getByRole('button', { name: 'Request MetaMask deployment confirmation' }),
  ).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__deploymentSends)).toBe(0);
  await page.getByRole('button', { name: 'Request MetaMask deployment confirmation' }).click();
  await expect(page.getByRole('heading', { name: 'On-chain deployment verified' })).toBeVisible({
    timeout: 90000,
  });
  expect(await page.evaluate(() => (window as any).__deploymentSends)).toBe(1);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download verified deployment manifest' }).click();
  const file = await (await downloaded).path();
  const manifest = JSON.parse(readFileSync(file!, 'utf8'));
  expect(manifest.bscScanSourceVerification).toBe('NOT_ESTABLISHED');
  const rpc = async (method: string, params: unknown[]) => {
    const r = await fetch(fixture.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    return (await r.json()).result;
  };
  const tx = await rpc('eth_getTransactionByHash', [manifest.transactionHash]);
  expect(tx.input).toBe(bundle.initcode);
  expect(tx.to).toBeNull();
  expect(keccak256(await rpc('eth_getCode', [manifest.address, 'latest']))).toBe(
    bundle.expectedRuntimeCodeHash,
  );
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Connect MetaMask and estimate gas' }),
  ).toBeDisabled();
  await page.getByLabel('Deployment transaction hash').fill(manifest.transactionHash);
  await page.getByRole('button', { name: 'Verify existing deployment' }).click();
  await expect(page.getByRole('heading', { name: 'On-chain deployment verified' })).toBeVisible({
    timeout: 30000,
  });
  expect(await page.evaluate(() => (window as any).__deploymentSends)).toBe(0);
});
