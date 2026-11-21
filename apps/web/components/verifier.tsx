'use client';
import { useState } from 'react';
import { verifyReceipt, buildDecisionReceipt } from '@premortem/core';
import { REGISTRY, RPC_URLS, EXPECTED_CODE_HASH, download } from '../lib/config';
import type { Hex } from 'viem';
import { Notice, Raw } from './ui';
export function ReceiptVerifier() {
  const [hash, setHash] = useState('');
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(undefined);
    try {
      if (!REGISTRY)
        throw new Error('Deploy and configure a registry before verifying its receipts.');
      const r = await verifyReceipt({
        transactionHash: hash,
        address: REGISTRY,
        rpcUrls: RPC_URLS,
        confirmations: 20n,
        expectedCodeHash: EXPECTED_CODE_HASH as Hex,
      });
      setResult(r);
      setVerified(r.verified);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Independent proof verifier</h2>
        <span className="tag">LIVE RPC CHECK</span>
      </div>
      <p>
        Verify network, successful status, block inclusion, confirmation depth, destination and
        decoded logs from the exact registry. RPC evidence still depends on the provider.
      </p>
      <form onSubmit={check}>
        <label>
          Confirmed protocol transaction hash
          <input
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            required
            pattern="0x[0-9a-fA-F]{64}"
            placeholder="0x… 32 bytes"
          />
        </label>
        <button className="button" disabled={busy || !REGISTRY}>
          {busy ? 'Checking evidence…' : 'Verify transaction'}
        </button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      {result !== undefined && (
        <>
          <Notice tone={verified ? 'neutral' : 'warning'}>
            {verified
              ? 'Transaction evidence validated against the current RPC view.'
              : 'Evidence was not verified. Inspect the reason below.'}
          </Notice>
          <Raw value={result} label="Verification evidence" />
          <button
            className="button outline"
            onClick={() => download('premortem-verification.json', result)}
          >
            Export validation result
          </button>
        </>
      )}
      <details>
        <summary>Validate an exported capsule receipt</summary>
        <p>
          Choose an exported receipt. Each supplied transaction is independently rechecked. Omitted
          events cannot be detected from the file alone; compare a complete chain scan.
        </p>
        <input
          aria-label="Upload receipt JSON"
          type="file"
          accept="application/json"
          disabled={busy || !REGISTRY}
          onChange={async (e) => {
            setBusy(true);
            setError('');
            try {
              const file = e.target.files?.[0];
              if (!file || !REGISTRY) return;
              if (file.size > 5_000_000) throw new Error('Receipt exceeds 5 MB limit');
              const data = JSON.parse(await file.text());
              if (
                data.chainId !== 56 ||
                (data.registry ?? data.contract)?.toLowerCase() !== REGISTRY.toLowerCase()
              )
                throw new Error('Receipt network or registry mismatch');
              const rawEvents = data.events ?? [];
              if (!Array.isArray(rawEvents) || rawEvents.length > 2000)
                throw new Error('Invalid event list');
              const events = rawEvents.map((event: any) => ({
                ...event,
                blockNumber: BigInt(event.blockNumber),
                timestamp: BigInt(event.timestamp),
                args: { ...event.args, capsuleId: BigInt(event.args.capsuleId) },
              }));
              const r = await buildDecisionReceipt({
                address: REGISTRY,
                capsuleId: BigInt(data.capsuleId),
                events,
                rpcUrls: RPC_URLS,
                expectedCodeHash: EXPECTED_CODE_HASH as Hex,
              });
              setResult(r);
              setVerified(r.allSuppliedEventsVerified);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </details>
    </section>
  );
}
