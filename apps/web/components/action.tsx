'use client';
import { useState } from 'react';
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { REGISTRY_ABI, BSC_CHAIN as bsc } from '@premortem/core';
import { client, identityAbi, validateRegistry } from '../lib/chain';
import { AGENT_ID, REGISTRY, download, explorer, json } from '../lib/config';
import { Notice, Raw, Hash } from './ui';
export type ProtocolMethod =
  | 'createCapsule'
  | 'addEvidence'
  | 'reviewOpen'
  | 'commitReview'
  | 'revealReview'
  | 'finalizeCapsule';
declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}
export function ActionPanel({
  method,
  args,
  from,
  onFromChange,
  disabled = false,
}: {
  method: ProtocolMethod;
  args: readonly unknown[];
  from: string;
  onFromChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [tx, setTx] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  let data: Hex | undefined;
  let encodeError = '';
  try {
    data = encodeFunctionData({ abi: REGISTRY_ABI, functionName: method, args: args as never });
  } catch (e) {
    encodeError = e instanceof Error ? e.message : 'Invalid parameters';
  }
  const action = {
    version: 'premortem-action/1',
    chainId: 56,
    registry: REGISTRY,
    from,
    method,
    args,
    value: '0',
    ...(data ? { data, calldataHash: keccak256(data) } : {}),
  };
  const ready = Boolean(REGISTRY && isAddress(from) && data && !disabled);
  async function connect() {
    try {
      if (!window.ethereum)
        throw new Error('No EIP-1193 provider found. Use Prepare for my Agent for Agentic Wallet.');
      const wallet = createWalletClient({ chain: bsc, transport: custom(window.ethereum) });
      const addresses = await wallet.requestAddresses();
      onFromChange?.(addresses[0]);
      setStatus(
        'Browser wallet connected. Its support for this protocol is checked before sending.',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function send() {
    setBusy(true);
    setError('');
    try {
      if (!window.ethereum || !data) throw new Error('Connect a supported browser wallet first.');
      const address = await validateRegistry();
      const wallet = createWalletClient({ chain: bsc, transport: custom(window.ethereum) });
      if ((await wallet.getChainId()) !== 56)
        throw new Error('Wallet network mismatch. Switch your wallet to BNB Smart Chain (56).');
      const accounts = await wallet.getAddresses();
      if (!accounts.some((a) => a.toLowerCase() === from.toLowerCase()))
        throw new Error('Selected address is not controlled by this connected wallet.');
      if (method !== 'finalizeCapsule') {
        const balance = await client.readContract({
          address: AGENT_ID,
          abi: identityAbi,
          functionName: 'balanceOf',
          args: [getAddress(from)],
        });
        if (balance === 0n)
          throw new Error(
            'The actual signing wallet must hold official Agent ID. Claim only inside Binance App.',
          );
      }
      const request = { account: getAddress(from), to: address, data, value: 0n };
      await client.call(request);
      const gas = await client.estimateGas(request);
      setStatus(
        `Simulation returned. Requesting your wallet confirmation. Estimated gas: ${gas.toString()} units.`,
      );
      const hash = await wallet.sendTransaction({ ...request, chain: bsc, gas });
      setTx(hash);
      setReview(false);
      setStatus('Transaction submitted. Waiting for 20 confirmations.');
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 20 });
      if (receipt.status !== 'success') throw new Error('Transaction reverted.');
      setStatus(
        `Confirmed in block ${receipt.blockNumber}. Refresh chain data to view the new event.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="action-panel">
      <div className="panel-heading">
        <h3>Prepare for my Agent</h3>
        <span className="tag">ZERO BNB VALUE + NETWORK GAS</span>
      </div>
      <p>
        Download a narrowly scoped action file. Run it locally through the official Agentic Wallet
        CLI adapter. Authentication stays in your trusted environment.
      </p>
      {!REGISTRY && (
        <Notice>
          Registry not deployed or configured. Preparation becomes available after an authorized
          deployment.
        </Notice>
      )}
      <dl className="transaction-details">
        <dt>Network</dt>
        <dd>BNB Smart Chain · 56</dd>
        <dt>Destination</dt>
        <dd>{REGISTRY ? <Hash value={REGISTRY} /> : 'NOT DEPLOYED'}</dd>
        <dt>Method</dt>
        <dd className="mono">{method}</dd>
        <dt>Transfer value</dt>
        <dd>0 BNB (network gas still applies)</dd>
      </dl>
      {onFromChange && (
        <label>
          Actual signing wallet address
          <input
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
          />
        </label>
      )}
      <Raw value={action} label="Review exact parameters and calldata" />
      {encodeError && REGISTRY && (
        <p className="fine">Complete valid parameters to prepare calldata.</p>
      )}
      <div className="button-row">
        <button
          className="button"
          disabled={!ready}
          onClick={() => download('premortem-action.json', action)}
        >
          Download action file
        </button>
        <button className="button outline" onClick={connect}>
          Connect browser wallet
        </button>
      </div>
      <pre className="command-block">
        pnpm nexora capsule prepare --file premortem-action.json{'\n'}pnpm nexora execute --file
        premortem-action.json
      </pre>
      <p className="fine">
        Never upload login sessions, pairing codes, seed phrases or private keys. Developer Mode
        must be enabled and unexpired in the Binance App. Your local CLI previews the exact call and
        asks for confirmation.
      </p>
      <details>
        <summary>Use a supported EIP-1193 browser wallet</summary>
        <p>
          This connection is for installed browser wallets. It does not claim to connect Binance
          Agentic Wallet.
        </p>
        <button
          className="button outline"
          disabled={!ready || busy}
          onClick={() => setReview(true)}
        >
          Review browser transaction
        </button>
      </details>
      {review && (
        <div className="notice warning">
          <div>
            <h4>Confirm the exact protocol call</h4>
            <pre>{json(action)}</pre>
            <p>
              Public evidence is immutable. This records an advisory decision and never executes the
              proposed action. Your wallet will separately request transaction authorization.
            </p>
            <button className="button" disabled={busy} onClick={send}>
              {busy ? 'Awaiting confirmation…' : 'Request wallet confirmation'}
            </button>
            <button className="button outline" onClick={() => setReview(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {tx && (
        <a href={explorer(tx, 'tx')} target="_blank" rel="noreferrer">
          View transaction {tx}
        </a>
      )}
    </section>
  );
}
