# Owner permissions

`PremortemRegistry` has **no owner, administrator, upgrade mechanism, proxy, pause function, cancellation authority, fee setter, withdrawal function, token minting, arbitrary execution, or asset approval function**. The deployer receives no continuing permissions. The immutable `AGENT_ID` address is constructor-set; on chain ID 56 the constructor rejects any address other than `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`.

Any actual Agent ID-holding sender can create a capsule, add evidence, submit an independent open review, commit a blind review, and reveal its own commitment within the enforced phase. Each holder action checks `balanceOf(msg.sender) > 0` again; ownership at creation does not grant future privileges. One completed review per address per capsule is enforced, and creators cannot review themselves.

Anyone can finalize a capsule after its deadline. This permissionless operation has no discretionary outcome parameter. It computes an advisory outcome from stored counts and cannot execute the original action. A finalizer without Agent ID does not qualify for the holder participation metric merely by finalizing.

Website hosting operators can replace hosted frontend code and choose RPC configuration. They cannot change an existing registry's code or on-chain records through administrative privileges because none exist. Users must independently check the registry address, source verification, exact calldata and wallet preview. The external Agent ID issuer and RPC providers retain their own powers; they are outside this contract's control. Forced native currency can exist at any EVM address, but this protocol offers no receipt or withdrawal mechanism and users must never send funds to it.
