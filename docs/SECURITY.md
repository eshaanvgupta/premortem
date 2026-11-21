# Security policy

PREMORTEM records advisory review and evidence. It does not guarantee transaction safety, enforce actions elsewhere, verify real-world identity uniqueness, custody assets, or execute the proposal. No formal independent audit has been completed.

The contract has no privileged owner and exposes only nonpayable write functions. Every holder-triggered operation checks the actual sender against the official identity registry; lookup failures revert. Creator self-review, repeated reviews, mismatched blind commitments, cross-domain replay and out-of-phase writes revert. Labels and notes are bounded printable ASCII; the frontend must still render all external content as text.

The local CLI invokes trusted executables using argument arrays without a shell. It validates action files with strict allowlists and exact integer strings, checks chain 56 and deployed protocol/identity bytecode, checks `AGENT_ID`, simulates zero-value calls and shows method parameters. Official `baw` Developer Mode settings and preview gate execution. Confirmation cannot be automated with a flag. App pending/rejection/expiry is respected and an ambiguous execute result is never automatically retried. CLI authentication remains in the user's official wallet tooling; PREMORTEM stores no session or key.

The adapter requires a matching parsed preview destination and zero amount/value, compares recognized echoed sender/network/calldata fields, and rejects asset operations. Unknown or opaque preview structures cannot execute. The official guide does not guarantee raw-byte echoes for every custom contract; omitted-field binding remains trusted to the official preview request ID/backend, not independently proven by this wrapper. Actual custom-call compatibility requires a consenting holder's live preview.

Public manifests can disclose addresses, calldata and operational intent. Inspect locally and publish only information you deliberately consent to share. Do not submit secrets, personal identifying metadata, private deliberations or reveal salts before the reveal phase. Public hashes can still be dictionary-attacked when their inputs have low entropy. Use a cryptographically random 32-byte reveal salt and preserve the private reveal package; losing it prevents reveal.

All simulation uses exact sender/target/value/data and reports block context. Selector matches identify a format, not authentic token behavior. Unknown ABI, failed calls, absent traces and unavailable verification remain explicit limitations. An estimated successful call can later fail or behave differently. Public RPCs observe requests and can censor, lie, lag or truncate; receipts are RPC-checked, not cryptographic light-client proofs.

Responsible disclosure contact: **awaiting operator configuration**. No email address is fabricated. Before public launch, provide a monitored private reporting channel, triage owner and response expectations. Until then, use the repository's private security reporting facility if enabled; do not publish active exploit details or sensitive wallet information in public issues.

See [THREAT_MODEL.md](THREAT_MODEL.md), [OWNER_PERMISSIONS.md](OWNER_PERMISSIONS.md), [AUDIT_CHECKLIST.md](AUDIT_CHECKLIST.md) and [LIMITATIONS.md](LIMITATIONS.md). Passing tests and advisory scans do not establish absence of vulnerabilities.
