# Local contract review evidence

This is an engineering review, not a formal audit. No deployment or wallet signing occurred.

Toolchain: Foundry 1.10.0 (official Linux release SHA256 verified), Solidity 0.8.39 (official release, current stable on November 20, 2026), EVM Paris, optimizer 200, metadata bytecodeHash none. Windows Application Control blocked native binaries; tests ran in the available Ubuntu 24.04 WSL environment. Exact outputs are retained alongside this file.

`forge test -vvv --gas-report`: **70 passed, 0 failed, 0 skipped**. Foundry groups four invariant functions into one invariant suite test: 69 unit/fuzz tests plus that grouped test. Fuzz cases: three functions x256 runs. Invariant suite: 128 runs x32 calls =4096 calls. Invariants cover unique identity count, vote totals, finalization at most once, frozen votes and no custody on the tested call surface. It does not prove no forced Ether can arrive through EVM mechanisms.

Cross-language action and review hash vectors from the TypeScript SDK passed against compiled Solidity. Unit cases include creator self-review, duplicate review/commit/reveal, exact phase boundaries, wrong modes, identity loss before reveal, gas-exhausting/malformed/reverting identity lookup, chain/reviewer/capsule/contract/salt/verdict/evidence binding, enums, quorum boundaries, abstention/tie outcomes, ASCII/bidi limits, event fields, no payable entry points and no fallback.

Slither ran **101 detectors** against two production contracts/interfaces. It reported **8 results**: six low-severity timestamp findings, one informational assembly usage finding, and one informational uppercase immutable naming finding. No high/medium findings were reported by this run. `reports/slither.txt` and `reports/slither.json` preserve the unfiltered findings.

Manual disposition:

- Timestamp use is deliberate phase enforcement. Minimum phase duration is five minutes, but validator timestamp influence and inclusion delays still affect boundaries. Users must leave a buffer; no price, randomness, financial payout or asset release depends on timestamps.
- Assembly copies at most32 return bytes from an immutable trusted identity `STATICCALL`, with a60,000 gas cap, and requires exact32-byte returndata. Scratch memory is used only within memory-safe assembly. This removes the unbounded-returndata issue initially identified by Forge lint. The malformed/gas-bomb tests exercise failure paths. Recheck actual official identity gas usage before deployment.
- `AGENT_ID` uppercase is a deliberate ABI constant-style immutable, not a privilege.
- Explicit zero-address and bytecode checks prevent empty constructor dependencies; chain56 additionally forces the official address.
- No ownership, upgrade, admin path, arbitrary call, asset transfer or normal payable entry point exists. Sender identity and creator independence are rechecked at each holder action.
- Counters use fixed widths and checked arithmetic; no operation iterates across reviewers. Printable-text validation loops are bounded to96/160 bytes.
- Reviews can still be dishonest; addresses do not prove unique humans. Hashes do not prove evidence truth or availability, and malicious creators may anchor arbitrary nonzero hashes.
- The external official identity proxy semantics/source were not retrieved from BscScan during research. Its issuer powers and future implementation changes remain external trust assumptions.

Gas report maxima (mock identity in isolated test VM; not BSC gas quotes): create194,953; open review61,646; commit81,297; reveal64,681; add evidence61,047; finalize33,155. Deployment execution reported1,625,752 gas, initcode7541 bytes, runtime7253 bytes. Actual estimates must use the official registry and current mainnet gas price. Failed calls are included in min/average figures and must not be interpreted as successful-action cost estimates.
