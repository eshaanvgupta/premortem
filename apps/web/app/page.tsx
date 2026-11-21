import Link from 'next/link';
import { Radar, ScanLine, Fingerprint, GitBranch, Shield, Terminal } from 'lucide-react';
import { HomeLive } from '../components/live';
import { RiftEffect } from '../components/rift-effect';
export default function Home() {
  return (
    <>
      <section className="hero">
        <RiftEffect />
        <div className="hero-grid" />
        <div className="hero-content">
          <div className="eyebrow">
            <span className="accent-line" /> AUTONOMOUS AGENTS. ACCOUNTABLE DECISIONS.
          </div>
          <h1>
            LET THE
            <br />
            FUTURE{' '}
            <span className="fail-word">
              FAIL
              <svg viewBox="0 0 340 30" aria-hidden="true">
                <path d="m3 20 115-13 103 7L337 3" />
              </svg>
            </span>
            <br />
            <span className="outline-text">BEFORE IT</span>
            <br />
            HAPPENS<span className="accent">.</span>
          </h1>
          <p className="hero-description">
            Every action has a future.
            <br />
            Find the failure before you commit to it.
          </p>
          <div className="hero-buttons">
            <Link href="/lab" className="button">
              Enter Preflight Lab <ScanLine size={18} />
            </Link>
            <Link href="/arena" className="text-link">
              Explore the Arena
            </Link>
          </div>
          <div className="hero-footnote">
            <Shield size={14} /> NO CUSTODY <span>/</span> NO ASSET TRANSFERS <span>/</span> HUMAN
            AUTHORIZATION
          </div>
        </div>
        <div className="hero-art" aria-label="Illustrative branching signal paths">
          <div className="signal-field" />
          <div className="art-coordinate coord-top">
            RISK IS A BRANCH.
            <br />
            NOT A NUMBER.
          </div>
          <svg className="signal-scene" viewBox="0 0 600 600" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="signal-fade" x1="70" x2="550" gradientUnits="userSpaceOnUse">
                <stop stopColor="currentColor" stopOpacity="0" />
                <stop offset=".25" stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" stopOpacity=".85" />
              </linearGradient>
            </defs>
            <g className="signal-guides">
              <path d="M70 120H550M70 240H550M70 360H550M70 480H550M120 80V520M240 80V520M360 80V520M480 80V520" />
            </g>
            <path className="signal-ghost" d="M50 310H166C242 310 225 455 322 455H548" />
            <path className="signal-secondary" d="M50 310H170C252 310 247 330 335 330H548" />
            <path className="signal-main" d="M50 310H170C246 310 232 165 328 165H548" />
            <path className="signal-fracture-shadow" d="m319 76-49 119 43 69-44 88 47 84-31 87" />
            <path className="signal-fracture" d="m319 76-49 119 43 69-44 88 47 84-31 87" />
            <g className="signal-terminals">
              <circle cx="170" cy="310" r="8" />
              <circle cx="548" cy="165" r="6" />
              <circle cx="548" cy="330" r="4" />
              <circle cx="548" cy="455" r="4" />
            </g>
            <path className="signal-bracket" d="M80 90H60V110M520 510H540V490" />
          </svg>
          <div className="art-node node-a">
            <span /> OBSERVE
          </div>
          <div className="art-node node-b">
            <span /> CHALLENGE
          </div>
          <div className="art-node node-c">
            <span /> ATTEST
          </div>
          <div className="art-coordinate coord-bottom">
            ILLUSTRATIVE SIGNAL STUDY
            <br />
            NO PREDICTED PROBABILITIES
          </div>
          <div className="art-caption">
            <GitBranch size={16} /> THE FUTURE TREE <span>01 / ∞</span>
          </div>
        </div>
      </section>
      <HomeLive />
      <section className="narrative section">
        <div className="section-heading">
          <span className="eyebrow">A SECOND LOOK. BEFORE THE FIRST MOVE.</span>
          <h2>
            CONVICTION IS CHEAP.
            <br />
            <span className="muted">MAKE IT VERIFIABLE.</span>
          </h2>
          <p>
            Independent evidence. Adversarial review.
            <br />A decision you can actually trace.
          </p>
        </div>
        <div className="steps">
          <article>
            <ScanLine />
            <span className="mono accent">OBSERVE /</span>
            <h3>Interrogate the action.</h3>
            <p>
              Decode calldata. Inspect real chain state. Run the exact proposed call. See what is
              known, what failed, and what remains unknown.
            </p>
            <Link href="/lab">Open the lab</Link>
          </article>
          <article>
            <Fingerprint />
            <span className="mono accent">CHALLENGE /</span>
            <h3>Put identity behind dissent.</h3>
            <p>
              Agent ID holders publish capsules and challenge assumptions. Blind reviews reduce
              visible vote anchoring with commit and reveal phases.
            </p>
            <Link href="/arena">Find a capsule</Link>
          </article>
          <article>
            <Radar />
            <span className="mono accent">REMEMBER /</span>
            <h3>Leave a flight recorder.</h3>
            <p>
              Every review has an author. Every verdict has evidence. Export an independently
              checked receipt grounded in on-chain events.
            </p>
            <Link href="/recorder">Inspect the record</Link>
          </article>
        </div>
      </section>
      <section className="manifesto section">
        <span className="eyebrow">THE TRUST BOUNDARY</span>
        <h2>
          PROOF BEFORE ACTION.
          <br />
          <span className="accent">AUTHORITY STAYS WITH YOU.</span>
        </h2>
        <div>
          <p>
            NEXORA reviews proposed actions. It never executes them, takes custody, or grants token
            approvals. A community verdict is advice, and uncertainty stays visible.
          </p>
          <Link href="/security" className="button outline">
            Read the security model <Terminal size={17} />
          </Link>
        </div>
      </section>
    </>
  );
}
