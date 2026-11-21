# Protocol and SDK API

Authoritative ABI: [`packages/contracts/abi/PremortemRegistry.json`](../packages/contracts/abi/PremortemRegistry.json). Protocol version: `PREMORTEM/1`. Addresses, hashes and integer precision must be preserved exactly. All writes are nonpayable and the CLI always sends value zero.

| Method            | Parameters in ABI order                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createCapsule`   | `bytes32 actionHash, bytes32 evidenceRoot, bytes32 simulationHash, string calldataLabel, uint64 commitDeadline, uint64 revealDeadline, uint8 minQuorum, uint8 reviewMode` |
| `addEvidence`     | `uint256 capsuleId, bytes32 evidenceDigest, uint8 evidenceType, string shortNote`                                                                                         |
| `reviewOpen`      | `uint256 capsuleId, uint8 verdict, uint8 confidence, bytes32 evidenceDigest, uint8 category`                                                                              |
| `commitReview`    | `uint256 capsuleId, bytes32 commitment`                                                                                                                                   |
| `revealReview`    | `uint256 capsuleId, uint8 verdict, uint8 confidence, bytes32 salt, bytes32 evidenceDigest, uint8 category`                                                                |
| `finalizeCapsule` | `uint256 capsuleId`                                                                                                                                                       |

Read functions include `AGENT_ID()`, `capsuleCount()`, `getCapsule(id)`, `getReviewTotals(id)`, `hasReviewed(id,address)`, `hasCommitted(id,address)`, `reviewCommitment(...)` and `hashAction(...)`. Getter tuple field names and integer widths are in the ABI. Capsule IDs start at 1. Missing IDs revert.

Modes are `0=open`, `1=blind`. Verdicts are `0=insufficient evidence`, `1=approve`, `2=reject`. Outcomes are `0=pending`, `1=approved`, `2=rejected`, `3=inconclusive`. Confidence is 1–100 and has no voting weight. Category and evidence type are integers 0–7. The frontend describes categories; on chain they are bounded classification values, not a factual oracle.

Labels are 1–96 printable ASCII bytes; evidence notes are 1–160. Whitespace-only or non-ASCII/control text is rejected. Hashes and reveal salts must be nonzero bytes32. Quorum is 2–9. Open rooms require identical commit/reveal deadlines; blind rooms have separate phases. Each phase is at least 5 minutes and at most 30 days, measured from creation or the previous deadline. Commit/open writes require `timestamp < commitDeadline`; reveals require `commitDeadline <= timestamp < revealDeadline`; finalize requires `timestamp >= revealDeadline`. Evidence closes at reveal deadline and all mutations close after finalization.

Only completed open or revealed votes count. Insufficient-evidence votes count toward quorum and the total denominator. Approval or rejection requires quorum and **strictly more than half of all counted votes**. Any tie, insufficient quorum, or no absolute majority gives Inconclusive. Unrevealed commitments never count. There is no cancel or edit method.

Events are `CapsuleCreated`, `EvidenceAdded`, `ReviewSubmitted`, `ReviewCommitted`, `ReviewRevealed`, `CapsuleFinalized`. All have indexed `capsuleId` and actual `actor`; creation also indexes `actionHash`, evidence/review events index their evidence digest. A finalizer is permissionless and its event alone must not count as an Agent ID contribution.

## Hashing

`hashManifest` deterministically sorts object keys, rejects ambiguous unsupported values, serializes integer quantities as documented strings and hashes UTF-8 canonical JSON. Preserve the exported original manifest; recomputing a fresh preflight at another block produces a different artifact.

Action hashing uses `keccak256(abi.encode(ACTION_TYPEHASH, chainId, protocol, creator, target, value, keccak256(data), salt, blockNumber, blockHash, VERSION_HASH))`. The type string is `PremortemAction(uint256 chainId,address protocol,address creator,address target,uint256 value,bytes32 dataHash,bytes32 salt,uint256 blockNumber,bytes32 blockHash,bytes32 versionHash)` and `VERSION_HASH=keccak256("PREMORTEM/1")`.

Blind commitments use `keccak256(abi.encode(REVIEW_TYPEHASH, chainId, protocol, capsuleId, reviewer, verdict, confidence, evidenceDigest, category, salt))`. The type string is `PremortemReview(uint256 chainId,address protocol,uint256 capsuleId,address reviewer,uint8 verdict,uint8 confidence,bytes32 evidenceDigest,uint8 category,bytes32 salt)`. Never use `abi.encodePacked` or a human-readable concatenation.

```ts
import {
  inspectAction,
  reviewCommitment,
  hashAction,
  createBscClient,
  REGISTRY_ABI,
} from '@premortem/core';

// Addresses and calldata come from the user; this function does not sign.
const manifest = await inspectAction({ from, to, value: '0', data: '0x' });
const rpc = createBscClient();
const capsule = await rpc.readContract({
  address: registry,
  abi: REGISTRY_ABI,
  functionName: 'getCapsule',
  args: [1n],
});
```

The SDK exposes raw RPC observations, decoded selector data, findings with source/ruleVersion/confidence/limitations, evidence roots and simulation hashes. Event APIs return completeness/coverage information; callers must preserve partial-history warnings. Receipt verification re-fetches actual transaction receipts and canonical blocks; it establishes consistency with the queried RPC, not independent consensus proof.

## Local action JSON

`premortem-action/1` uses `chainId:56`, exact `registry`, exact `from`, allowlisted `method`, `args` in the table's order and `value:"0"`. `uint256` and `uint64` arguments are decimal strings; uint8 enums are JSON numbers. Optional `data` and `calldataHash` are compared with independently encoded bytes. Unknown fields/methods and mismatches fail. Do not place credentials or private proposal content in the file.

`PREMORTEM_REGISTRY` is deliberately required in the local environment and must match the file's address. `PREMORTEM_CODE_HASH` is also required and pins the independently authenticated deployed runtime bytes. The CLI checks the runtime hash and `AGENT_ID()`; receipt verification checks the runtime at the receipt block and requires 20 descendant blocks. The operator still must independently authenticate the configured deployment source/address/hash. This is not a universal contract verification service.
