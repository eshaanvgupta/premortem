# @premortem/core

Deterministic, read-only BSC analysis and public protocol evidence. Production code imports no test providers or fabricated records.

```ts
import { inspectAction, scanProtocolEvents, verifyReceipt, canonicalJson } from '@premortem/core';

// value is canonical decimal wei, never a JS floating-point number.
const manifest = await inspectAction({
  from: userAddress,
  to: targetAddress,
  value: '0',
  data: calldata,
});
console.log(canonicalJson(manifest));

const page = await scanProtocolEvents({
  address: deployedRegistry,
  fromBlock: deploymentBlock,
  chunkSize: 2000n,
  maxChunks: 50,
});
// If coverage is partial, continue from page.nextBlock. Never display the
// current page as a complete protocol count.
const receipt = await verifyReceipt({
  address: deployedRegistry,
  transactionHash,
});
```

`inspectAction` validates BSC chain ID 56 before any simulation. It records the latest block number/hash/timestamp, then requests target code, `eth_call`, and `eth_estimateGas` with the same explicit block and exact sender/target/value/calldata. A provider refusing historical gas estimates produces a failure observation; it never silently changes the context to latest. Optional `trace:true` requests `debug_traceCall`; unavailable trace support is explicit.

Recognized selectors provide an ABI hypothesis, not target authenticity. Results distinguish known selectors, unknown selectors, malformed input and empty calldata. Rules identify allowance changes, maximal uint256 allowances, NFT operator authority, token recipients, recipient mismatches, native value, common ownership/upgrade/pause methods, nonpayable ABI conflicts and possible false token returns. All findings include rule version, provenance, confidence and limitations. There is no total safety score.

Canonical JSON recursively sorts object keys, preserves arrays, rejects nonfinite/unsafe JS numbers and unsupported types, and serializes bigints as decimal strings. It is the project's canonical format, not a claim of RFC 8785 compliance. `evidenceRoot` hashes the complete findings array. `simulationHash` hashes `{action,context,simulation}` so sender, exact bytes and historical context are bound to the RPC observations. Hashes do not turn RPC assertions into cryptographic proofs.

`hashAction` and `reviewCommitment` use `abi.encode` and the contract's domain type hashes, chain ID, registry address and protocol version. Commit salts must come from a cryptographically secure random generator and remain private until reveal. The action hash binds creator; callers preparing a capsule must require the inspected source equals the publishing creator or disclose and separately bind a different source through the simulation hash. Shared fixed vectors are asserted against the compiled Solidity implementation.

`verifyManifest(exportedJson,{registry,creator,expected:{actionHash,evidenceRoot,simulationHash}})` checks a locally supplied manifest and salt against capsule hashes read from chain. It validates the action/context, source-to-creator binding, decoder output, runtime metadata and deterministic findings, then recomputes all three hashes. It handles malformed/oversized input without throwing and returns detailed checks. All three expected on-chain hashes are required to mark it verified. The result establishes matching content; it does not establish the truth of included historical RPC responses or the safety of the proposal.

The scanner uses explicit registry addresses, bounded block ranges, strict event decoding, duplicate filtering and canonical block-hash checks. It checks the requested head anchor before and after ingestion to reject mixed-fork results. It returns partial coverage on RPC failures, likely response caps or page limits. Provider silent omission cannot be conclusively detected by an ordinary JSON-RPC client. The default 20-block finality margin is an application policy, not a mathematical reorg guarantee. Public-node log access is needed because official dataseed RPCs may disable `eth_getLogs`.

`participationStats` counts distinct event actor addresses only for identity-gated creation/evidence/open-review/commit/reveal actions, within the requested timestamp interval. It excludes permissionless finalizers, duplicate events, pending observations and out-of-window actions. The competition interval defaults to `[2026-11-18T08:00:00Z,2026-12-09T08:00:00Z)`. This counts qualifying contract observations, not unique humans, recruitment or organizer acceptance. Trust in the configured registry's authentic runtime remains necessary.

`verifyReceipt` fetches a mined receipt, checks success, destination, transaction hash, canonical block hash, finality, official Agent ID getter, log inclusion metadata and matching event signatures. `buildDecisionReceipt` independently checks every supplied event transaction, compares each supplied event's actual parameters and inclusion position, and reads capsule state at a confirmed block. Empty event lists never pass. `creationEvidenceVerified` separately reports whether a verified creation event matches queried capsule state. It explicitly does not assert complete historical coverage. Neither function is a light client or a substitute for comparing the registry runtime with the verified deployment manifest.

Pass `expectedCodeHash` to either receipt API to additionally compare the contract runtime at the receipt block with the actual deployment's pinned keccak256 hash. Without a pin, `registryAuthenticity` is `NOT_ATTESTED` even when event inclusion checks pass. A pin itself must come from an authenticated deployment manifest. `BSC_CHAIN` is a local viem chain definition for BSC mainnet and avoids importing unrelated chain definitions into the client bundle.

Public IndexedDB cache helpers are optional. A cached scan checkpoint's canonical hash is checked before use, including empty scanned ranges. `syncProtocolEvents({...options,previous,cacheKey})` validates the prior checkpoint, resumes before its cursor by the finality overlap, replaces overlapped events, updates confirmations and progresses beyond bounded page budgets. A changed checkpoint restarts at deployment. Cache failures do not break live reads. Consumers must replace stale overlapping events; never union unverified cached counts into live metrics.

Run `pnpm --filter @premortem/core test` and `pnpm --filter @premortem/core typecheck` from the repository root. Network-free tests use injected RPC fixtures only in `test/`. Tests include 250-case integer and calldata property checks and ABI consistency against the generated contract artifact.
