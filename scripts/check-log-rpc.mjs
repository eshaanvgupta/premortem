// Read-only mainnet probe: compare a real token log against its transaction receipt.
import { mkdir, writeFile } from 'node:fs/promises';
const endpoints = ['https://bsc-rpc.publicnode.com', 'https://rpc-bnb.blockmachine.io'];
async function request(endpoint, method, params = []) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  const x = await r.json();
  if (x.error) throw Error(x.error.message);
  return x.result;
}
const results = await Promise.all(
  endpoints.map(async (endpoint) => {
    try {
      if (BigInt(await request(endpoint, 'eth_chainId')) !== 56n) throw Error('Wrong chain');
      const head = BigInt(await request(endpoint, 'eth_blockNumber'));
      const block = '0x' + (head - 30n).toString(16);
      const logs = await request(endpoint, 'eth_getLogs', [
        { address: '0x55d398326f99059fF775485246999027B3197955', fromBlock: block, toBlock: block },
      ]);
      if (!Array.isArray(logs) || !logs.length)
        throw Error('No real log evidence returned; capability not established');
      const log = logs[0];
      const receipt = await request(endpoint, 'eth_getTransactionReceipt', [log.transactionHash]);
      const match = receipt?.logs?.some(
        (l) =>
          l.logIndex === log.logIndex &&
          l.address.toLowerCase() === log.address.toLowerCase() &&
          l.data === log.data &&
          JSON.stringify(l.topics) === JSON.stringify(log.topics),
      );
      const canonical = await request(endpoint, 'eth_getBlockByNumber', [block, false]);
      if (!match || canonical?.hash !== log.blockHash || receipt.blockHash !== log.blockHash)
        throw Error('Log differs from canonical transaction receipt');
      return {
        endpoint,
        status: 'LOG_AND_RECEIPT_MATCH',
        probeBlock: BigInt(block).toString(),
        blockHash: log.blockHash,
        logCount: logs.length,
        sampleTransaction: log.transactionHash,
      };
    } catch (error) {
      return { endpoint, status: 'UNAVAILABLE', error: error.message };
    }
  }),
);
const report = {
  checkedAt: new Date().toISOString(),
  chainId: 56,
  readOnly: true,
  establishesProtocolCoverage: false,
  results,
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/log-rpc-preflight.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!results.some((r) => r.status === 'LOG_AND_RECEIPT_MATCH')) process.exitCode = 1;
