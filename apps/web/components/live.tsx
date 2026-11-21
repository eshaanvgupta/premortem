'use client';
import Link from 'next/link';
import { useChain } from '../lib/chain';
import { REGISTRY } from '../lib/config';
import { Notice } from './ui';
export function HomeLive() {
  const q = useChain();
  const participants = new Set(
    q.data?.events
      .filter((e) => e.confirmed && e.eventName !== 'CapsuleFinalized')
      .map((e) => String(e.args.actor).toLowerCase()),
  );
  return (
    <section className="live-bar">
      <div className="live-label">
        <span className={q.data ? 'pulse' : ''} />
        <span>
          LIVE PROOF
          <br />
          <small>CHAIN-DERIVED. ALWAYS.</small>
        </span>
      </div>
      <div>
        <strong>{q.data ? String(q.data.count) : '—'}</strong>
        <span>CAPSULES ANCHORED</span>
      </div>
      <div>
        <strong>{q.data ? participants.size : '—'}</strong>
        <span>OBSERVED ID WALLETS</span>
      </div>
      <div>
        <strong>56</strong>
        <span>BNB SMART CHAIN</span>
      </div>
      <Link href="/proof">
        {!REGISTRY
          ? 'AWAITING DEPLOYMENT'
          : q.isError
            ? 'RPC UNAVAILABLE'
            : q.data?.coverage === 'partial'
              ? 'PARTIAL HISTORY'
              : 'INSPECT THE EVIDENCE'}
      </Link>
      {q.isError && <Notice tone="error">{q.error.message}</Notice>}
    </section>
  );
}
