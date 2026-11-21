# Deployment and verification runbook

**Current status: no operator-authorized contract deployment or website publication. GitHub source publication is authorized.** The user's instruction prohibits all contract deployment until explicit authorization. Embedded local EVM tests may construct test contracts as test fixtures; no wallet or network broadcast is authorized by that testing. Do not run a broadcast command merely because it appears in this runbook.

## Before asking for approval

Use a clean checkout, Node 22+ and the lockfile-pinned pnpm version. Install Foundry according to its official installation instructions; use the provided wrapper where available. Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:contracts`, `pnpm build`, `pnpm secret:scan` and browser/accessibility checks. Inspect actual outputs and unresolved findings. Review compiler/optimizer metadata from the generated Foundry artifacts and match it during verification.

`pnpm prepare:mainnet` is a **read-only readiness check**. It must assert chain 56, official registry bytecode, identity ABI calls and current code/test/build artifacts. Preparation may estimate deployment gas without sending. It cannot substitute for a full review. Before any deployment, recheck official rules and wallet docs, review the contract bytecode and disclose exact gas estimate and current gas price. Multiply gas estimate by gas price and convert wei to BNB; do not promise a fixed cost.

## Approval and signer

Obtain explicit authorization to deploy, including destination network and estimated gas. Use a user-controlled funded signer through a local keystore or hardware wallet supported by Foundry. Never put a private key in the website, public environment variables, shell command history, repository, logs or remote services. A deployer key is unnecessary for public reads. `PREMORTEM_DEPLOY_AUTHORIZED=true` is an additional script guard, **not user consent**; only set it after receiving that consent.

The Solidity deployment script in `packages/contracts/script/Deploy.s.sol` enforces chain 56 and the official Agent ID contract. Use the compiler/optimizer/EVM settings in `foundry.toml`; deploy no proxy. A local/testnet deployment, if desired, also needs the user's explicit authorization under the current instruction. Mock identity contracts are test-only and cannot replace the official registry in mainnet construction.

## After an authorized successful broadcast

1. Independently fetch the successful receipt and canonical block, check `to=null` creation, actual contract address and deployed bytecode. Record transaction hash, block number/hash, compiler and optimizer settings, constructor arguments, chain ID and official identity address in the deployment manifest. Never guess an address or mark an unconfirmed transaction deployed.
2. Confirm `AGENT_ID()` equals `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`, version/hash constants agree, no owner/proxy/admin methods exist and no token allowance is requested. Check runtime bytes against compiled creation outputs with immutable address substitution accounted for.
3. Verify source on BscScan using its supported API with a local API key or upload exact Solidity Standard JSON Input and constructor arguments in the official UI. Match compiler version, optimizer runs, EVM version and metadata settings exactly. `pnpm verify:mainnet` checks deployment receipt/runtime agreement; it reports BscScan source status as `NOT_ESTABLISHED`. Explorer verification requires separate actual official UI/API evidence. Local compilation or runtime matching alone is never BscScan verification.
4. Only after verification set `NEXT_PUBLIC_PREMORTEM_REGISTRY`, `PREMORTEM_REGISTRY`, `NEXT_PUBLIC_PREMORTEM_CODE_HASH`, `PREMORTEM_CODE_HASH` and the deployment block configuration to those actual outputs. The code hash is the keccak256 of the authenticated deployed runtime, including its actual immutable identity address. Set `NEXT_PUBLIC_SITE_URL` only after hosting exists. Redeploy the frontend using these reviewed public settings.
5. Ask an actual claimed Agent ID holder to authorize one meaningful limited-gas capsule/review flow through the official local CLI; inspect preview and require confirmation. Verify receipt and event evidence independently. Never use an EOA merely claiming to represent the Agentic Wallet.
6. Publish source and website only after explicit permission; record real repository/site URLs. Hosting may use Vercel-compatible Next.js or the included Docker configuration. Public read-only pages need no deployer secret.
7. Recruit legitimate independent reviewers for meaningful reviews during the competition window; the software cannot manufacture eligibility. Check complete log coverage and genuine distinct addresses before stating any participation total. Maintain a real disclosure contact and operational owner.

## Hosting and operations

Configure RPC endpoints that support needed methods; dataseed logs may be disabled. Deployments must set the actual registry start block so clients can bound history. Keep public cache records keyed by chain, registry and canonical block; refresh on reorgs. Health monitoring should expose only public chain/config status. Do not add analytics that capture calldata, reveal packages or wallet sessions. Test mobile, keyboard, reduced motion, CSP and RPC failure behavior against the actual hosted origin.

API verification keys are optional when manual BscScan verification is used. Public hosting is an external prerequisite. Exact BNB gas and hosting cost depend on provider and live conditions. No mainnet contract address, verified-source status, real wallet write result, public site URL or participant count is supplied by this runbook.

## Source package and container

`node scripts/release.mjs` creates `release/premortem-source.tar.gz`, a SHA-256 file manifest and archive checksum. It includes source, lockfile, generated public verification package, reports and actual screenshots. It excludes installed dependencies, all `.next*` outputs/caches, downloaded tooling/research, private environment files, credential formats, logs and symlinks. It never publishes or deploys. Identical input bytes give identical archive bytes; rerun after final changes. The secret-pattern check is an additional safeguard, not a complete credential audit.

With Docker available, `docker compose up --build` builds the lockfile-pinned Node 24 / pnpm 11 image and binds the website to local `127.0.0.1:3000`. The server binds `0.0.0.0` inside its container. Only public `NEXT_PUBLIC_*` configuration is accepted as build arguments; no wallet/deployer credentials are copied. Public environment values are embedded by the Next.js build and need a rebuild after changes. The container runs as the unprivileged Node user with a read-only health probe. The initial runtime image retains the installed workspace dependency tree, including development dependencies, to preserve reliable pnpm/Next.js resolution; it is not a minimal standalone image. A Docker daemon is an external local tooling requirement; do not claim a successful container build unless actually executed.
