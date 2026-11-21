# Contracts

Solidity 0.8.39, optimizer 200, EVM Paris, metadata bytecode hash disabled. No external Solidity dependency is needed. `src/` and the mainnet deployment script never import the test identity mock.

Run `forge build`, `forge test -vvv`, `forge test --gas-report`, `forge snapshot`, then `node script/export-artifacts.mjs`. The checked ABI is generated from the compiler output. Install Foundry from its official release or use root `pnpm test:contracts`. Host Windows application policy may prevent downloaded binaries; an installed WSL/Linux environment can run the same commands.

The contract has no owner, administrator, cancellation, upgrade, withdrawal, payable method, asset transfer, token, allowance, or arbitrary action execution. Proposed calldata is never executable through this protocol. A forcibly sent native balance cannot be withdrawn.

## Exact state machine

- Modes: 0 open, 1 blind. Verdicts: 0 insufficient evidence, 1 approve, 2 reject. Outcomes: 0 pending, 1 approved, 2 rejected, 3 inconclusive.
- Confidence is 1..100. Risk/evidence category is 0..7. Quorum is 2..9 independent wallets.
- Each phase lasts at least five minutes and at most 30 days. Open rooms have equal commit/reveal deadlines. Blind rooms add a separate reveal interval.
- Reviews/commits use `[creation, commitDeadline)`; reveals use `[commitDeadline, revealDeadline)`; evidence uses `[creation, revealDeadline)`; finalization starts at `revealDeadline`.
- Every creator/reviewer/committer/revealer/evidence author is checked against the immutable Agent ID `balanceOf(msg.sender)` at the action time. Finalization is permissionless and is not an eligible identity participation action.
- One review per address per capsule; creators cannot review or commit their own room. Non-reveals do not count. Insufficient evidence counts toward quorum, but approving or rejecting requires more than half of **all** revealed/open reviews, including insufficient evidence. Otherwise the result is inconclusive. Confidence does not weight votes.
- Finalization freezes the capsule; bounded counters mean no iteration over voters is needed. All strings use printable ASCII (nonblank, label <=96 bytes, note <=160 bytes) to reject bidi/control spoofing.
- Evidence notes and digests are claims. No mechanism proves their truth, public availability, uploader consent, or relation to a proposal. Reviewers should independently inspect the referenced observation. Hash zero is rejected, but nonzero hashes alone do not establish meaningful review.

## Hashes

`hashAction` and `reviewCommitment` expose the exact `abi.encode` domain rules shared with the core SDK. Commitments bind chain ID, protocol address, capsule ID, reviewer, verdict, confidence, evidence digest, category and salt. Use cryptographically random nonzero salts and keep unrevealed details private. Lost salt means the review cannot be revealed.

The protocol stores an opaque action hash. It cannot prove that a creator's claimed `from` address authored the proposal, that the supplied hash follows the SDK schema, or that chain data was honest. The public receipt verifier must compare the independently recomputed manifest hash against the stored value. Creator identity and proposed transaction sender are separate facts.

## Deployment gate

No deployment is performed by tests: creation happens inside an isolated EVM. The script only targets chain 56 and the official identity address and requires `PREMORTEM_DEPLOY_AUTHORIZED=true`. It still needs an operator-controlled signer and explicit approval before use. `forge script script/Deploy.s.sol --rpc-url "$BSC_RPC_URL" --account <local-keystore>` simulates; adding `--broadcast` spends gas and requires user authorization. Never put a deployment key in a web environment.

This is unaudited software. Passing tests is not a formal audit. See the manual review and threat model in `docs/`.
