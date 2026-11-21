import { PageIntro, Notice, Hash, Raw } from '../../components/ui';
import { REGISTRY, AGENT_ID } from '../../lib/config';
import compiledAbi from '../../../../packages/contracts/abi/PremortemRegistry.json';
export const metadata = { title: 'Developers' };
export default function Page() {
  return (
    <div className="page prose-page">
      <PageIntro kicker="OPEN PROTOCOL / LOCAL FIRST" title="BUILD WITH PROOF.">
        Deterministic TypeScript, a compact immutable registry and a local wallet adapter. No
        mandatory database, model provider or paid API.
      </PageIntro>
      <section className="panel">
        <h2>Run from source</h2>
        <pre className="command-block">
          corepack enable{'\n'}pnpm install --frozen-lockfile{'\n'}pnpm dev{'\n'}# application:
          http://127.0.0.1:3000
        </pre>
        <p>
          Requires Node.js 22 or newer, pnpm 11.25, and Foundry for Solidity verification. On
          Windows with PowerShell execution restrictions, use <code>pnpm.cmd</code>.
        </p>
        <div className="two-column">
          <div>
            <h3>Core SDK</h3>
            <pre>{`import { inspectAction } from '@premortem/core';
const manifest = await inspectAction({
  chainId: 56,
  from: yourPublicAddress,
  to: targetContract,
  value: '0',
  data: exactCalldata,
});`}</pre>
          </div>
          <div>
            <h3>Local Agentic Wallet adapter</h3>
            <pre>{`pnpm nexora doctor --from 0x…
pnpm nexora inspect --from 0x… --to 0x… --data 0x --value 0
pnpm nexora capsule prepare --file premortem-action.json
pnpm nexora execute --file premortem-action.json`}</pre>
          </div>
        </div>
        <Notice>
          The first two commands are read-only. Prepare prints exact bytes. Execute requires a
          configured deployed protocol, official CLI login, unexpired Developer Mode and explicit
          confirmation. No authentication happens in the browser.
        </Notice>
      </section>
      <section className="panel">
        <h2>Chain configuration</h2>
        <dl className="dossier">
          <dt>Chain</dt>
          <dd>BNB Smart Chain · 56</dd>
          <dt>Protocol registry</dt>
          <dd>
            {REGISTRY ? <Hash value={REGISTRY} /> : 'UNKNOWN — awaiting authorized deployment'}
          </dd>
          <dt>Identity registry</dt>
          <dd>
            <Hash value={AGENT_ID} />
          </dd>
          <dt>Protocol</dt>
          <dd>PREMORTEM/1</dd>
          <dt>License</dt>
          <dd>MIT</dd>
        </dl>
        <p>
          Read directly through JSON-RPC and the ABI below. Public event scanning is paginated and
          bounded, with confirmation depth and partial-history reporting. Many official RPC
          endpoints disable eth_getLogs; use the documented public log fallbacks or your own
          provider.
        </p>
        <Raw value={compiledAbi} label="Complete compiler-generated protocol ABI" />
      </section>
      <section className="panel">
        <h2>Canonical commitments</h2>
        <p>
          Action hashes bind chain ID, protocol, creator, target, value, calldata hash, random salt,
          observation block number/hash and protocol version. Blind review commitments additionally
          bind capsule ID, reviewer, verdict, confidence, evidence digest, category and secret salt.
        </p>
        <p>
          Use <code>hashAction</code>, <code>hashManifest</code> and <code>reviewCommitment</code>{' '}
          from the core package. Never reconstruct hashes with ambiguous concatenation or
          floating-point token values.
        </p>
      </section>
      <section className="panel">
        <h2>Local explanation without model dependency</h2>
        <p>
          Deterministic findings already include plain-language observations and limitations.
          Optional AI interpretation can be requested only from your own explicitly configured local
          explanation proxy after consent; it never changes a deterministic finding or produces a
          signed transaction.
        </p>
        <p>
          The complete source package includes <code>packages/agent-skill/SKILL.md</code>, contract
          tests, deployment guards, a reproducible CI workflow and operational documentation.
        </p>
      </section>
      <section className="panel">
        <h2>Mainnet operator</h2>
        <p>
          The deployment page prepares the exact tested creation transaction, requests a separate
          MetaMask confirmation, and verifies the resulting code and receipt.
        </p>
        <a className="button outline" href="/deploy">
          Open mainnet deployment
        </a>
      </section>
    </div>
  );
}
