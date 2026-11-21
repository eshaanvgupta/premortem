# PREMORTEM

**Let the future fail before it happens. Proof before action.**

PREMORTEM is an Agent ID-gated advisory preflight and adversarial review protocol that anchors exact action/evidence hashes, independent reviews and final decision receipts on BSC.

| Submission item                | Honest current status                                                                                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live public site               | Not published; operator approval and hosting required                                                                                                                                                                                              |
| Public open-source repository  | [eshaanvgupta/premortem](https://github.com/eshaanvgupta/premortem); source publication authorized                                                                                                                                                 |
| Mainnet registry               | Not deployed; contract deployment explicitly awaits operator authorization                                                                                                                                                                         |
| Deployment transaction/receipt | Unavailable until authorized successful broadcast                                                                                                                                                                                                  |
| BscScan verified source link   | Unavailable until actual deployment and explorer verification                                                                                                                                                                                      |
| Agent ID contract              | `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`, official competition registry                                                                                                                                                                        |
| Agent ID usage                 | Actual `balanceOf(msg.sender)>0` for create, evidence, open review, commit and reveal; finalization is permissionless                                                                                                                              |
| Genuine campaign participation | Unavailable for an undeployed project; no fabricated users or on-chain totals                                                                                                                                                                      |
| Official Agentic Wallet write  | Not exercised with a real user wallet; requires consenting holder, configured official CLI, Developer Mode and gas                                                                                                                                 |
| Screenshot                     | Actual local UI captures: [desktop home](../artifacts/screenshots/home-desktop.png), [mobile home](../artifacts/screenshots/home-mobile.png), [Preflight Lab](../artifacts/screenshots/lab-desktop.png). These do not establish public deployment. |
| Audit                          | No formal independent audit claimed                                                                                                                                                                                                                |

This is a submission **draft**, not a representation that live eligibility is met. Replace status cells only with actual receipts, publicly retrievable URLs and complete measured history. Initial live read-only engine evidence is stored at [`evidence/live-readonly-preflight.json`](evidence/live-readonly-preflight.json); it does not establish protocol adoption.

## Core experience

The Preflight Lab independently queries current BSC state using exact sender, target, calldata and value; matches known selector formats; calls/estimates as supported; and emits deterministic evidence with uncertainty. The Future Tree presents observed, heuristic, failed and unknown branches without fictional safety scores. A capsule anchors normalized hashes and a bounded public label. Independent Agent ID holders provide categorized reviews or counterevidence. Blind rooms enforce separate commit/reveal phases and replay-resistant commitments. Final receipts expose advisory outcomes and on-chain provenance.

PREMORTEM never executes the proposed action, holds funds, asks for approvals, issues a token, offers yield or promises enforcement outside its own registry. The public website is read-only by default. Actual Agentic Wallet calls use a narrow JSON file and official user-controlled local CLI preview/confirmation route. No third-party QR login, wallet credential collection or server-held wallet sessions are implemented.

## Judging evidence

| Category                           | Answer                                                                                                                                                                                                                                                                          | Evidence to inspect                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Agent ID application depth — 30%   | Identity is a core authorization boundary on each substantive contribution, not a profile decoration. Actual sender eligibility, independent reviewer rules and address-deduplicated event analytics create an accountable review record. It is not proof of unique personhood. | `PremortemRegistry.sol`, holder/replay tests, `OWNER_PERMISSIONS.md`, actual receipts after launch  |
| Practicality and feasibility — 25% | Users can inspect exact proposed calldata, preserve uncertainty, obtain rival evidence and export a decision receipt without transferring assets. No model, paid API or database is required for deterministic workflows.                                                       | Core rules, CLI action schema, inspector/receipt UI, read-only live RPC artifact                    |
| Product completion — 25%           | The repository provides contract, deterministic SDK, UI, local wallet adapter, tests and deployment packaging. Mainnet/public launch and real wallet signing remain explicitly gated.                                                                                           | Actual validation report and build/browser artifacts; required launch cells above must be completed |
| Originality — 20%                  | An evidence-linked Future Tree and accountable open/blind preflight rooms combine deterministic observations with explicitly advisory independent dissent. No generated probability masquerades as measured security.                                                           | Preflight findings, room phase logic and raw manifest/receipt exports                               |

## Scope relative to adjacent projects

Agent Mart, BNBAgent SDK, 8004scan, Veil and WalletCordon are useful comparison targets for judges. Their current implementation claims have not been independently verified in this build, so no superiority claim is made. PREMORTEM's inspectable differentiation is its own combination of the competition-specific identity gate, advisory adversarial preflight rooms, domain-bound blind commitments, deterministic evidence branches and receipt verification. It deliberately has no marketplace, escrow, ERC-8004 directory, autonomous asset manager or transaction-enforcement mechanism. The [official BNB SDK description](https://docs.bnbchain.org/developer-kit/bnbagent-sdk/) documents separate ERC-8004/ERC-8183 infrastructure; those identities are not substituted here.

## Three concrete journeys to demonstrate with real users

1. A proposal author inspects an actual ERC-20 approval's exact calldata. The engine identifies the spender and allowance, highlights unlimited authority when present, records RPC results/limits, and anchors the consented manifest hash using their actual Agent ID wallet. The proposed approval itself is never executed by PREMORTEM.
2. A different genuine holder inspects an unfamiliar selector, labels the ABI unknown, contributes a specific observation and selects insufficient evidence rather than inventing confidence. A third holder adds counterevidence. Their bounded public notes and digests remain attributable in actual events.
3. Independent reviewers commit verdicts privately, retain their reveal packages, reveal only in the valid interval, and finalize after the deadline. A spectator exports a receipt and independently checks its chain evidence, including missing reveals and quorum/tie limitations.

These are intended live demo journeys, not a claim that the users or mainnet transactions already exist. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) and [ADOPTION.md](ADOPTION.md).

## Architecture and launch checklist

See the [architecture diagram](ARCHITECTURE.md), [two-page technical design](TECHNICAL_DESIGN.md), [threat model](THREAT_MODEL.md), [owner permissions](OWNER_PERMISSIONS.md), [verification runbook](VERIFY_DEPLOYMENT.md), and [limits](LIMITATIONS.md).

- [ ] Explicit authorization and funded user-controlled signer for BSC mainnet deployment.
- [ ] Successful actual deployment receipt and independently checked immutable identity/configuration.
- [ ] Exact source verified on BscScan; public source repository and site published with permission.
- [ ] Real Agentic Wallet custom-call flow tested with an actual consenting Agent ID holder.
- [ ] Live read + write + exported receipt independently verified on the deployed address.
- [ ] Meaningful genuine participation from at least 30 distinct eligible addresses during the official period, measured with complete coverage and no artificial activity.
- [ ] Submission completed by 9 December 2026, 08:00 UTC / 13:30 IST, with actual required URLs and contract addresses.

The official organizer controls eligibility and scoring. Participation is not official endorsement, guaranteed qualification or a promise of rewards.
