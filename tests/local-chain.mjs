// TEST ONLY. Never imported by applications or production packages.
// The official-address fixture is a synthetic local identity contract, never an Agent ID claim.
import { startLocalFixture } from '../scripts/contracts.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export { startLocalFixture };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await startLocalFixture({
    port: Number(process.env.PREMORTEM_TEST_PORT || 18545),
    chainId: 56,
  });
  console.log(
    JSON.stringify({
      status: 'TEST_FIXTURE_READY',
      endpoint: fixture.endpoint,
      chainId: 56,
      registry: fixture.registryAddress,
      identity: fixture.identityAddress,
      testHolderAccounts: fixture.accounts.slice(0, 3),
      deploymentTransactions: 0,
      liveNetworkTransactions: 0,
      note: 'Synthetic test state only. Zero real Agent IDs are represented.',
    }),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      fixture.close();
      process.exit(0);
    });
}
