// SPDX-License-Identifier: MIT
pragma solidity 0.8.39;

import {PremortemRegistry} from "../src/PremortemRegistry.sol";

interface DeployVm {
    function envBool(string calldata key) external returns (bool);
    function startBroadcast() external;
    function stopBroadcast() external;
}

/// @notice Deployment requires both an explicit local authorization flag and a signer passed to Forge.
/// @dev No mock registry import exists anywhere in this script or src/. Never logs private keys.
contract Deploy {
    DeployVm private constant vm = DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (PremortemRegistry registry) {
        require(block.chainid == 56, "BSC mainnet chain ID required");
        require(vm.envBool("PREMORTEM_DEPLOY_AUTHORIZED"), "Operator authorization required");
        address officialId = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
        require(officialId.code.length > 0, "Official Agent ID bytecode missing");
        vm.startBroadcast();
        registry = new PremortemRegistry(officialId);
        vm.stopBroadcast();
        require(registry.AGENT_ID() == officialId, "Wrong identity registry");
    }
}
