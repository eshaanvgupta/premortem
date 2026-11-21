# User guide

Run `pnpm install` and `pnpm dev`, then open `http://localhost:3000`. Public reading and deterministic inspection require no wallet, model, API key or database. A real protocol address is required to browse actual capsules; the initial undeployed configuration clearly reports that state.

## Inspect an action

In Preflight Lab enter the exact source wallet, target, integer wei value and hex calldata. Review the decoded selector and arguments, contract bytecode, current block context, call result, gas estimate, findings and limitations. Use the Future Tree to inspect the evidence behind each branch. Unknown is a valid result; neither success nor an advisory approval proves future safety. Export and retain the original manifest to reproduce its content hash.

CLI alternative:

```sh
pnpm nexora inspect --from YOUR_SOURCE_ADDRESS --to YOUR_TARGET_ADDRESS --value 0 --data 0x
```

Replace the explicit placeholder strings with actual addresses. This command only calls read-only RPC methods and never executes the proposed action. You can inspect asset-related calldata without approving or transferring assets.

## Set up Agent ID and the local wallet route

Claim Agent ID only in Binance App > Wallet homepage > Agent ID banner. Use the [official wallet installation guide](https://web3.binance.com/en/dev-docs/products/agentic-wallet/install) and official skill in your trusted local agent runtime. NEXORA never hosts login QR codes or accepts pairing codes. Agent ID is a nontransferable identifier, not proof of unique personhood.

Set local `PREMORTEM_REGISTRY` to the actual independently verified deployed address and `PREMORTEM_CODE_HASH` to its independently authenticated runtime bytecode hash. A contract that merely imitates the identity getter cannot pass that pin. Use `BSC_RPC_URL` only when overriding the default keyless providers. Run `pnpm nexora doctor --from YOUR_ACTUAL_AGENTIC_WALLET_ADDRESS`. Developer Mode is managed only in the App; review its risk warning, spend limit and expiry. On Windows the adapter runs the official package JavaScript with Node directly; if it cannot locate that installed package, set `BAW_CLI_JS` to its trusted absolute `dist/index.js` path.

## Publish a capsule or review

Create a capsule from an actual inspection. Choose a bounded public label, quorum, open/blind mode and deadlines. Consent deliberately to public disclosure. “Prepare for my Agent” downloads a scoped JSON action for your local runtime. It does not connect to Agentic Wallet or sign in the browser.

```sh
pnpm nexora capsule prepare --file action.json
pnpm nexora capsule create --file action.json
```

The first command prints exact calldata, network, destination, method, parameters, zero BNB transfer and a gas estimate. The second checks Developer Mode, simulates, runs official wallet preview, shows risks/authority changes, and requires the human to type `CONFIRM MAINNET`. This spends real gas if you authorize it. Never have an agent type confirmation for you. If App confirmation is pending, finish there; do not blindly repeat execute.

Independent reviewers must hold Agent ID in the actual sender account. They cannot review their own capsule and each address completes at most one review. Select risk category, a specific observation/evidence digest and honest confidence. “Insufficient evidence” is legitimate. Open review uses `pnpm nexora review open --file action.json`.

In blind mode, preserve the private reveal package and cryptographically random salt. Commit during the first phase using `review commit`; reveal the same verdict/evidence/confidence/category/salt in the reveal phase using `review reveal`. Losing or changing the package prevents reveal. A commitment alone never counts toward an outcome. Treat the reveal package as private until reveal; do not upload it prematurely.

Use `evidence add --file action.json` for rival evidence and a substantive bounded public note. After the room closes, `capsule finalize --file action.json` computes the immutable advisory result. Finalization is permissionless; it does not execute the underlying action.

## Verify a receipt

Paste the confirmed transaction hash to refresh the UI or run `pnpm nexora receipt --hash ACTUAL_TX_HASH`. The CLI requires 20 descendant blocks, canonical block agreement, matching historical runtime hash and actual protocol event evidence. Export the decision receipt and retain it with any locally held manifests. The independent verifier re-fetches chain evidence and reports missing/mismatched logs. A pending or reverted transaction is never a successful contribution.

Live Proof deduplicates actual qualifying holder actions by address and competition time window. Historic, testnet and permissionless-only finalization activity does not qualify. Partial scans cannot establish a campaign-wide total. The organizer decides eligibility independently. There are no rewards for dummy activity, no guarantees of award qualification, and no asset transfers in NEXORA protocol actions.
