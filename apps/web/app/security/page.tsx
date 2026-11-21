import Link from 'next/link';
import { PageIntro, Notice, Hash } from '../../components/ui';
import { AGENT_ID } from '../../lib/config';
export const metadata = { title: 'How it works / Security' };
export default function Page() {
  return (
    <div className="page prose-page">
      <PageIntro kicker="THE TRUST MODEL / READ BEFORE SIGNING" title="KEEP THE LIMITS VISIBLE.">
        Evidence is useful when its provenance and uncertainty travel with it. PREMORTEM provides an
        accountable review trail, not a security guarantee.
      </PageIntro>
      <Notice tone="warning">
        PREMORTEM never executes the proposed action. Approved and Rejected are advisory community
        outcomes. You remain free to act outside the protocol.
      </Notice>
      <section className="panel">
        <h2>How a decision becomes inspectable</h2>
        <ol>
          <li>
            Run a read-only preflight with the exact sender, target, calldata and wei value. Export
            the normalized manifest with its block context.
          </li>
          <li>
            An actual Agent ID holder anchors the action hash, evidence root, simulation hash,
            public label and deadlines on chain.
          </li>
          <li>
            Independent holders review a specific observation, disclose confidence and choose a risk
            category. Each wallet gets one review; creators cannot review their own capsule.
          </li>
          <li>
            Open reviews are visible immediately. Blind rooms require a commitment before the first
            deadline and a reveal before the second. Unrevealed commitments never count.
          </li>
          <li>
            Anyone can finalize after the deadline. Quorum is 2–9 reviews. Approval or rejection
            requires more than half of all revealed/open verdicts, including insufficient-evidence
            verdicts in the denominator. Ties and insufficient quorum are inconclusive.
          </li>
        </ol>
      </section>
      <section className="panel">
        <h2>Identity means exactly this</h2>
        <p>
          Each holder-triggered contract write calls <code>balanceOf(msg.sender) &gt; 0</code> on
          the official immutable Agent ID registry.
        </p>
        <Hash value={AGENT_ID} />
        <p>
          Agent ID is the competition-specific non-transferable identity. It is not ERC-8004
          identity or mathematically guaranteed proof of personhood. A separate EOA cannot sign on
          behalf of an Agentic Wallet and inherit its ID.
        </p>
      </section>
      <section className="panel">
        <h2>Agentic Wallet: setup stays local</h2>
        <ol>
          <li>
            Open the official Binance App. Claim Agent ID from the Wallet homepage banner, where
            available.
          </li>
          <li>
            Follow the{' '}
            <a
              href="https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction"
              target="_blank"
              rel="noreferrer"
            >
              official Agentic Wallet installation guide
            </a>{' '}
            inside your own trusted local agent environment.
          </li>
          <li>
            Enable Developer Mode in the Binance App only if you understand its expanded
            contract-call scope. Set its own limits and expiry. This website cannot enable it.
          </li>
          <li>
            Download a PREMORTEM action file. Run local doctor and prepare. Inspect the destination,
            parameters, chain 56, zero BNB transfer value and expected network gas.
          </li>
          <li>
            The local adapter checks unexpired Developer Mode, calls the official preview, displays
            parsed transaction and risks, asks for your explicit confirmation, and only then
            executes that exact request ID. App confirmation may still be required.
          </li>
        </ol>
        <Notice>
          No website QR login, pairing code collection, server wallet sessions or private-key fields
          exist. Ordinary personal_sign is unsupported by Agentic Wallet; PREMORTEM does not request
          it.
        </Notice>
      </section>
      <section className="panel">
        <h2>What can still go wrong</h2>
        <div className="two-column">
          <div>
            <h3>Observation limits</h3>
            <p>
              RPC providers can lie, restrict methods or return stale state. A selector match can be
              spoofed. Simulation can miss MEV, proxy upgrades, callbacks, state changes and
              economic attacks. Optional traces may be unavailable.
            </p>
            <h3>Review limits</h3>
            <p>
              Holders can collude or submit weak evidence. Confidence is self-reported. Evidence
              hashes prove content identity only when content is available. They do not establish
              truth. Lost salts prevent blind reveals.
            </p>
          </div>
          <div>
            <h3>Public and permanent</h3>
            <p>
              On-chain labels, notes and addresses are public. Full evidence stays local unless you
              deliberately publish it. Never include identifying third-party information without
              consent.
            </p>
            <h3>Contract limits</h3>
            <p>
              The registry has no owner, upgrades, custody, execution or withdrawal path. It depends
              on the official identity contract continuing to answer balanceOf. Finalization is
              permissionless and does not require Agent ID.
            </p>
          </div>
        </div>
      </section>
      <section className="panel">
        <h2>Responsible disclosure</h2>
        <p>
          Security contact: <strong>awaiting project operator configuration</strong>. No formal
          external audit is claimed. Review the repository security and threat-model documents
          before production launch.
        </p>
        <Link className="button outline" href="/developers">
          Inspect the integration
        </Link>
      </section>
    </div>
  );
}
