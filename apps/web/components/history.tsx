'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useChain } from '../lib/chain';
import { COMPETITION_END, COMPETITION_START, REGISTRY, download, json } from '../lib/config';
import { Notice, Empty, PageIntro, Hash, Raw } from './ui';
export function History({ mode = 'arena' }: { mode?: 'arena' | 'recorder' | 'proof' }) {
  const q = useChain();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [start, setStart] = useState('2026-11-18T08:00');
  const [end, setEnd] = useState('2026-12-09T08:00');
  const [sort, setSort] = useState('newest');
  const [category, setCategory] = useState('all');
  const events = q.data?.events ?? [];
  const related = (id: unknown) =>
    events.filter((event) => String(event.args.capsuleId) === String(id));
  const evidenceCount = (id: unknown) =>
    related(id).filter((event) => event.eventName === 'EvidenceAdded').length;
  const confirmed = events.filter((e) => e.confirmed);
  const eligible = confirmed.filter(
    (e) =>
      e.eventName !== 'CapsuleFinalized' &&
      Number(e.timestamp) >= COMPETITION_START &&
      Number(e.timestamp) < COMPETITION_END,
  );
  const inRange = eligible.filter(
    (e) =>
      Number(e.timestamp) >= Date.parse(start + 'Z') / 1000 &&
      Number(e.timestamp) < Date.parse(end + 'Z') / 1000,
  );
  const wallets = new Set(inRange.map((e) => String(e.args.actor).toLowerCase()));
  const created = events
    .filter((e) => e.eventName === 'CapsuleCreated')
    .filter((e) => {
      const a = e.args;
      const term = `${a.label} ${a.capsuleId} ${a.actor} ${a.actionHash}`.toLowerCase();
      const phase = related(a.capsuleId).some((event) => event.eventName === 'CapsuleFinalized')
        ? 'finalized'
        : Number(a.revealDeadline) * 1000 <= Date.now()
          ? 'ended'
          : Number(a.commitDeadline) * 1000 < Date.now()
            ? 'reveal'
            : Number(a.reviewMode) === 1
              ? 'commit'
              : 'open';
      return (
        term.includes(search.toLowerCase()) &&
        (filter === 'all' || filter === phase) &&
        (category === 'all' ||
          related(a.capsuleId).some(
            (event) => String(event.args.category ?? event.args.evidenceType) === category,
          ))
      );
    })
    .sort((a, b) =>
      sort === 'oldest'
        ? Number(a.blockNumber - b.blockNumber)
        : sort === 'evidence'
          ? evidenceCount(b.args.capsuleId) - evidenceCount(a.args.capsuleId)
          : Number(b.blockNumber - a.blockNumber),
    );
  const rows =
    mode === 'arena'
      ? created
      : events
          .filter((e) => filter === 'all' || e.eventName === filter)
          .filter((e) => json(e.args).toLowerCase().includes(search.toLowerCase()))
          .slice()
          .reverse();
  const title =
    mode === 'arena' ? 'THE ARENA.' : mode === 'recorder' ? 'FLIGHT RECORDER.' : 'LIVE PROOF.';
  return (
    <div className="page">
      <PageIntro
        kicker={
          mode === 'proof'
            ? 'ADOPTION / MEASURED ON CHAIN'
            : 'PUBLIC CHAIN / INDEPENDENTLY INSPECTABLE'
        }
        title={title}
      >
        {mode === 'arena'
          ? 'A place for consequential ideas to meet independent scrutiny. Every capsule below comes from the configured on-chain registry.'
          : mode === 'recorder'
            ? 'The record remembers. Follow real capsule creation, evidence, reviews and final decisions.'
            : 'Genuine Agent ID participation, derived from confirmed holder-gated protocol events. Addresses are deduplicated; finalizers are excluded from the holder count.'}
      </PageIntro>
      {!REGISTRY ? (
        <Empty title="Registry awaiting deployment">
          No PREMORTEM contract has been configured. No capsules or participant counts can be
          reported yet. Read-only preflight is available in the Lab.
        </Empty>
      ) : q.isPending ? (
        <div className="skeleton" role="status">
          Querying BSC event history…
        </div>
      ) : q.isError ? (
        <Notice tone="error">Chain history unavailable: {q.error.message}</Notice>
      ) : (
        <>
          <div className="coverage">
            <span className="tag">{q.data?.coverage.toUpperCase()} COVERAGE</span>
            <span className="mono">
              {q.data?.fromBlock.toString()} — {q.data?.toBlock.toString()}
            </span>
            <button onClick={() => q.refetch()} className="text-link">
              {q.data?.coverage === 'partial' ? 'Continue bounded scan' : 'Refresh chain'}
            </button>
          </div>
          {q.data?.coverage === 'partial' && (
            <Notice tone="warning">
              Partial history. This scan has provider errors or reached its bounded range. Counts
              are lower bounds, never a complete adoption claim. {q.data.errors.join(' ')}
            </Notice>
          )}
          {mode === 'proof' ? (
            <>
              <div className="stats-grid">
                <div>
                  <span>OBSERVED DISTINCT HOLDERS</span>
                  <strong>{wallets.size}</strong>
                </div>
                <div>
                  <span>INNOVATION THRESHOLD</span>
                  <strong>{wallets.size} / 30</strong>
                </div>
                <div>
                  <span>CONFIRMED HOLDER ACTIONS</span>
                  <strong>{inRange.length}</strong>
                </div>
                <div>
                  <span>CONFIRMATION DEPTH</span>
                  <strong>20 blocks</strong>
                </div>
              </div>
              <div className="panel">
                <h2>Reproduce the count.</h2>
                <p>
                  Official competition window: 18 November 2026 08:00 UTC through 9 December 2026
                  08:00 UTC (13:30 IST). The end is exclusive. These are observed addresses, not
                  proof of personhood or organizer-confirmed qualification.
                </p>
                <div className="form-grid">
                  <label>
                    From (UTC)
                    <input
                      type="datetime-local"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </label>
                  <label>
                    Until (UTC, exclusive)
                    <input
                      type="datetime-local"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  className="button outline"
                  onClick={() =>
                    download('premortem-participation.json', {
                      protocolVersion: 'PREMORTEM/1',
                      chainId: 56,
                      registry: REGISTRY,
                      coverage: q.data?.coverage,
                      fromBlock: q.data?.fromBlock,
                      toBlock: q.data?.toBlock,
                      confirmedThrough: q.data?.confirmedThrough,
                      windowUTC: { start, end },
                      uniqueWallets: [...wallets],
                      events: inRange,
                      limitations: [
                        'RPC evidence is provider supplied. Contract identity gating is checked at execution. Finalizers excluded. Organizer qualification is independent.',
                      ],
                    })
                  }
                >
                  Export evidence
                </button>
                <div className="address-list">
                  {[...wallets].map((w) => (
                    <Hash key={w} value={w} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="filter-bar">
                <input
                  aria-label="Search capsules or events"
                  placeholder="Search capsule, hash, label or address…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
                <select
                  aria-label="Filter phase or event"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">All {mode === 'arena' ? 'phases' : 'events'}</option>
                  {(mode === 'arena'
                    ? ['open', 'commit', 'reveal', 'ended', 'finalized']
                    : [
                        'CapsuleCreated',
                        'EvidenceAdded',
                        'ReviewSubmitted',
                        'ReviewCommitted',
                        'ReviewRevealed',
                        'CapsuleFinalized',
                      ]
                  ).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              {mode === 'arena' && (
                <>
                  <div className="filter-bar">
                    <select
                      aria-label="Sort capsules"
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value);
                        setPage(0);
                      }}
                    >
                      <option value="newest">Newest observation</option>
                      <option value="oldest">Oldest observation</option>
                      <option value="evidence">Most counterevidence</option>
                    </select>
                    <select
                      aria-label="Filter risk category"
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        setPage(0);
                      }}
                    >
                      <option value="all">All observed categories</option>
                      {[
                        'Insufficient evidence',
                        'Calldata / intent',
                        'Authority',
                        'Assets / recipient',
                        'Administration',
                        'Execution / state',
                        'External dependency',
                        'Other',
                      ].map((label, index) => (
                        <option value={index} key={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="fine">
                    Counterevidence counts measure submitted observations, not their quality or
                    novelty. Inspect the substance and provenance inside each War Room.
                  </p>
                </>
              )}
              {rows.length === 0 ? (
                <Empty title={events.length ? 'No matching records' : 'No capsules yet'}>
                  No fabricated examples are shown. Create a substantive capsule or adjust your
                  filters.
                </Empty>
              ) : (
                <div className={mode === 'arena' ? 'capsule-grid' : 'event-list'}>
                  {rows.slice(page * 12, (page + 1) * 12).map((e) => {
                    const a = e.args;
                    return mode === 'arena' ? (
                      <article className="capsule-card" key={`${e.transactionHash}-${e.logIndex}`}>
                        <div className="capsule-top">
                          <span className="mono">
                            CAPSULE / {String(a.capsuleId).padStart(4, '0')}
                          </span>
                          <span className="tag">
                            {Number(a.reviewMode) === 1 ? 'BLIND' : 'OPEN'}
                          </span>
                        </div>
                        <h2>
                          <Link href={`/arena/${a.capsuleId}`}>{String(a.label)}</Link>
                        </h2>
                        <p className="mono fine">ACTION {String(a.actionHash)}</p>
                        <p className="fine">
                          {evidenceCount(a.capsuleId)} counterevidence observations ·{' '}
                          {new Date(Number(e.timestamp) * 1000).toLocaleString()}
                        </p>
                        <div className="capsule-bottom">
                          <Hash value={String(a.actor)} />
                          <span>{e.confirmed ? 'CONFIRMED' : 'PENDING FINALITY'}</span>
                        </div>
                        <Link className="text-link" href={`/arena/${a.capsuleId}`}>
                          Enter War Room
                        </Link>
                      </article>
                    ) : (
                      <article className="event" key={`${e.transactionHash}-${e.logIndex}`}>
                        <span className="event-mark" />
                        <div>
                          <span className="mono gold">{e.eventName}</span>
                          <h3>
                            Capsule{' '}
                            <Link href={`/arena/${a.capsuleId}`}>#{String(a.capsuleId)}</Link>
                          </h3>
                          <p>
                            <Hash value={String(a.actor)} /> · block {e.blockNumber.toString()} ·{' '}
                            {e.confirmed ? 'confirmed' : 'pending finality'}
                          </p>
                          <Hash value={e.transactionHash} kind="tx" />
                          <Raw value={e.args} label="Event parameters" />
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <div className="pagination">
                <button
                  className="button outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span className="mono">
                  Page {page + 1} / {Math.max(1, Math.ceil(rows.length / 12))}
                </span>
                <button
                  className="button outline"
                  disabled={(page + 1) * 12 >= rows.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
