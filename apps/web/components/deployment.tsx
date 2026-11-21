'use client';
import { useEffect, useRef, useState } from 'react';
import {
  createWalletClient,
  custom,
  formatEther,
  getAddress,
  getContractAddress,
  isHash,
  keccak256,
  type Address,
  type Hex,
  type EIP1193Provider,
} from 'viem';
import { BSC_CHAIN, REGISTRY_ABI } from '@premortem/core';
import bundle from '../lib/deployment.json';
import { client } from '../lib/chain';
import { AGENT_ID, REGISTRY, download, explorer } from '../lib/config';
import { PageIntro, Notice, Raw, Hash } from './ui';

const data = bundle.initcode as Hex;
const storageKey = `premortem:deployment:56:${bundle.initcodeHash}`;
type Submission = { state: 'awaiting_wallet' | 'submitted'; from: Address; hash?: Hex };
type Quote = { from: Address; gas: bigint; gasPrice: bigint; balance: bigint };

export function Deployment() {
  const [quote, setQuote] = useState<Quote>();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [submission, setSubmission] = useState<Submission>();
  const [recovery, setRecovery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [manifest, setManifest] = useState<Record<string, unknown>>();
  useEffect(() => {
    try {
      const previous = localStorage.getItem(storageKey);
      if (previous) {
        setSubmission(JSON.parse(previous));
        locked.current = true;
      }
    } catch {
      setError('Local deployment history is unavailable. Check wallet activity before proceeding.');
      locked.current = true;
    }
  }, []);
  async function checkNetwork() {
    if ((await client.getChainId()) !== 56)
      throw new Error('RPC must report BNB Smart Chain mainnet (56).');
    if (keccak256(data) !== bundle.initcodeHash)
      throw new Error('Creation bytecode integrity check failed.');
    const code = await client.getCode({ address: AGENT_ID });
    if (!code || keccak256(code) !== bundle.officialAgentIdCodeHash)
      throw new Error(
        'Official Agent ID bytecode changed or is unavailable. Deployment stopped for review.',
      );
  }
  function provider(): EIP1193Provider {
    const ethereum = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (!ethereum)
      throw new Error('Open this page in a browser with MetaMask installed and unlocked.');
    return ethereum;
  }
  async function connect() {
    setBusy(true);
    setError('');
    setQuote(undefined);
    try {
      const wallet = createWalletClient({ chain: BSC_CHAIN, transport: custom(provider()) });
      const [from] = await wallet.requestAddresses();
      if (!from) throw new Error('No account selected.');
      if ((await wallet.getChainId()) !== 56)
        throw new Error(
          'Select BNB Smart Chain mainnet (chain 56) in MetaMask, then connect again.',
        );
      await checkNetwork();
      const [estimated, gasPrice, balance] = await Promise.all([
        client.estimateGas({ account: from, data, value: 0n }),
        client.getGasPrice(),
        client.getBalance({ address: from }),
      ]);
      const gas = (estimated * 120n + 99n) / 100n;
      setQuote({ from, gas, gasPrice, balance });
      setStatus('Live estimate obtained. The next button opens a separate MetaMask confirmation.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(hash: Hex) {
    setStatus('Checking the creation transaction and waiting for 20 confirmations…');
    await checkNetwork();
    const tx = await client.getTransaction({ hash });
    if (tx.to !== null || tx.value !== 0n || tx.input.toLowerCase() !== data.toLowerCase())
      throw new Error('Transaction is not the exact NEXORA creation transaction.');
    const expectedAddress = getContractAddress({ from: tx.from, nonce: BigInt(tx.nonce) });
    const receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations: 20,
      timeout: 180000,
    });
    if (
      receipt.status !== 'success' ||
      receipt.contractAddress?.toLowerCase() !== expectedAddress.toLowerCase()
    )
      throw new Error('No successful matching contract creation receipt.');
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash)
      throw new Error('Receipt was reorganized. Retry verification.');
    const code = await client.getCode({ address: expectedAddress });
    if (!code || keccak256(code) !== bundle.expectedRuntimeCodeHash)
      throw new Error('Deployed code differs from the tested artifact.');
    const identity = await client.readContract({
      address: expectedAddress,
      abi: REGISTRY_ABI,
      functionName: 'AGENT_ID',
    });
    if (getAddress(identity) !== AGENT_ID) throw new Error('Identity registry mismatch.');
    setManifest({
      protocolVersion: 'PREMORTEM/1',
      chainId: 56,
      address: expectedAddress,
      transactionHash: hash,
      deployer: tx.from,
      officialAgentId: AGENT_ID,
      deploymentBlock: receipt.blockNumber.toString(),
      deploymentBlockHash: receipt.blockHash,
      compiler: bundle.compiler,
      runtimeCodeHash: bundle.expectedRuntimeCodeHash,
      bscScanSourceVerification: 'NOT_ESTABLISHED',
    });
    setStatus(
      'Deployment receipt, runtime bytecode and official Agent ID getter verified after 20 confirmations. Download the manifest and share the transaction hash to finish app configuration and BscScan verification.',
    );
  }
  async function send() {
    if (!quote || locked.current || REGISTRY) return;
    locked.current = true;
    setBusy(true);
    setError('');
    let attempted = false;
    try {
      const wallet = createWalletClient({ chain: BSC_CHAIN, transport: custom(provider()) });
      const accounts = await wallet.getAddresses();
      if (
        (await wallet.getChainId()) !== 56 ||
        accounts[0]?.toLowerCase() !== quote.from.toLowerCase()
      )
        throw new Error('Wallet account or chain changed. Obtain a new estimate.');
      await checkNetwork();
      const gas =
        ((await client.estimateGas({ account: quote.from, data, value: 0n })) * 120n) / 100n;
      const gasPrice = await client.getGasPrice();
      if ((await client.getBalance({ address: quote.from })) < gas * gasPrice)
        throw new Error('Insufficient BNB for the estimated network fee.');
      const pending: Submission = { state: 'awaiting_wallet', from: quote.from };
      localStorage.setItem(storageKey, JSON.stringify(pending));
      setSubmission(pending);
      attempted = true;
      // Contract creation deliberately omits `to`. No assets are transferred to another account.
      const hash = await wallet.sendTransaction({
        account: quote.from,
        chain: BSC_CHAIN,
        data,
        value: 0n,
        gas,
        gasPrice,
      });
      const submitted: Submission = { ...pending, state: 'submitted', hash };
      setSubmission(submitted);
      setRecovery(hash);
      localStorage.setItem(storageKey, JSON.stringify(submitted));
      await verify(hash);
    } catch (e) {
      const rejected =
        (e as { code?: number }).code === 4001 ||
        (e as { cause?: { code?: number } }).cause?.code === 4001;
      if (!attempted || rejected) {
        locked.current = false;
        localStorage.removeItem(storageKey);
        setSubmission(undefined);
      }
      setError(
        `${(e as Error).message}${attempted && !rejected ? ' Check wallet activity before any further deployment; this page will not submit a duplicate.' : ''}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function recover() {
    setBusy(true);
    setError('');
    try {
      if (!isHash(recovery)) throw new Error('Enter a 32-byte transaction hash.');
      await verify(recovery);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page prose-page">
      <PageIntro kicker="OPERATOR / BSC MAINNET" title="DEPLOY THE REGISTRY.">
        Review the tested immutable contract and let your own wallet confirm its creation. Your
        private key stays in MetaMask.
      </PageIntro>
      {REGISTRY ? (
        <Notice>
          Registry already configured: <Hash value={REGISTRY} />. Deployment is disabled.
        </Notice>
      ) : (
        <Notice tone="warning">
          This creates a real contract on BNB Smart Chain mainnet. Transfer value is 0 BNB; the
          signer pays network gas. The contract has no owner, upgrade mechanism or custody.
        </Notice>
      )}
      <section className="panel">
        <h2>Exact deployment</h2>
        <dl className="dossier">
          <dt>Network</dt>
          <dd>BNB Smart Chain · 56</dd>
          <dt>Official Agent ID</dt>
          <dd>
            <Hash value={AGENT_ID} />
          </dd>
          <dt>Compiler</dt>
          <dd>{bundle.compiler} · optimizer 200 · Paris</dd>
          <dt>Creation bytecode hash</dt>
          <dd className="mono" style={{ overflowWrap: 'anywhere' }}>
            {bundle.initcodeHash}
          </dd>
          <dt>Expected runtime hash</dt>
          <dd className="mono" style={{ overflowWrap: 'anywhere' }}>
            {bundle.expectedRuntimeCodeHash}
          </dd>
        </dl>
        <a
          href="https://github.com/eshaanvgupta/premortem/blob/main/packages/contracts/src/PremortemRegistry.sol"
          target="_blank"
          rel="noreferrer"
        >
          Review public Solidity source
        </a>
        <Raw
          value={{
            chainId: 56,
            to: null,
            value: '0',
            data,
            constructorArguments: bundle.constructorArguments,
          }}
          label="Inspect complete creation transaction"
        />
      </section>
      <section className="panel">
        <h2>Confirm with MetaMask</h2>
        <button
          className="button outline"
          disabled={busy || Boolean(REGISTRY) || Boolean(submission)}
          onClick={connect}
        >
          Connect MetaMask and estimate gas
        </button>
        {quote && (
          <>
            <dl className="dossier">
              <dt>Deployer</dt>
              <dd>
                <Hash value={quote.from} />
              </dd>
              <dt>BNB balance</dt>
              <dd>{formatEther(quote.balance)}</dd>
              <dt>Gas limit including 20% buffer</dt>
              <dd>{quote.gas.toString()}</dd>
              <dt>Estimated maximum fee at current gas price</dt>
              <dd>{formatEther(quote.gas * quote.gasPrice)} BNB</dd>
            </dl>
            <button
              className="button"
              disabled={
                busy ||
                Boolean(submission) ||
                Boolean(REGISTRY) ||
                quote.balance < quote.gas * quote.gasPrice
              }
              onClick={send}
            >
              Request MetaMask deployment confirmation
            </button>
          </>
        )}
        {submission && (
          <Notice>
            Deployment {submission.state === 'submitted' ? 'submitted' : 'confirmation started'}.
            Duplicate submission is blocked.{' '}
            {submission.hash && <Hash value={submission.hash} kind="tx" />} Check your wallet
            activity if the confirmation was interrupted.
          </Notice>
        )}
        {status && <p role="status">{status}</p>}
        {error && <Notice tone="error">{error}</Notice>}
      </section>
      <section className="panel">
        <h2>Resume receipt verification</h2>
        <p>
          If the page was closed, paste the deployment transaction hash from MetaMask. This only
          reads the chain.
        </p>
        <label>
          Deployment transaction hash
          <input
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
          />
        </label>
        <button className="button outline" disabled={busy} onClick={recover}>
          Verify existing deployment
        </button>
      </section>
      {manifest && (
        <section className="panel">
          <h2>On-chain deployment verified</h2>
          <p>
            <a href={explorer(String(manifest.address))} target="_blank" rel="noreferrer">
              View deployed contract on BscScan
            </a>
          </p>
          <Raw value={manifest} />
          <button
            className="button"
            onClick={() => download('premortem-mainnet-deployment.json', manifest)}
          >
            Download verified deployment manifest
          </button>
        </section>
      )}
    </div>
  );
}
