import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { encodeFunctionData, parseAbi, keccak256, stringToHex } from 'viem';
const fixture = JSON.parse(readFileSync('artifacts/local-fixture.json', 'utf8')) as {
  endpoint: string;
  registry: string;
  accounts: string[];
};
async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(fixture.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
}
const abi = parseAbi([
  'function createCapsule(bytes32,bytes32,bytes32,string,uint64,uint64,uint8,uint8) returns(uint256)',
  'function getReviewTotals(uint256) view returns(uint32,uint32,uint32,uint32)',
]);
async function clock(page: Page) {
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  await page.clock.setFixedTime(new Date(Number(BigInt(block.timestamp)) * 1000));
}
async function selectWallet(page: Page, index: number) {
  await page.evaluate((account) => {
    (window as any).__testAccount = account;
  }, fixture.accounts[index]);
}
async function confirmAction(page: Page, panel: ReturnType<Page['locator']>) {
  await panel.getByRole('button', { name: 'Connect browser wallet' }).click();
  if (!(await panel.getByRole('button', { name: 'Review browser transaction' }).isVisible()))
    await panel.getByText('Use a supported EIP-1193 browser wallet', { exact: true }).click();
  await panel.getByRole('button', { name: 'Review browser transaction' }).click();
  await panel.getByRole('button', { name: 'Request wallet confirmation' }).click();
  await expect(panel.getByRole('status')).toContainText('Confirmed in block', { timeout: 30000 });
  return (await panel.locator('a[href*="/tx/"]').getAttribute('href'))!.split('/').at(-1)!;
}
test('real isolated EVM: create, independent open review, finalize, verify receipt, blind commit and reveal', async ({
  page,
}) => {
  await page.addInitScript(
    ({ endpoint, account }) => {
      (window as any).__testAccount = account;
      (window as any).ethereum = {
        request: async ({ method, params = [] }: { method: string; params: unknown[] }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts')
            return [(window as any).__testAccount];
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          });
          const result = await response.json();
          if (result.error) throw new Error(result.error.message);
          return result.result;
        },
      };
    },
    { endpoint: fixture.endpoint, account: fixture.accounts[0] },
  );
  // Production build configured only for isolated local RPC. External fallback requests are blocked by the test.
  await page.route('https://**/*', (route) => route.abort());
  await clock(page);
  await page.goto('/lab');
  await page.getByLabel('Source wallet').fill(fixture.accounts[0]);
  await page.getByLabel('Target address').fill(fixture.registry);
  await page.getByRole('button', { name: 'Run deterministic preflight' }).click();
  await expect(page.getByRole('heading', { name: 'The Future Tree' })).toBeVisible();
  await page.getByLabel('Public label').fill('Local EVM substantive approval review');
  await page.getByLabel('Review mode').selectOption('0');
  await page.getByLabel('Hours per phase').fill('1');
  const manifestDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export manifest' }).click();
  await (await manifestDownload).saveAs('artifacts/test-manifest.json');
  await page.getByLabel('I consent to publishing').check();
  await page.getByRole('button', { name: 'Set exact phase deadlines' }).click();
  const createPanel = page.locator('.action-panel');
  const actionDownload = page.waitForEvent('download');
  await createPanel.getByRole('button', { name: 'Download action file' }).click();
  await (await actionDownload).saveAs('artifacts/test-action.json');
  await confirmAction(page, createPanel);
  await page.goto('/capsule?id=1');
  await page.getByLabel('Action manifest JSON').setInputFiles('artifacts/test-manifest.json');
  await expect(
    page.getByText('Manifest integrity matches the anchored capsule. This does not prove safety.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Local EVM substantive approval review',
  );
  await expect(page.getByText('OPEN REVIEW', { exact: true })).toBeVisible();
  await page.getByLabel('Actual Agent ID-holding signing address').fill(fixture.accounts[0]);
  await expect(page.getByText('The creator cannot review their own capsule.')).toBeVisible();
  await page.getByLabel('Actual Agent ID-holding signing address').fill(fixture.accounts[3]);
  await expect(
    page.getByText('No Agent ID. Claim only inside Binance App, Wallet homepage banner.'),
  ).toBeVisible();
  await expect(
    page.locator('.review-panel').getByRole('button', { name: 'Download action file' }),
  ).toBeDisabled();
  for (const index of [1, 2]) {
    await selectWallet(page, index);
    await page.getByLabel('Actual Agent ID-holding signing address').fill(fixture.accounts[index]);
    await page.getByLabel('Verdict').selectOption('1');
    await page.getByLabel('Risk category').selectOption('1');
    await page
      .getByLabel('Reference a specific observation')
      .fill(
        'Recorded exact RPC call returns failure for unknown fallback; advisory test evidence.',
      );
    await expect(page.getByText('Official Agent ID present', { exact: true })).toBeVisible();
    await confirmAction(page, page.locator('.review-panel .action-panel'));
  }
  await page.getByRole('button', { name: 'Refresh phase / chain' }).click();
  await expect(page.locator('.stats-grid').getByText('2', { exact: true }).first()).toBeVisible();
  await rpc('evm_increaseTime', [3700]);
  await rpc('evm_mine');
  await clock(page);
  await page.getByRole('button', { name: 'Refresh phase / chain' }).click();
  await selectWallet(page, 3);
  await page.getByLabel('Actual Agent ID-holding signing address').fill(fixture.accounts[3]);
  const finalizePanel = page.locator('.action-panel').filter({ hasText: 'finalizeCapsule' });
  const finalHash = await confirmAction(page, finalizePanel);
  await page.getByRole('button', { name: 'Refresh phase / chain' }).click();
  await expect(page.getByText(/APPROVED.*ADVISORY/, { exact: true })).toBeVisible();
  const receiptDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Validate and export decision receipt' }).click();
  const receiptFile = await receiptDownload;
  await receiptFile.saveAs('artifacts/test-decision-receipt.json');
  const receipt = JSON.parse(await readFile('artifacts/test-decision-receipt.json', 'utf8'));
  expect(receipt.allSuppliedEventsVerified).toBe(true);
  expect(receipt.creationEvidenceVerified).toBe(true);
  expect(receipt.verdict).toBe('APPROVED');
  await page.goto('/recorder');
  await page.getByLabel('Confirmed protocol transaction hash').fill(finalHash);
  await page.getByRole('button', { name: 'Verify transaction', exact: true }).click();
  await expect(
    page.getByText('Transaction evidence validated against the current RPC view.'),
  ).toBeVisible();
  // Create a blind capsule on the same synthetic chain using an unlocked test holder, then use the real UI.
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  const commit = BigInt(block.timestamp) + 600n;
  const evidence = keccak256(stringToHex('Test-only blind observation'));
  const data = encodeFunctionData({
    abi,
    functionName: 'createCapsule',
    args: [
      evidence,
      evidence,
      evidence,
      'Local blind review evidence',
      commit,
      commit + 600n,
      2,
      1,
    ],
  });
  const tx = await rpc('eth_sendTransaction', [
    { from: fixture.accounts[0], to: fixture.registry, data, value: '0x0', gas: '0x7a120' },
  ]);
  expect((await rpc('eth_getTransactionReceipt', [tx])).status).toBe('0x1');
  await clock(page);
  await page.goto('/capsule?id=2');
  await selectWallet(page, 1);
  await page.getByLabel('Actual Agent ID-holding signing address').fill(fixture.accounts[1]);
  await page.getByLabel('Verdict').selectOption('2');
  await page.getByLabel('Risk category').selectOption('2');
  await page
    .getByLabel('Reference a specific observation')
    .fill('Specific test observation: authority remains unverified despite selector decoding.');
  await page.getByLabel('Private reveal salt').fill(`0x${'0'.repeat(64)}`);
  await expect(page.getByRole('button', { name: 'Back up reveal bundle' })).toBeDisabled();
  await page.getByRole('button', { name: 'Generate secure salt' }).click();
  const saltDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up reveal bundle' }).click();
  await (await saltDownload).saveAs('artifacts/test-reveal-SECRET.json');
  await confirmAction(page, page.locator('.review-panel .action-panel'));
  await page
    .getByLabel('Reference a specific observation')
    .fill('Changed preimage invalidates backup');
  await expect(
    page.locator('.review-panel').getByRole('button', { name: 'Download action file' }),
  ).toBeDisabled();
  await page
    .getByLabel('Restore local reveal bundle')
    .setInputFiles('artifacts/test-reveal-SECRET.json');
  await rpc('evm_increaseTime', [650]);
  await rpc('evm_mine');
  await clock(page);
  await page.getByRole('button', { name: 'Refresh phase / chain' }).click();
  await page.getByLabel('Prepare reveal (only valid after commit deadline)').check();
  await confirmAction(page, page.locator('.review-panel .action-panel'));
  await page.getByRole('button', { name: 'Refresh phase / chain' }).click();
  await expect(page.locator('.stats-grid').getByText('1', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/war-room-local-test.png', fullPage: true });
  await page.goto('/proof');
  await expect(page.getByText('COMPLETE COVERAGE', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/proof-local-test.png', fullPage: true });
});
