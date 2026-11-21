'use client';
import { useState } from 'react';
import { inspectAction, hashAction, type PreflightManifest } from '@premortem/core';
import { isAddress, toHex, type Address, type Hex } from 'viem';
import { ScanLine, Download } from 'lucide-react';
import { REGISTRY, RPC_URLS, download } from '../lib/config';
import { Notice, PageIntro, Raw, Hash } from './ui';
import { FutureTree } from './future-tree';
import { ActionPanel } from './action';
import { Explanation } from './explanation';
export function Lab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState('0x');
  const [value, setValue] = useState('0');
  const [expected, setExpected] = useState('');
  const [manifest, setManifest] = useState<PreflightManifest>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState('1');
  const [quorum, setQuorum] = useState('2');
  const [hours, setHours] = useState('24');
  const [salt, setSalt] = useState<Hex>();
  const [schedule, setSchedule] = useState<{ commit: string; reveal: string }>();
  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setManifest(undefined);
    setSchedule(undefined);
    try {
      const result = await inspectAction(
        {
          chainId: 56,
          from,
          to,
          data,
          value,
          ...(expected ? { expectedRecipient: expected } : {}),
        },
        { rpcUrls: RPC_URLS },
      );
      setManifest(result);
      setSalt(toHex(crypto.getRandomValues(new Uint8Array(32))));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preflight failed');
    } finally {
      setBusy(false);
    }
  }
  let actionHash: Hex | undefined;
  try {
    if (manifest && REGISTRY && isAddress(from) && salt)
      actionHash = hashAction({
        chainId: 56,
        protocol: REGISTRY,
        creator: from as Address,
        target: manifest.action.to,
        value: BigInt(manifest.action.value),
        data: manifest.action.data,
        salt,
        blockNumber: BigInt(manifest.context.blockNumber),
        blockHash: manifest.context.blockHash,
      });
  } catch {
    actionHash = undefined;
  }
  const currentInput =
    manifest &&
    from.toLowerCase() === manifest.action.from.toLowerCase() &&
    to.toLowerCase() === manifest.action.to.toLowerCase() &&
    data === manifest.action.data &&
    value === manifest.action.value &&
    expected.toLowerCase() === (manifest.action.expectedRecipient ?? '').toLowerCase();
  return (
    <div className="page">
      <PageIntro kicker="OBSERVATION DECK / READ ONLY" title="PREFLIGHT LAB.">
        A rehearsal for consequences. Inspect exact calldata against real BSC state. Nothing here
        executes the proposed action.
      </PageIntro>
      <div className="lab-layout">
        <form className="panel input-panel" onSubmit={run}>
          <div className="panel-heading">
            <h2>Define the action</h2>
            <ScanLine size={20} />
          </div>
          <label>
            Source wallet
            <input
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="0x… actual sender"
              spellCheck={false}
            />
          </label>
          <label>
            Target address
            <input
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="0x… contract or recipient"
              spellCheck={false}
            />
          </label>
          <label>
            Value in wei
            <input
              required
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              pattern="[0-9]+"
            />
            <small>1 BNB = 10¹⁸ wei. This field describes the proposal only.</small>
          </label>
          <label>
            Exact calldata
            <textarea
              required
              value={data}
              onChange={(e) => setData(e.target.value)}
              rows={5}
              spellCheck={false}
            />
          </label>
          <label>
            Expected token recipient <small>optional mismatch check</small>
            <input
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
            />
          </label>
          <p className="fine">
            These public addresses and calldata are sent to your configured RPC providers. Do not
            paste secrets.
          </p>
          <button className="button full" disabled={busy}>
            {busy ? 'Observing chain state…' : 'Run deterministic preflight'}
            <ScanLine size={17} />
          </button>
        </form>
        <section className="panel lab-context">
          <span className="eyebrow">NO CRYSTAL BALL. JUST EVIDENCE.</span>
          <h2>
            UNKNOWN
            <br />
            IS A VALID
            <br />
            <span className="gold">ANSWER.</span>
          </h2>
          <p>
            We decode known selectors and ask the chain about the exact proposed call. Source
            verification, economic risk and future state remain separate questions.
          </p>
          <div className="terminal">
            <div>
              <span>$</span> verify chain_id <b>56</b>
            </div>
            <div>
              <span>$</span> eth_getCode <b>AT BLOCK</b>
            </div>
            <div>
              <span>$</span> eth_call <b>EXACT INPUT</b>
            </div>
            <div>
              <span>$</span> eth_estimateGas <b>EXACT INPUT</b>
            </div>
            <div className="gold">NO SIGNATURE REQUESTED_</div>
          </div>
          <Notice>
            Selector matches describe expected ABI shapes. They do not prove that a target
            implements those semantics.
          </Notice>
        </section>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {manifest && (
        <>
          <div className="result-heading">
            <div>
              <span className="eyebrow">OBSERVATION COMPLETE</span>
              <h2>{manifest.decoded.functionName ?? 'Unknown selector'}</h2>
              <p>
                Recorded block {manifest.context.blockNumber} · <Hash value={manifest.action.to} />
              </p>
            </div>
            <button
              className="button outline"
              onClick={() =>
                download('premortem-manifest.json', {
                  ...manifest,
                  canonicalAction: actionHash,
                  salt,
                })
              }
            >
              <Download size={16} /> Export manifest
            </button>
          </div>
          <div className="stats-grid">
            <div>
              <span>CALL RESULT</span>
              <strong>{manifest.simulation.call.status}</strong>
            </div>
            <div>
              <span>RUNTIME CODE</span>
              <strong>{manifest.code.bytes} bytes</strong>
            </div>
            <div>
              <span>FINDINGS</span>
              <strong>{manifest.findings.length}</strong>
            </div>
            <div>
              <span>SAFETY VERDICT</span>
              <strong>UNAVAILABLE</strong>
            </div>
          </div>
          <FutureTree findings={manifest.findings} />
          <Explanation manifest={manifest} />
          <Raw value={manifest} />
          <section className="panel capsule-builder">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">ANCHOR YOUR OBSERVATION</span>
                <h2>Create an Action Capsule</h2>
              </div>
              <span className="tag">AGENT ID REQUIRED</span>
            </div>
            <p>
              The label and hashes are public forever. The full manifest stays in your downloaded
              file; share it deliberately so reviewers can reproduce it.
            </p>
            <div className="form-grid">
              <label>
                Public label <small>printable ASCII, max 96 bytes</small>
                <input
                  value={label}
                  maxLength={96}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="A concrete action to review"
                />
              </label>
              <label>
                Review mode
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setSchedule(undefined);
                  }}
                >
                  <option value="1">Blind · commit then reveal</option>
                  <option value="0">Open · public verdicts</option>
                </select>
              </label>
              <label>
                Minimum reviewers
                <select value={quorum} onChange={(e) => setQuorum(e.target.value)}>
                  {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Hours per phase
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={hours}
                  onChange={(e) => {
                    setHours(e.target.value);
                    setSchedule(undefined);
                  }}
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I consent to publishing this label, action hash and evidence hashes. I have exported
              the manifest and salt.
            </label>
            <button
              className="button outline"
              onClick={() => {
                const seconds = Math.round(Number(hours) * 3600);
                if (seconds < 3600 || seconds > 2592000) {
                  setError('Phase duration must be 1–720 hours');
                  return;
                }
                const commit = Math.floor(Date.now() / 1000) + seconds;
                setSchedule({
                  commit: String(commit),
                  reveal: String(commit + (mode === '1' ? seconds : 0)),
                });
              }}
            >
              Set exact phase deadlines
            </button>
            {schedule && (
              <p className="mono fine">
                Commit/review ends {new Date(Number(schedule.commit) * 1000).toISOString()}
                <br />
                Reveal ends {new Date(Number(schedule.reveal) * 1000).toISOString()}
              </p>
            )}
            <ActionPanel
              method="createCapsule"
              from={from}
              onFromChange={setFrom}
              args={[
                actionHash,
                manifest.evidenceRoot,
                manifest.simulationHash,
                label,
                schedule?.commit,
                schedule?.reveal,
                Number(quorum),
                Number(mode),
              ]}
              disabled={
                !consent ||
                !schedule ||
                !currentInput ||
                !label.trim() ||
                !/^[\x20-\x7E]+$/.test(label)
              }
            />
          </section>
        </>
      )}
    </div>
  );
}
