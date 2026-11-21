import lighthouse from 'lighthouse';
import { chromium } from '@playwright/test';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
const server = createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const browser = await chromium.launch({
  headless: true,
  args: [`--remote-debugging-port=${port}`],
});
try {
  await mkdir('artifacts', { recursive: true });
  const result = await lighthouse('http://127.0.0.1:3000', {
    port,
    output: ['json', 'html'],
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  });
  if (!result) throw new Error('Lighthouse did not produce a report');
  await writeFile('artifacts/lighthouse.json', result.report[0]);
  await writeFile('artifacts/lighthouse.html', result.report[1]);
  console.log(
    JSON.stringify(
      {
        url: result.lhr.finalDisplayedUrl,
        categories: Object.fromEntries(
          Object.entries(result.lhr.categories).map(([key, value]) => [
            key,
            Math.round((value.score ?? 0) * 100),
          ]),
        ),
        runtimeError: result.lhr.runtimeError ?? null,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
