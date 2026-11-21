# Deployment records

No PREMORTEM registry has been deployed by this build. No deployment address, transaction hash, or BscScan verification is asserted.

A real mainnet deployment manifest must be generated from a successful chain56 receipt, not from a prediction or example address. Record protocol version, chain ID, registry address, official identity address, deployer, deployment transaction, receipt block/hash, exact compiler/settings, runtime code hash and BscScan verification status. Wire the frontend registry and deployment start block from that manifest only after independently checking them.

Tests instantiate contracts only inside Foundry's isolated VM. Test identity mocks are confined to `test/` and must never be used by mainnet configuration.
