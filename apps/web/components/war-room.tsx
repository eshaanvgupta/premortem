'use client';
import { useEffect, useState } from 'react';
import { isAddress, toHex, type Hex, type Address } from 'viem';
import { hashManifest, reviewCommitment, buildDecisionReceipt } from '@premortem/core';
import { useCapsule, useChain, useIdentity } from '../lib/chain';
import { REGISTRY, RPC_URLS, EXPECTED_CODE_HASH, download } from '../lib/config';
import { ActionPanel } from './action';
import { PageIntro, Notice, Empty, Raw, Hash } from './ui';
import { ManifestReader } from './manifest-reader';
const categories = [
  'Insufficient evidence',
  'Calldata / intent',
  'Authority / approvals',
  'Assets / recipient',
  'Administration',
  'Execution / state',
  'External dependency',
  'Other documented risk',
];
type Capsule = {
  creator: Address;
  createdAt: bigint;
  commitDeadline: bigint;
  revealDeadline: bigint;
  minQuorum: number;
  reviewMode: number;
  outcome: number;
  approvals: number;
  rejections: number;
  insufficient: number;
  commitments: number;
  actionHash: Hex;
  evidenceRoot: Hex;
  simulationHash: Hex;
  label: string;
};
export function WarRoom({ id }: { id: string }) {
  const q = useCapsule(id);
  const chain = useChain();
  const [from, setFrom] = useState('');
  const identity = useIdentity(from);
  const [verdict, setVerdict] = useState('0');
  const [confidence, setConfidence] = useState('50');
  const [category, setCategory] = useState('0');
  const [observation, setObservation] = useState('');
  const [note, setNote] = useState('');
  const [salt, setSalt] = useState('');
  const [reveal, setReveal] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [backup, setBackup] = useState<string>();
  const [receiptError, setReceiptError] = useState('');
  const [verifying, setVerifying] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const c = q.data as Capsule | undefined;
  const digest = hashManifest({ capsuleId: id, category: Number(category), observation });
  let commitment: Hex | undefined;
  try {
    if (REGISTRY && isAddress(from) && /^0x[0-9a-fA-F]{64}$/.test(salt) && !/^0x0{64}$/.test(salt))
      commitment = reviewCommitment({
        chainId: 56,
        protocol: REGISTRY,
        capsuleId: BigInt(id),
        reviewer: from,
        verdict: Number(verdict),
        confidence: Number(confidence),
        evidenceDigest: digest,
        category: Number(category),
        salt: salt as Hex,
      });
  } catch {
    commitment = undefined;
  }
  const records = chain.data?.events.filter((e) => String(e.args.capsuleId) === id) ?? [];
  const self = c?.creator.toLowerCase() === from.toLowerCase();
  const validEvidence = observation.trim().length >= 12;
  const canReview =
    validEvidence &&
    Boolean(commitment || c?.reviewMode === 0) &&
    identity.data !== undefined &&
    identity.data > 0n &&
    !self;
  const closed = c && (c.outcome !== 0 || now >= Number(c.revealDeadline));
  const stage = c
    ? c.outcome !== 0
      ? 'FINALIZED'
      : now >= Number(c.revealDeadline)
        ? 'AWAITING FINALIZATION'
        : now >= Number(c.commitDeadline) && c.reviewMode === 1
          ? 'REVEAL'
          : c.reviewMode === 1
            ? 'COMMIT'
            : 'OPEN REVIEW'
    : '';
  return (
    <div className="page">
      <PageIntro kicker={`WAR ROOM / CAPSULE ${id}`} title={c?.label ?? 'THE DOSSIER.'}>
        A review with a traceable source, a bounded phase and a named author. Your verdict is
        advisory.
      </PageIntro>
      {!REGISTRY ? (
        <Empty title="Registry not configured">
          A deployed contract is required to load this capsule.
        </Empty>
      ) : q.isPending ? (
        <div className="skeleton">Loading capsule from BSC…</div>
      ) : q.isError ? (
        <Notice tone="error">{q.error.message}</Notice>
      ) : (
        c && (
          <>
            <div className="coverage">
              <span className="tag">{stage}</span>
              <span className="mono">{c.reviewMode === 1 ? 'BLIND ROOM' : 'OPEN ROOM'}</span>
              <button
                className="text-link"
                onClick={() => {
                  setNow(Math.floor(Date.now() / 1000));
                  q.refetch();
                  chain.refetch();
                }}
              >
                Refresh phase / chain
              </button>
            </div>
            <div className="stats-grid">
              <div>
                <span>APPROVE</span>
                <strong>{c.approvals}</strong>
              </div>
              <div>
                <span>REJECT</span>
                <strong>{c.rejections}</strong>
              </div>
              <div>
                <span>INSUFFICIENT</span>
                <strong>{c.insufficient}</strong>
              </div>
              <div>
                <span>QUORUM</span>
                <strong>{c.minQuorum}</strong>
              </div>
            </div>
            <section className="panel">
              <h2>Exact source</h2>
              <dl className="dossier">
                <dt>Creator</dt>
                <dd>
                  <Hash value={c.creator} />
                </dd>
                <dt>Action hash</dt>
                <dd className="mono break">{c.actionHash}</dd>
                <dt>Evidence root</dt>
                <dd className="mono break">{c.evidenceRoot}</dd>
                <dt>Simulation hash</dt>
                <dd className="mono break">{c.simulationHash}</dd>
                <dt>Commit / review deadline</dt>
                <dd>{new Date(Number(c.commitDeadline) * 1000).toISOString()}</dd>
                <dt>Reveal deadline</dt>
                <dd>{new Date(Number(c.revealDeadline) * 1000).toISOString()}</dd>
                <dt>Decision</dt>
                <dd>
                  {
                    ['PENDING', 'APPROVED · ADVISORY', 'REJECTED · ADVISORY', 'INCONCLUSIVE'][
                      c.outcome
                    ]
                  }
                </dd>
              </dl>
              <Notice>
                Full action calldata and evidence content are not stored on chain. Ask the author
                for the manifest and compare hashes before reviewing. A nonzero hash does not prove
                that evidence is meaningful.
              </Notice>
            </section>
            <ManifestReader capsule={c} />
            <section className="panel review-panel">
              <div className="panel-heading">
                <h2>Independent assessment</h2>
                <span className="tag">ONE WALLET / ONE REVIEW</span>
              </div>
              <label>
                Actual Agent ID-holding signing address
                <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="0x…" />
              </label>
              {isAddress(from) && (
                <p role="status">
                  {identity.isPending
                    ? 'Checking official identity…'
                    : identity.isError
                      ? 'Identity unavailable; writes disabled'
                      : identity.data && identity.data > 0n
                        ? 'Official Agent ID present'
                        : 'No Agent ID. Claim only inside Binance App, Wallet homepage banner.'}
                </p>
              )}
              {self && <Notice tone="warning">The creator cannot review their own capsule.</Notice>}
              <div className="form-grid">
                <label>
                  Verdict
                  <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
                    <option value="0">Insufficient evidence</option>
                    <option value="1">Approve (advisory)</option>
                    <option value="2">Reject (advisory)</option>
                  </select>
                </label>
                <label>
                  Risk category
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {categories.map((v, i) => (
                      <option value={i} key={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Confidence in your observation (1–100)
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={confidence}
                    onChange={(e) => setConfidence(e.target.value)}
                  />
                </label>
              </div>
              <label>
                Reference a specific observation{' '}
                <small>
                  At least 12 characters. Cite the manifest finding, hash, evidence URL or
                  reproducible fact.
                </small>
                <textarea
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  rows={4}
                  placeholder="Finding rpc.call at block … shows …; uncertainty remains because …"
                />
              </label>
              <p className="mono fine break">EVIDENCE DIGEST {digest}</p>
              <button
                className="button outline"
                onClick={() =>
                  download(`capsule-${id}-review-evidence.json`, {
                    capsuleId: id,
                    category: Number(category),
                    observation,
                    digest,
                  })
                }
                disabled={!validEvidence}
              >
                Export private review evidence
              </button>
              {c.reviewMode === 1 && (
                <>
                  <label>
                    Private reveal salt{' '}
                    <small>Keep this secret until reveal; losing it prevents reveal.</small>
                    <input
                      value={salt}
                      onChange={(e) => setSalt(e.target.value)}
                      placeholder="0x… 32 random bytes"
                      spellCheck={false}
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="button outline"
                      onClick={() => setSalt(toHex(crypto.getRandomValues(new Uint8Array(32))))}
                    >
                      Generate secure salt
                    </button>
                    <button
                      className="button outline"
                      disabled={!commitment || !validEvidence}
                      onClick={() => {
                        download(`capsule-${id}-reveal-SECRET.json`, {
                          version: 'premortem-reveal/1',
                          chainId: 56,
                          registry: REGISTRY,
                          capsuleId: id,
                          reviewer: from,
                          verdict: Number(verdict),
                          confidence: Number(confidence),
                          evidenceDigest: digest,
                          category: Number(category),
                          salt,
                          observation,
                          commitment,
                        });
                        setBackup(commitment);
                      }}
                    >
                      Back up reveal bundle
                    </button>
                  </div>
                  <label>
                    Restore local reveal bundle
                    <input
                      type="file"
                      accept="application/json"
                      onChange={async (e) => {
                        try {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 100000) throw new Error('Reveal bundle exceeds 100 KB');
                          const b = JSON.parse(await f.text());
                          if (
                            b.version !== 'premortem-reveal/1' ||
                            b.capsuleId !== id ||
                            b.registry !== REGISTRY ||
                            b.chainId !== 56
                          )
                            throw new Error('Bundle belongs to a different capsule or registry');
                          setFrom(String(b.reviewer));
                          setVerdict(String(b.verdict));
                          setConfidence(String(b.confidence));
                          setCategory(String(b.category));
                          setSalt(String(b.salt));
                          setObservation(String(b.observation));
                          const restored = reviewCommitment({
                            chainId: 56,
                            protocol: REGISTRY!,
                            capsuleId: BigInt(id),
                            reviewer: b.reviewer,
                            verdict: Number(b.verdict),
                            confidence: Number(b.confidence),
                            evidenceDigest: hashManifest({
                              capsuleId: id,
                              category: Number(b.category),
                              observation: b.observation,
                            }),
                            category: Number(b.category),
                            salt: b.salt,
                          });
                          if (restored !== b.commitment)
                            throw new Error('Reveal bundle commitment mismatch');
                          setBackup(restored);
                        } catch (e) {
                          alert((e as Error).message);
                        }
                      }}
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={reveal}
                      onChange={(e) => setReveal(e.target.checked)}
                    />
                    Prepare reveal (only valid after commit deadline)
                  </label>
                </>
              )}
              <ActionPanel
                method={
                  c.reviewMode === 0 ? 'reviewOpen' : reveal ? 'revealReview' : 'commitReview'
                }
                from={from}
                onFromChange={setFrom}
                args={
                  c.reviewMode === 0
                    ? [id, Number(verdict), Number(confidence), digest, Number(category)]
                    : reveal
                      ? [id, Number(verdict), Number(confidence), salt, digest, Number(category)]
                      : [id, commitment]
                }
                disabled={
                  !canReview ||
                  Boolean(closed) ||
                  Number(confidence) < 1 ||
                  Number(confidence) > 100 ||
                  (c.reviewMode === 1 && (backup !== commitment || reveal !== (stage === 'REVEAL')))
                }
              />
            </section>
            <section className="panel">
              <h2>Counterevidence / challenge</h2>
              <p>
                Attach the digest of the observation above and a brief public note. Keep identifying
                or sensitive content out of permanent chain storage.
              </p>
              <label>
                Public note (printable ASCII, max 160 bytes)
                <input maxLength={160} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <ActionPanel
                method="addEvidence"
                from={from}
                onFromChange={setFrom}
                args={[id, digest, Number(category), note]}
                disabled={
                  !validEvidence || !note.trim() || !/^[\x20-\x7E]+$/.test(note) || Boolean(closed)
                }
              />
            </section>
            {now >= Number(c.revealDeadline) && c.outcome === 0 && (
              <ActionPanel
                method="finalizeCapsule"
                args={[id]}
                from={from}
                onFromChange={setFrom}
              />
            )}
            <section className="panel">
              <h2>On-chain audit trail</h2>
              {chain.data?.coverage === 'partial' && (
                <Notice tone="warning">
                  Partial event coverage. Refresh or continue the history scan in Live Proof before
                  exporting a complete record.
                </Notice>
              )}
              {records.length ? (
                records.map((e) => (
                  <div className="timeline-row" key={`${e.transactionHash}-${e.logIndex}`}>
                    <span className="mono gold">{e.eventName}</span>
                    <Hash value={String(e.args.actor)} />
                    <Hash value={e.transactionHash} kind="tx" />
                    <Raw value={e.args} label="Event details" />
                  </div>
                ))
              ) : (
                <p>No events loaded in the scanned range.</p>
              )}
              <p>
                Export and independently verify the confirmed transaction hashes in Flight Recorder.
              </p>
              <button
                className="button outline"
                disabled={verifying || !records.length}
                onClick={async () => {
                  setVerifying(true);
                  setReceiptError('');
                  try {
                    const receipt = await buildDecisionReceipt({
                      address: REGISTRY!,
                      capsuleId: BigInt(id),
                      events: records,
                      rpcUrls: RPC_URLS,
                      expectedCodeHash: EXPECTED_CODE_HASH as Hex,
                    });
                    download(`capsule-${id}-receipt.json`, {
                      ...receipt,
                      eventCoverage: chain.data?.coverage ?? 'unavailable',
                      events: records,
                    });
                    if (!receipt.allSuppliedEventsVerified)
                      setReceiptError(
                        'Some event evidence is not confirmed or failed validation. The export records these failures.',
                      );
                  } catch (e) {
                    setReceiptError((e as Error).message);
                  } finally {
                    setVerifying(false);
                  }
                }}
              >
                {verifying ? 'Validating event evidence…' : 'Validate and export decision receipt'}
              </button>
              {receiptError && <Notice tone="warning">{receiptError}</Notice>}
            </section>
          </>
        )
      )}
    </div>
  );
}
