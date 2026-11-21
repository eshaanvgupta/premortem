# Mainnet launch handoff

The operator authorized BNB Smart Chain mainnet deployment and public application publication on 21 November 2026. Transaction signing still happens in the operator's own wallet. No private key is needed in chat, application configuration or this repository.

The mainnet creation is complete: `0x042632f7476D6293145D13d17CD8834922Eb2F39`, transaction `0xca409953042c1bea3ab9da3e73969f82d3bf3d84204c2cd57bf766c9faabd259`, deployment block **134836356**. The production app disables further creation when this registry is configured. NEXORA retains the deployed `PREMORTEM/1` domain and source contract name.

## MetaMask creation transaction

For a separately intended fresh deployment from an unconfigured build, open `/deploy` in a browser with MetaMask. Select BNB Smart Chain mainnet (chain 56), connect the funded deployer account, and review the live gas estimate. Click **Request MetaMask deployment confirmation**, then inspect and confirm the creation transaction in MetaMask.

- Transfer value: **0 BNB**. The sender pays network gas.
- No recipient (`to` omitted): this is direct contract creation, not a transfer to the zero address.
- Official Agent ID constructor argument: `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`.
- Initcode hash: `0x7f5220c7c1ad68b7a72cc310464fe497bdfd2c6a9418bc1d90ce897a259fdbfe`.
- Expected runtime hash: `0x75f282f00279ca552e0ff2a4ec944f96b24815466582339548a62e98f2e05e14`.
- Compiler: `0.8.39+commit.ce47f2c8`, optimizer 200, Paris.
- No admin, proxy, upgrade mechanism or custody.

The page validates the current official Agent ID code pin, obtains a sender-specific gas estimate, checks funding and requires the selected account and chain to remain unchanged. It records an in-progress submission before opening the wallet. It blocks resubmission after an interrupted confirmation and can recover an existing transaction hash without broadcasting again. An explicit wallet rejection permits a fresh confirmation.

After 20 confirmations the page checks the exact input, zero value, direct creation address, canonical receipt, runtime hash and `AGENT_ID()` getter. Download the verified deployment manifest. Explorer source verification is a separate remaining action; this page never claims it has verified source on BscScan.

The user's separate MetaMask Wallet Bridge is published, but its tools were not exposed to this Codex session. Its current transaction schema also requires `to`, so it cannot submit this direct creation transaction. The deployment page uses the standard browser EIP-1193 interface directly. It does not change the bridge or substitute for the Binance Agentic Wallet.

## Finish configuration after the wallet confirmation

1. Supply the real transaction hash to `DEPLOYMENT_TRANSACTION=<hash> pnpm verify:mainnet`. The command checks the actual chain and produces `packages/contracts/deployments/mainnet.json` after finality.
2. Verify `src/PremortemRegistry.sol:PremortemRegistry` on BscScan with the exact Standard JSON in `release/mainnet/standard-input.json` and constructor arguments in `release/mainnet/constructor-arguments.txt`. Use the operator's explorer account/API credential when required. Never commit that credential.
3. Set `NEXT_PUBLIC_PREMORTEM_REGISTRY`, `NEXT_PUBLIC_PREMORTEM_CODE_HASH`, `NEXT_PUBLIC_DEPLOYMENT_BLOCK`, `NEXT_PUBLIC_SITE_URL`, and `NEXT_PUBLIC_BSC_RPC_URL`. Rebuild using `pnpm build:static` and publish the exact tested export. These variables are public build configuration.
4. Check live reads and event scanning from the deployment block. `node scripts/check-log-rpc.mjs` makes read-only mainnet calls and compares actual token logs against canonical transaction receipts. This establishes present endpoint capability; it does not establish NEXORA history completeness or promise provider availability.
5. Have an actual official Agent ID holder create a substantive capsule through the official Agentic Wallet CLI adapter, then independent holders review it. Capture preview, consent, real receipt and exported verification evidence. MetaMask deployment alone does not establish Agentic Wallet compatibility.

## Reproducible validation

`pnpm prepare:deployment` regenerates the public creation bundle from the local compiler artifact and rejects changes to the reviewed runtime pin. It never broadcasts.

`pnpm test:deployment` runs three browser tests against the exact static export and a fresh isolated Anvil chain. It uses a captured official identity runtime solely to exercise creation-code checks locally. Its unlocked local accounts and identity state establish no real holder participation. All browser RPC calls and transaction submissions in this suite stay on localhost. It covers absent wallets, wrong-chain refusal, explicit wallet rejection, exact creation input, runtime/receipt verification, reload recovery and duplicate prevention.

For static hosting, capsule URLs use `/capsule?id=<id>` so new capsule IDs need no rebuild or server rendering. Standard Next.js server deployment remains supported. `apps/web/public/_headers` supplies security headers for Cloudflare static assets; verify these headers on any alternative host.
