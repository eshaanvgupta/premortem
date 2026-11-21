'use client';
import { useState } from 'react';
import Link from 'next/link';
import { isAddress } from 'viem';
import { useIdentity, useChain } from '../lib/chain';
import { AGENT_ID } from '../lib/config';
import { PageIntro, Notice, Hash, Empty } from './ui';
export function MyProof() {
  const [address, setAddress] = useState('');
  const identity = useIdentity(address);
  const q = useChain();
  const events =
    q.data?.events.filter((e) => String(e.args.actor).toLowerCase() === address.toLowerCase()) ??
    [];
  return (
    <div className="page">
      <PageIntro kicker="IDENTITY / ACTUAL CONTRIBUTIONS" title="MY PROOF.">
        Your address, your observations, your accountable decisions. No name resolution or identity
        directory.
      </PageIntro>
      <section className="panel">
        <label>
          Your public wallet address
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" />
        </label>
        <p className="fine">
          This address is sent to public BSC RPC providers to query balanceOf. No signature or login
          is required.
        </p>
        <p>
          Official Agent ID registry: <Hash value={AGENT_ID} />
        </p>
        {isAddress(address) ? (
          identity.isPending ? (
            <p role="status">Checking balanceOf…</p>
          ) : identity.isError ? (
            <Notice tone="error">Identity lookup unavailable: {identity.error.message}</Notice>
          ) : identity.data && identity.data > 0n ? (
            <Notice>
              Official Agent ID present at the queried chain state. This is not proof of personhood.
            </Notice>
          ) : (
            <Notice tone="warning">
              This wallet has no official Agent ID. Claim one only inside Binance App → Wallet
              homepage → Agent ID banner. Read-only access remains available.
            </Notice>
          )
        ) : (
          address && <Notice tone="warning">Enter a valid checksummed BSC address.</Notice>
        )}
        <a
          href="https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction"
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          Open official Agentic Wallet setup
        </a>
      </section>
      <section className="panel">
        <h2>Contribution history</h2>
        {q.data?.coverage === 'partial' && (
          <Notice tone="warning">
            Partial history. Only events in the currently scanned range are shown.
          </Notice>
        )}
        {events.length ? (
          events.map((e) => (
            <div className="timeline-row" key={`${e.transactionHash}-${e.logIndex}`}>
              <span className="mono gold">{e.eventName}</span>
              <Link href={`/arena/${e.args.capsuleId}`}>Capsule #{String(e.args.capsuleId)}</Link>
              <Hash value={e.transactionHash} kind="tx" />
            </div>
          ))
        ) : (
          <Empty title="No loaded contributions">
            {isAddress(address)
              ? 'No matching activity in the loaded registry history.'
              : 'Enter your address to filter real protocol events.'}
          </Empty>
        )}
      </section>
    </div>
  );
}
