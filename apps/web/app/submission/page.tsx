import Link from 'next/link';
import { PageIntro, Notice, Hash } from '../../components/ui';
import { REGISTRY, SITE_URL } from '../../lib/config';
export const metadata = { title: 'Judges / Submission' };
export default function Page() {
  return (
    <div className="page prose-page">
      <PageIntro kicker="JUDGES DOSSIER / HONEST STATUS" title="PROOF BEFORE ACTION.">
        NEXORA is an Agent ID-native preflight and adversarial review protocol for proposed
        consequential on-chain actions.
      </PageIntro>
      <Notice tone="warning">
        Production eligibility remains unverified until mainnet deployment, public source
        verification, hosting and genuine adoption are complete. This page never fabricates a launch
        or participant count.
      </Notice>
      <section className="panel">
        <h2>Launch evidence</h2>
        <dl className="dossier">
          <dt>Mainnet registry</dt>
          <dd>{REGISTRY ? <Hash value={REGISTRY} /> : 'NOT DEPLOYED / NOT CONFIGURED'}</dd>
          <dt>BscScan source verification</dt>
          <dd>Check independently after authorized deployment</dd>
          <dt>Public repository</dt>
          <dd>
            <a href="https://github.com/eshaanvgupta/premortem" target="_blank" rel="noreferrer">
              eshaanvgupta/premortem · public source
            </a>
          </dd>
          <dt>Public site</dt>
          <dd>{SITE_URL ? <a href={SITE_URL}>{SITE_URL}</a> : 'Not configured in this build'}</dd>
          <dt>Genuine eligible holders</dt>
          <dd>
            <Link href="/proof">Inspect live event coverage and measured count</Link>
          </dd>
        </dl>
      </section>
      <section className="panel">
        <h2>90-second user journey</h2>
        <ol>
          <li>
            <strong>0–20 seconds:</strong> Open Preflight Lab, enter a real proposed action and
            inspect the exact chain context, decoded selector, call result and unknowns.
          </li>
          <li>
            <strong>20–40 seconds:</strong> Explore the Future Tree, export the evidence manifest
            and prepare a capsule with explicit public disclosure.
          </li>
          <li>
            <strong>40–65 seconds:</strong> A real Agent ID holder publishes via their local trusted
            wallet. Independent holders submit substantive evidence-backed reviews in an open or
            blind room.
          </li>
          <li>
            <strong>65–90 seconds:</strong> Finalize after deadlines, inspect dissent, export a
            receipt and independently verify transaction evidence in Flight Recorder.
          </li>
        </ol>
      </section>
      <section className="panel">
        <h2>Why this belongs on chain</h2>
        <div className="two-column">
          <div>
            <h3>Agent ID depth · 30%</h3>
            <p>
              Identity gates creation, evidence, review, commitment and reveal at the contract
              boundary. The actual caller must hold the official ID.
            </p>
            <h3>Practicality · 25%</h3>
            <p>
              Read-only, deterministic observation works without a model or database. No asset
              custody or transaction execution introduces a second trust dependency.
            </p>
          </div>
          <div>
            <h3>Completion · 25%</h3>
            <p>
              Public reader, evidence lab, review rooms, wallet tooling and verifiable receipts form
              one inspectable workflow. Launch status remains explicit.
            </p>
            <h3>Originality · 20%</h3>
            <p>
              Evidence-linked failure branches and independent sealed review produce an accountable
              decision receipt. This is a review protocol rather than an agent directory,
              marketplace or money manager.
            </p>
          </div>
        </div>
      </section>
      <section className="panel">
        <h2>Three useful missions</h2>
        <p className="tag">EDUCATIONAL MISSIONS — NOT ON-CHAIN CAPSULES</p>
        <ol>
          <li>
            Inspect an actual ERC-20 allowance request and document the spender and unlimited
            authority warning.
          </li>
          <li>
            Challenge the assumptions behind an unfamiliar contract selector where source
            authenticity remains unknown.
          </li>
          <li>
            Review a real administrative or multisig proposal against its deadline, calldata and
            external dependencies.
          </li>
        </ol>
        <p>
          Participation must be voluntary and substantive. No bot wallets, fabricated reviews or
          transaction farming. Gas is paid by the signer; estimate it before confirming.
        </p>
        <Link href="/lab" className="button">
          Start a useful observation
        </Link>
      </section>
      <p>
        Competition window: 18 November 2026 08:00 UTC – 9 December 2026 08:00 UTC. Innovation
        eligibility requires at least 30 genuinely distinct Agent ID addresses interacting with
        submitted contracts. Organizers independently determine eligibility.
      </p>
      <a
        href="https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf"
        target="_blank"
        rel="noreferrer"
      >
        Read the official competition announcement
      </a>
    </div>
  );
}
