// SPDX-License-Identifier: MIT
pragma solidity 0.8.39;

import {PremortemRegistry} from "../src/PremortemRegistry.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function chainId(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
    function expectEmit(bool, bool, bool, bool) external;
    function deal(address, uint256) external;
    function etch(address, bytes calldata) external;
}

/// @notice TEST ONLY. Never imported by production src or deployment scripts.
contract MockAgentId {
    mapping(address => uint256) public balanceOf;
    bool public broken;

    function set(address a, uint256 n) external {
        balanceOf[a] = n;
    }

    function setBroken(bool b) external {
        broken = b;
    }

    fallback() external {
        revert();
    }
}

contract FailingAgentId {
    function balanceOf(address) external pure returns (uint256) {
        revert();
    }
}

contract MalformedAgentId {
    fallback() external {
        assembly {
            mstore(0, 1)
            return(0, 1)
        }
    }
}

contract GasBombAgentId {
    function balanceOf(address) external pure returns (uint256) {
        while (true) {}
        return 1;
    }
}

contract PremortemRegistryTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    PremortemRegistry internal r;
    MockAgentId internal id;
    address internal constant CREATOR = address(100);
    address internal constant A = address(101);
    address internal constant B = address(102);
    address internal constant C = address(103);
    bytes32 internal constant H = bytes32(uint256(1));
    bytes32 internal constant S = bytes32(uint256(2));
    event CapsuleCreated(
        uint256 indexed capsuleId,
        address indexed actor,
        bytes32 indexed actionHash,
        bytes32 evidenceRoot,
        bytes32 simulationHash,
        string label,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint8 minQuorum,
        uint8 reviewMode
    );
    event ReviewSubmitted(
        uint256 indexed capsuleId,
        address indexed actor,
        bytes32 indexed evidenceDigest,
        uint8 verdict,
        uint8 confidence,
        uint8 category
    );

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1_000_000);
        id = new MockAgentId();
        r = new PremortemRegistry(address(id));
        id.set(CREATOR, 1);
        id.set(A, 1);
        id.set(B, 1);
        id.set(C, 1);
    }

    function _create(bool blind) internal returns (uint256) {
        vm.prank(CREATOR);
        return r.createCapsule(
            H,
            H,
            H,
            "Check bounded approval",
            uint64(block.timestamp + 600),
            uint64(block.timestamp + (blind ? 1200 : 600)),
            2,
            blind ? 1 : 0
        );
    }

    function _vote(uint256 n, address a, uint8 v) internal {
        vm.prank(a);
        r.reviewOpen(n, v, 80, H, 1);
    }

    function _reveal(uint256 n, address a, uint8 v) internal {
        vm.prank(a);
        r.revealReview(n, v, 80, S, H, 1);
    }

    function _commit(uint256 n, address a, uint8 v) internal {
        bytes32 h = r.reviewCommitment(n, a, v, 80, H, 1, S);
        vm.prank(a);
        r.commitReview(n, h);
    }

    function _eq(uint256 a, uint256 b) internal pure {
        require(a == b, "not equal");
    }

    function testCreateAndRead() public {
        uint256 n = _create(false);
        _eq(n, 1);
        _eq(r.capsuleCount(), 1);
        require(r.getCapsule(n).creator == CREATOR);
    }

    function testCreateEvent() public {
        vm.expectEmit(true, true, true, true);
        emit CapsuleCreated(1, CREATOR, H, H, H, "Check bounded approval", 1_000_600, 1_000_600, 2, 0);
        _create(false);
    }

    function testReadMissing() public {
        vm.expectRevert(PremortemRegistry.CapsuleNotFound.selector);
        r.getCapsule(1);
    }

    function testTotalsMissing() public {
        vm.expectRevert(PremortemRegistry.CapsuleNotFound.selector);
        r.getReviewTotals(1);
    }

    function testIdentityCreate() public {
        vm.expectRevert(PremortemRegistry.AgentIdRequired.selector);
        r.createCapsule(H, H, H, "Test", 1_000_600, 1_000_600, 2, 0);
    }

    function testIdentityReview() public {
        _create(false);
        vm.expectRevert(PremortemRegistry.AgentIdRequired.selector);
        r.reviewOpen(1, 1, 80, H, 1);
    }

    function testIdentityCommit() public {
        _create(true);
        vm.expectRevert(PremortemRegistry.AgentIdRequired.selector);
        r.commitReview(1, H);
    }

    function testIdentityRevealRechecked() public {
        _create(true);
        _commit(1, A, 1);
        id.set(A, 0);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.AgentIdRequired.selector);
        r.revealReview(1, 1, 80, S, H, 1);
    }

    function testIdentityEvidence() public {
        _create(false);
        vm.expectRevert(PremortemRegistry.AgentIdRequired.selector);
        r.addEvidence(1, H, 0, "Observation");
    }

    function testLookupFailure() public {
        PremortemRegistry f = new PremortemRegistry(address(new FailingAgentId()));
        vm.expectRevert(PremortemRegistry.AgentIdLookupFailed.selector);
        f.createCapsule(H, H, H, "Test", 1_000_600, 1_000_600, 2, 0);
    }

    function testLookupMalformed() public {
        PremortemRegistry f = new PremortemRegistry(address(new MalformedAgentId()));
        vm.expectRevert(PremortemRegistry.AgentIdLookupFailed.selector);
        f.createCapsule(H, H, H, "Test", 1_000_600, 1_000_600, 2, 0);
    }

    function testLookupGasBounded() public {
        PremortemRegistry f = new PremortemRegistry(address(new GasBombAgentId()));
        vm.expectRevert(PremortemRegistry.AgentIdLookupFailed.selector);
        f.createCapsule(H, H, H, "Test", 1_000_600, 1_000_600, 2, 0);
    }

    function testConstructorMissingCode() public {
        vm.expectRevert(PremortemRegistry.InvalidAgentIdRegistry.selector);
        new PremortemRegistry(address(0));
    }

    function testMainnetRejectsMockRegistry() public {
        vm.chainId(56);
        vm.expectRevert(PremortemRegistry.InvalidAgentIdRegistry.selector);
        new PremortemRegistry(address(id));
    }

    function testSelfReview() public {
        _create(false);
        vm.prank(CREATOR);
        vm.expectRevert(PremortemRegistry.SelfReview.selector);
        r.reviewOpen(1, 1, 80, H, 1);
    }

    function testSelfCommit() public {
        _create(true);
        vm.prank(CREATOR);
        vm.expectRevert(PremortemRegistry.SelfReview.selector);
        r.commitReview(1, H);
    }

    function testDuplicateOpen() public {
        _create(false);
        _vote(1, A, 1);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.DuplicateReview.selector);
        r.reviewOpen(1, 1, 80, H, 1);
    }

    function testReviewEvent() public {
        _create(false);
        vm.expectEmit(true, true, true, true);
        emit ReviewSubmitted(1, A, H, 1, 80, 1);
        _vote(1, A, 1);
    }

    function testDuplicateCommit() public {
        _create(true);
        _commit(1, A, 1);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.DuplicateCommitment.selector);
        r.commitReview(1, H);
    }

    function testBlindCannotOpen() public {
        _create(true);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.WrongMode.selector);
        r.reviewOpen(1, 1, 80, H, 1);
    }

    function testOpenCannotCommit() public {
        _create(false);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.WrongMode.selector);
        r.commitReview(1, H);
    }

    function testOpenCannotReveal() public {
        _create(false);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.WrongMode.selector);
        r.revealReview(1, 1, 80, S, H, 1);
    }

    function testCommitBoundary() public {
        _create(true);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.WrongPhase.selector);
        r.commitReview(1, H);
    }

    function testOpenBoundary() public {
        _create(false);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.WrongPhase.selector);
        r.reviewOpen(1, 1, 80, H, 1);
    }

    function testRevealBeforeCommitDeadline() public {
        _create(true);
        _commit(1, A, 1);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.WrongPhase.selector);
        r.revealReview(1, 1, 80, S, H, 1);
    }

    function testRevealBoundary() public {
        _create(true);
        _commit(1, A, 1);
        vm.warp(1_001_200);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.WrongPhase.selector);
        r.revealReview(1, 1, 80, S, H, 1);
    }

    function testRevealWithoutCommit() public {
        _create(true);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.CommitmentMismatch.selector);
        r.revealReview(1, 1, 80, S, H, 1);
    }

    function testSaltBinding() public {
        _create(true);
        _commit(1, A, 1);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.CommitmentMismatch.selector);
        r.revealReview(1, 1, 80, H, H, 1);
    }

    function testVerdictBinding() public {
        _create(true);
        _commit(1, A, 1);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.CommitmentMismatch.selector);
        r.revealReview(1, 2, 80, S, H, 1);
    }

    function testEvidenceBinding() public {
        _create(true);
        _commit(1, A, 1);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.CommitmentMismatch.selector);
        r.revealReview(1, 1, 80, S, S, 1);
    }

    function testCategoryAndConfidenceBinding() public {
        _create(true);
        _commit(1, A, 1);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.CommitmentMismatch.selector);
        r.revealReview(1, 1, 81, S, H, 2);
    }

    function testReviewerBinding() public {
        _create(true);
        bytes32 h = r.reviewCommitment(1, A, 1, 80, H, 1, S);
        vm.prank(B);
        r.commitReview(1, h);
        vm.warp(1_000_600);
        vm.prank(B);
        vm.expectRevert(PremortemRegistry.CommitmentMismatch.selector);
        r.revealReview(1, 1, 80, S, H, 1);
    }

    function testCapsuleBinding() public {
        _create(true);
        _create(true);
        bytes32 h = r.reviewCommitment(1, A, 1, 80, H, 1, S);
        vm.prank(A);
        r.commitReview(2, h);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.CommitmentMismatch.selector);
        r.revealReview(2, 1, 80, S, H, 1);
    }

    function testChainBinding() public {
        _create(true);
        _commit(1, A, 1);
        vm.chainId(97);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.CommitmentMismatch.selector);
        r.revealReview(1, 1, 80, S, H, 1);
    }

    function testContractBinding() public {
        PremortemRegistry other = new PremortemRegistry(address(id));
        require(r.reviewCommitment(1, A, 1, 80, H, 1, S) != other.reviewCommitment(1, A, 1, 80, H, 1, S));
    }

    function testDuplicateReveal() public {
        _create(true);
        _commit(1, A, 1);
        vm.warp(1_000_600);
        _reveal(1, A, 1);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.DuplicateReview.selector);
        r.revealReview(1, 1, 80, S, H, 1);
    }

    function testBlindHappyPath() public {
        _create(true);
        _commit(1, A, 1);
        _commit(1, B, 1);
        vm.warp(1_000_600);
        _reveal(1, A, 1);
        _reveal(1, B, 1);
        vm.warp(1_001_200);
        r.finalizeCapsule(1);
        _eq(r.getCapsule(1).outcome, 1);
    }

    function testNoRevealInconclusive() public {
        _create(true);
        _commit(1, A, 1);
        _commit(1, B, 1);
        vm.warp(1_001_200);
        r.finalizeCapsule(1);
        _eq(r.getCapsule(1).outcome, 3);
    }

    function testTieInconclusive() public {
        _create(false);
        _vote(1, A, 1);
        _vote(1, B, 2);
        vm.warp(1_000_600);
        r.finalizeCapsule(1);
        _eq(r.getCapsule(1).outcome, 3);
    }

    function testInsufficientEvidenceNotApproval() public {
        _create(false);
        _vote(1, A, 1);
        _vote(1, B, 0);
        vm.warp(1_000_600);
        r.finalizeCapsule(1);
        _eq(r.getCapsule(1).outcome, 3);
    }

    function testRejectMajority() public {
        _create(false);
        _vote(1, A, 2);
        _vote(1, B, 2);
        _vote(1, C, 1);
        vm.warp(1_000_600);
        r.finalizeCapsule(1);
        _eq(r.getCapsule(1).outcome, 2);
    }

    function testInsufficientQuorum() public {
        _create(false);
        _vote(1, A, 1);
        vm.warp(1_000_600);
        r.finalizeCapsule(1);
        _eq(r.getCapsule(1).outcome, 3);
    }

    function testEarlyFinalization() public {
        _create(false);
        vm.expectRevert(PremortemRegistry.WrongPhase.selector);
        r.finalizeCapsule(1);
    }

    function testFinalizationPermissionless() public {
        _create(false);
        vm.warp(1_000_600);
        r.finalizeCapsule(1);
        _eq(r.getCapsule(1).outcome, 3);
    }

    function testFinalizeOnce() public {
        _create(false);
        vm.warp(1_000_600);
        r.finalizeCapsule(1);
        vm.expectRevert(PremortemRegistry.CapsuleClosed.selector);
        r.finalizeCapsule(1);
    }

    function testEvidenceFrozen() public {
        _create(false);
        vm.warp(1_000_600);
        r.finalizeCapsule(1);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.CapsuleClosed.selector);
        r.addEvidence(1, H, 0, "Evidence");
    }

    function testEvidencePhase() public {
        _create(false);
        vm.warp(1_000_600);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.WrongPhase.selector);
        r.addEvidence(1, H, 0, "Evidence");
    }

    function testDuplicateEvidence() public {
        _create(false);
        vm.startPrank(A);
        r.addEvidence(1, H, 0, "Observation");
        vm.expectRevert(PremortemRegistry.DuplicateEvidence.selector);
        r.addEvidence(1, H, 0, "Same observation");
        vm.stopPrank();
    }

    function testEvidenceDoesNotCountVotes() public {
        _create(false);
        vm.prank(A);
        r.addEvidence(1, H, 1, "Observation");
        (uint32 a, uint32 b, uint32 c, uint32 d) = r.getReviewTotals(1);
        _eq(uint256(a) + b + c + d, 0);
    }

    function testInvalidEnums() public {
        _create(false);
        vm.startPrank(A);
        vm.expectRevert(PremortemRegistry.InvalidReview.selector);
        r.reviewOpen(1, 3, 80, H, 1);
        vm.expectRevert(PremortemRegistry.InvalidReview.selector);
        r.reviewOpen(1, 1, 80, H, 8);
        vm.expectRevert(PremortemRegistry.InvalidReview.selector);
        r.addEvidence(1, H, 8, "Observation");
        vm.stopPrank();
    }

    function testInvalidConfidence() public {
        _create(false);
        vm.startPrank(A);
        vm.expectRevert(PremortemRegistry.InvalidReview.selector);
        r.reviewOpen(1, 1, 0, H, 1);
        vm.expectRevert(PremortemRegistry.InvalidReview.selector);
        r.reviewOpen(1, 1, 101, H, 1);
        vm.stopPrank();
    }

    function testZeroReviewHash() public {
        _create(false);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.InvalidHash.selector);
        r.reviewOpen(1, 1, 80, 0, 1);
    }

    function testZeroCommitHash() public {
        _create(true);
        vm.prank(A);
        vm.expectRevert(PremortemRegistry.InvalidHash.selector);
        r.commitReview(1, 0);
    }

    function testZeroCapsuleHash() public {
        vm.prank(CREATOR);
        vm.expectRevert(PremortemRegistry.InvalidHash.selector);
        r.createCapsule(0, H, H, "Test", 1_000_600, 1_000_600, 2, 0);
    }

    function testInvalidMode() public {
        vm.prank(CREATOR);
        vm.expectRevert(PremortemRegistry.InvalidMode.selector);
        r.createCapsule(H, H, H, "Test", 1_000_600, 1_000_600, 2, 2);
    }

    function testInvalidQuorum() public {
        vm.startPrank(CREATOR);
        vm.expectRevert(PremortemRegistry.InvalidQuorum.selector);
        r.createCapsule(H, H, H, "Test", 1_000_600, 1_000_600, 1, 0);
        vm.expectRevert(PremortemRegistry.InvalidQuorum.selector);
        r.createCapsule(H, H, H, "Test", 1_000_600, 1_000_600, 10, 0);
        vm.stopPrank();
    }

    function testQuorumBoundaries() public {
        vm.startPrank(CREATOR);
        r.createCapsule(H, H, H, "Two", 1_000_600, 1_000_600, 2, 0);
        r.createCapsule(H, H, H, "Nine", 1_000_600, 1_000_600, 9, 0);
        vm.stopPrank();
    }

    function testInvalidSchedule() public {
        vm.startPrank(CREATOR);
        vm.expectRevert(PremortemRegistry.InvalidSchedule.selector);
        r.createCapsule(H, H, H, "Test", 1_000_001, 1_000_001, 2, 0);
        vm.expectRevert(PremortemRegistry.InvalidSchedule.selector);
        r.createCapsule(H, H, H, "Test", 1_000_600, 1_001_200, 2, 0);
        vm.expectRevert(PremortemRegistry.InvalidSchedule.selector);
        r.createCapsule(H, H, H, "Test", 1_000_600, 1_000_601, 2, 1);
        vm.expectRevert(PremortemRegistry.InvalidSchedule.selector);
        r.createCapsule(H, H, H, "Test", uint64(1_000_000 + 31 days), uint64(1_000_000 + 31 days), 2, 0);
        vm.stopPrank();
    }

    function testUnicodeLabelRejected() public {
        vm.prank(CREATOR);
        vm.expectRevert(PremortemRegistry.InvalidText.selector);
        r.createCapsule(H, H, H, unicode"spoof\u202e", 1_000_600, 1_000_600, 2, 0);
    }

    function testWhitespaceLabelRejected() public {
        vm.prank(CREATOR);
        vm.expectRevert(PremortemRegistry.InvalidText.selector);
        r.createCapsule(H, H, H, "   ", 1_000_600, 1_000_600, 2, 0);
    }

    function testOverlongLabelRejected() public {
        string memory label = string(new bytes(97));
        vm.prank(CREATOR);
        vm.expectRevert(PremortemRegistry.InvalidText.selector);
        r.createCapsule(H, H, H, label, 1_000_600, 1_000_600, 2, 0);
    }

    function testNoPayableFunction() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(r).call{value: 1}(abi.encodeCall(r.finalizeCapsule, (1)));
        require(!ok);
    }

    function testNoReceiveOrFallback() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(r).call{value: 1}("");
        require(!ok);
        (ok,) = address(r).call(hex"deadbeef");
        require(!ok);
    }

    function testHashActionDomain() public view {
        bytes32 a = r.hashAction(56, address(r), A, B, 0, H, S, 10, H);
        bytes32 b = r.hashAction(97, address(r), A, B, 0, H, S, 10, H);
        require(a != b);
    }

    function testHashActionMatchesTypeScriptVector() public view {
        address a = 0x1111111111111111111111111111111111111111;
        address b = 0x2222222222222222222222222222222222222222;
        bytes32 d = 0x1111111111111111111111111111111111111111111111111111111111111111;
        require(
            r.hashAction(56, a, b, a, 123, keccak256(hex"12345678"), d, 123456, d)
                == 0x706ec86672d5285a3a477fb1d3f412f4d0bcb173ffbaf64568241056d5ae7485
        );
    }

    function testReviewCommitmentMatchesTypeScriptVector() public {
        address a = 0x1111111111111111111111111111111111111111;
        address b = 0x2222222222222222222222222222222222222222;
        bytes32 d = 0x1111111111111111111111111111111111111111111111111111111111111111;
        vm.etch(a, address(r).code);
        vm.chainId(56);
        require(
            PremortemRegistry(a).reviewCommitment(1, b, 1, 80, d, 2, d)
                == 0x3815e9d19be7c66bb1b0f88d3119f9c41c55eab299ea6e45aa8ec5738aceea33
        );
    }

    function testFuzzCommitmentBinding(
        uint256 capsuleId,
        address reviewer,
        uint8 verdict,
        uint8 confidence,
        bytes32 digest,
        uint8 category,
        bytes32 salt
    ) public view {
        bytes32 a = r.reviewCommitment(capsuleId, reviewer, verdict, confidence, digest, category, salt);
        bytes32 b = r.reviewCommitment(
            capsuleId, reviewer, verdict, confidence, digest, category, bytes32(uint256(salt) ^ 1)
        );
        require(a != b);
    }

    function testFuzzValidReview(uint8 verdict, uint8 confidence, uint8 category) public {
        verdict = uint8(uint256(verdict) % 3);
        confidence = uint8(uint256(confidence) % 100 + 1);
        category = uint8(uint256(category) % 8);
        _create(false);
        vm.prank(A);
        r.reviewOpen(1, verdict, confidence, H, category);
        require(r.hasReviewed(1, A));
        (uint32 a, uint32 b, uint32 c,) = r.getReviewTotals(1);
        _eq(uint256(a) + b + c, 1);
    }

    function testFuzzBadQuorum(uint8 quorum) public {
        if (quorum >= 2 && quorum <= 9) return;
        vm.prank(CREATOR);
        vm.expectRevert(PremortemRegistry.InvalidQuorum.selector);
        r.createCapsule(H, H, H, "Test", 1_000_600, 1_000_600, quorum, 0);
    }
}

contract ReviewHandler {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    PremortemRegistry public immutable r;
    uint256 public finalizedCount;
    uint256 public frozenVotes;

    constructor(PremortemRegistry registry) {
        r = registry;
    }

    function review(uint8 who, uint8 verdict) external {
        address actor = address(uint160(1001 + uint256(who) % 10));
        vm.prank(actor);
        try r.reviewOpen(1, uint8(uint256(verdict) % 3), 80, bytes32(uint256(1)), 1) {} catch {}
    }

    function finish(uint8 seed) external {
        if (seed % 16 != 0) return;
        vm.warp(1_000_600);
        try r.finalizeCapsule(1) {
            finalizedCount++;
            (uint32 a, uint32 b, uint32 c,) = r.getReviewTotals(1);
            frozenVotes = uint256(a) + b + c;
        } catch {}
    }
}

contract PremortemInvariantTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    PremortemRegistry private r;
    ReviewHandler private handler;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1_000_000);
        MockAgentId id = new MockAgentId();
        r = new PremortemRegistry(address(id));
        id.set(address(this), 1);
        for (uint160 i = 1001; i < 1011; i++) id.set(address(i), 1);
        r.createCapsule(
            bytes32(uint256(1)),
            bytes32(uint256(1)),
            bytes32(uint256(1)),
            "Invariant review",
            1_000_600,
            1_000_600,
            2,
            0
        );
        handler = new ReviewHandler(r);
    }

    function targetContracts() external view returns (address[] memory result) {
        result = new address[](1);
        result[0] = address(handler);
    }

    function invariantVotesBoundedByUniqueIdentities() public view {
        (uint32 a, uint32 b, uint32 c,) = r.getReviewTotals(1);
        require(uint256(a) + b + c <= 10);
        uint256 reviewed;
        for (uint160 i = 1001; i < 1011; i++) if (r.hasReviewed(1, address(i))) reviewed++;
        require(reviewed == uint256(a) + b + c);
    }

    function invariantFinalizationAtMostOnce() public view {
        require(handler.finalizedCount() <= 1);
    }

    function invariantFinalizationFreezesVotes() public view {
        if (handler.finalizedCount() == 1) {
            (uint32 a, uint32 b, uint32 c,) = r.getReviewTotals(1);
            require(uint256(a) + b + c == handler.frozenVotes());
        }
    }

    function invariantNoCustody() public view {
        require(address(r).balance == 0);
    }
}
