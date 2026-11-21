# Manual security review checklist

This checklist supports review and does not constitute an audit. Record findings and actual tool results in the validation report. Unchecked items remain open.

- [x] Contract has no owner/proxy/admin withdrawal/asset execution method; writes are nonpayable.
- [x] Mainnet constructor rejects alternate identity registry; identity lookups are static and gas bounded.
- [x] Each holder action checks actual sender; creator review and duplicate review/commit are rejected.
- [x] Review values, evidence hashes, ASCII bounds, schedules, quorum and finalization state have explicit checks.
- [x] Commitment domain includes chain, contract, capsule, reviewer, verdict, confidence, evidence, category and salt.
- [x] Finalization is constant-time, permissionless after the deadline and ignores nonrevealed commitments.
- [x] CLI restricts protocol methods, value zero and chain 56; no shell string interpolation or automated consent flag.
- [x] CLI checks settings before constructing calldata, preview before execute, user confirmation before execute, and expiry again after confirmation.
- [x] Preview/execute errors and pending App confirmation are not reported as a confirmed transaction.
- [x] Local Agent ID access uses the official documented `balanceOf` test; no names or reverse lookups are required.
- [ ] Independently audit exact deployed bytecode and compiler settings after operator-authorized deployment.
- [ ] Inspect the verified external identity registry source/privileges and validate gas bound against actual holders.
- [ ] Complete actual Agentic Wallet custom-call preview, confirmation and receipt workflow with a consenting holder.
- [ ] Obtain an independent Solidity/application security review before relying on this system for high-value decisions.
- [ ] Configure monitored responsible disclosure contact and incident triage owner before public launch.
- [ ] Review live hosting CSP/origin policies, RPC retention and logs; verify no unexpected telemetry.
- [ ] Confirm complete historical event coverage, reorg behavior and organizer interpretation of participation metrics.

Fuzz/invariant, static-analysis, dependency-audit and browser checks must be reported as their exact actual results. Missing Slither/Docker/browser tooling is a limitation, never a pass. A vulnerability scan cannot establish that evidence claims or community verdicts are true.
