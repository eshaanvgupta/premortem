// SPDX-License-Identifier: MIT
pragma solidity 0.8.39;

/// @notice Minimal official Agent ID interface. No enumeration or name resolution is assumed.
interface IAgentId {
    function balanceOf(address account) external view returns (uint256);
}

/// @title PREMORTEM immutable advisory review registry
/// @notice Records review evidence only. Never executes proposed actions, holds assets, or grants approvals.
/// @dev No owner, upgrade, cancellation, payable entry point, or arbitrary-call function exists.
contract PremortemRegistry {
    address public constant OFFICIAL_AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address public immutable AGENT_ID;
    bytes32 public constant VERSION_HASH = keccak256("PREMORTEM/1");
    bytes32 public constant ACTION_TYPEHASH = keccak256(
        "PremortemAction(uint256 chainId,address protocol,address creator,address target,uint256 value,bytes32 dataHash,bytes32 salt,uint256 blockNumber,bytes32 blockHash,bytes32 versionHash)"
    );
    bytes32 public constant REVIEW_TYPEHASH = keccak256(
        "PremortemReview(uint256 chainId,address protocol,uint256 capsuleId,address reviewer,uint8 verdict,uint8 confidence,bytes32 evidenceDigest,uint8 category,bytes32 salt)"
    );
    uint64 public constant MIN_PHASE = 5 minutes;
    uint64 public constant MAX_PHASE = 30 days;
    uint256 public capsuleCount;

    // reviewMode: 0 open, 1 blind. verdict: 0 insufficient, 1 approve, 2 reject.
    // outcome: 0 pending, 1 approved, 2 rejected, 3 inconclusive.
    struct Capsule {
        address creator;
        uint64 createdAt;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint8 minQuorum;
        uint8 reviewMode;
        uint8 outcome;
        uint32 approvals;
        uint32 rejections;
        uint32 insufficient;
        uint32 commitments;
        bytes32 actionHash;
        bytes32 evidenceRoot;
        bytes32 simulationHash;
        string label;
    }

    mapping(uint256 => Capsule) private capsules;
    mapping(uint256 => mapping(address => bool)) public hasReviewed;
    mapping(uint256 => mapping(address => bytes32)) private commitments;
    mapping(uint256 => mapping(address => mapping(bytes32 => bool))) private evidenceSubmitted;

    error InvalidAgentIdRegistry();
    error AgentIdLookupFailed();
    error AgentIdRequired();
    error InvalidHash();
    error InvalidText();
    error InvalidSchedule();
    error InvalidQuorum();
    error InvalidMode();
    error CapsuleNotFound();
    error CapsuleClosed();
    error WrongPhase();
    error WrongMode();
    error SelfReview();
    error DuplicateReview();
    error DuplicateCommitment();
    error DuplicateEvidence();
    error InvalidReview();
    error CommitmentMismatch();

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
    event EvidenceAdded(
        uint256 indexed capsuleId,
        address indexed actor,
        bytes32 indexed evidenceDigest,
        uint8 evidenceType,
        string shortNote
    );
    event ReviewSubmitted(
        uint256 indexed capsuleId,
        address indexed actor,
        bytes32 indexed evidenceDigest,
        uint8 verdict,
        uint8 confidence,
        uint8 category
    );
    event ReviewCommitted(uint256 indexed capsuleId, address indexed actor, bytes32 commitment);
    event ReviewRevealed(
        uint256 indexed capsuleId,
        address indexed actor,
        bytes32 indexed evidenceDigest,
        uint8 verdict,
        uint8 confidence,
        uint8 category
    );
    event CapsuleFinalized(
        uint256 indexed capsuleId,
        address indexed actor,
        uint8 outcome,
        uint32 approvals,
        uint32 rejections,
        uint32 insufficient
    );

    /// @dev Mainnet cannot be constructed with an alternative or test identity contract.
    constructor(address agentId) {
        if (
            agentId == address(0) || agentId.code.length == 0
                || (block.chainid == 56 && agentId != OFFICIAL_AGENT_ID)
        ) {
            revert InvalidAgentIdRegistry();
        }
        AGENT_ID = agentId;
    }

    modifier holder() {
        _requireHolder();
        _;
    }

    function _requireHolder() private view {
        // STATICCALL with a bound prevents callbacks and excessive gas consumption from a broken dependency.
        bytes memory input = abi.encodeCall(IAgentId.balanceOf, (msg.sender));
        address identity = AGENT_ID;
        bool ok;
        uint256 resultSize;
        uint256 identityBalance;
        // Copy at most one word, including on revert: malformed return data cannot cause a return bomb.
        assembly ("memory-safe") {
            ok := staticcall(60000, identity, add(input, 32), mload(input), 0, 32)
            resultSize := returndatasize()
            identityBalance := mload(0)
        }
        if (!ok || resultSize != 32) revert AgentIdLookupFailed();
        if (identityBalance == 0) revert AgentIdRequired();
    }

    /// @notice Anchor public manifest hashes and a bounded ASCII label. Full calldata remains off chain.
    function createCapsule(
        bytes32 actionHash,
        bytes32 evidenceRoot,
        bytes32 simulationHash,
        string calldata calldataLabel,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint8 minQuorum,
        uint8 reviewMode
    ) external holder returns (uint256 capsuleId) {
        if (actionHash == 0 || evidenceRoot == 0 || simulationHash == 0) {
            revert InvalidHash();
        }
        _text(calldataLabel, 96);
        if (minQuorum < 2 || minQuorum > 9) revert InvalidQuorum();
        if (reviewMode > 1) revert InvalidMode();
        if (commitDeadline < block.timestamp + MIN_PHASE || commitDeadline > block.timestamp + MAX_PHASE) {
            revert InvalidSchedule();
        }
        if (reviewMode == 0) {
            if (revealDeadline != commitDeadline) revert InvalidSchedule();
        } else if (revealDeadline < commitDeadline + MIN_PHASE || revealDeadline > commitDeadline + MAX_PHASE)
        {
            revert InvalidSchedule();
        }
        capsuleId = ++capsuleCount;
        Capsule storage c = capsules[capsuleId];
        c.creator = msg.sender;
        c.createdAt = uint64(block.timestamp);
        c.commitDeadline = commitDeadline;
        c.revealDeadline = revealDeadline;
        c.minQuorum = minQuorum;
        c.reviewMode = reviewMode;
        c.actionHash = actionHash;
        c.evidenceRoot = evidenceRoot;
        c.simulationHash = simulationHash;
        c.label = calldataLabel;
        emit CapsuleCreated(
            capsuleId,
            msg.sender,
            actionHash,
            evidenceRoot,
            simulationHash,
            calldataLabel,
            commitDeadline,
            revealDeadline,
            minQuorum,
            reviewMode
        );
    }

    /// @notice Attach an immutable hash and public note; the registry does not validate the content's truth.
    function addEvidence(
        uint256 capsuleId,
        bytes32 evidenceDigest,
        uint8 evidenceType,
        string calldata shortNote
    ) external holder {
        Capsule storage c = _active(capsuleId);
        if (block.timestamp >= c.revealDeadline) revert WrongPhase();
        if (evidenceDigest == 0) revert InvalidHash();
        if (evidenceType > 7) revert InvalidReview();
        _text(shortNote, 160);
        if (evidenceSubmitted[capsuleId][msg.sender][evidenceDigest]) revert DuplicateEvidence();
        evidenceSubmitted[capsuleId][msg.sender][evidenceDigest] = true;
        emit EvidenceAdded(capsuleId, msg.sender, evidenceDigest, evidenceType, shortNote);
    }

    function reviewOpen(
        uint256 capsuleId,
        uint8 verdict,
        uint8 confidence,
        bytes32 evidenceDigest,
        uint8 category
    ) external holder {
        Capsule storage c = _active(capsuleId);
        if (c.reviewMode != 0) revert WrongMode();
        if (block.timestamp >= c.commitDeadline) revert WrongPhase();
        _independent(c, capsuleId);
        _review(verdict, confidence, evidenceDigest, category);
        _count(c, capsuleId, verdict);
        emit ReviewSubmitted(capsuleId, msg.sender, evidenceDigest, verdict, confidence, category);
    }

    function commitReview(uint256 capsuleId, bytes32 commitment) external holder {
        Capsule storage c = _active(capsuleId);
        if (c.reviewMode != 1) revert WrongMode();
        if (block.timestamp >= c.commitDeadline) revert WrongPhase();
        _independent(c, capsuleId);
        if (commitment == 0) revert InvalidHash();
        if (commitments[capsuleId][msg.sender] != 0) revert DuplicateCommitment();
        commitments[capsuleId][msg.sender] = commitment;
        c.commitments++;
        emit ReviewCommitted(capsuleId, msg.sender, commitment);
    }

    function revealReview(
        uint256 capsuleId,
        uint8 verdict,
        uint8 confidence,
        bytes32 salt,
        bytes32 evidenceDigest,
        uint8 category
    ) external holder {
        Capsule storage c = _active(capsuleId);
        if (c.reviewMode != 1) revert WrongMode();
        if (block.timestamp < c.commitDeadline || block.timestamp >= c.revealDeadline) revert WrongPhase();
        _independent(c, capsuleId);
        _review(verdict, confidence, evidenceDigest, category);
        if (salt == 0) revert InvalidHash();
        if (
            commitments[capsuleId][msg.sender]
                != reviewCommitment(
                    capsuleId, msg.sender, verdict, confidence, evidenceDigest, category, salt
                )
        ) revert CommitmentMismatch();
        _count(c, capsuleId, verdict);
        emit ReviewRevealed(capsuleId, msg.sender, evidenceDigest, verdict, confidence, category);
    }

    /// @notice Permissionless finalization. Only revealed/open votes count toward quorum;
    /// insufficient-evidence votes are included. Approval/rejection require an absolute majority of all votes
    /// for approval/rejection. A tie or insufficient quorum is inconclusive. Confidence is descriptive.
    function finalizeCapsule(uint256 capsuleId) external {
        Capsule storage c = _active(capsuleId);
        if (block.timestamp < c.revealDeadline) revert WrongPhase();
        uint256 total = uint256(c.approvals) + c.rejections + c.insufficient;
        c.outcome = 3;
        if (total >= c.minQuorum) {
            if (uint256(c.approvals) * 2 > total) c.outcome = 1;
            else if (uint256(c.rejections) * 2 > total) c.outcome = 2;
        }
        emit CapsuleFinalized(capsuleId, msg.sender, c.outcome, c.approvals, c.rejections, c.insufficient);
    }

    function getCapsule(uint256 capsuleId) external view returns (Capsule memory) {
        return _exists(capsuleId);
    }

    function getReviewTotals(uint256 capsuleId)
        external
        view
        returns (uint32 approvals, uint32 rejections, uint32 insufficient, uint32 committed)
    {
        Capsule storage c = _exists(capsuleId);
        return (c.approvals, c.rejections, c.insufficient, c.commitments);
    }

    function hasCommitted(uint256 capsuleId, address reviewer) external view returns (bool) {
        return commitments[capsuleId][reviewer] != 0;
    }

    function reviewCommitment(
        uint256 capsuleId,
        address reviewer,
        uint8 verdict,
        uint8 confidence,
        bytes32 evidenceDigest,
        uint8 category,
        bytes32 salt
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                REVIEW_TYPEHASH,
                block.chainid,
                address(this),
                capsuleId,
                reviewer,
                verdict,
                confidence,
                evidenceDigest,
                category,
                salt
            )
        );
    }

    function hashAction(
        uint256 chainId,
        address protocol,
        address creator,
        address target,
        uint256 value,
        bytes32 dataHash,
        bytes32 salt,
        uint256 blockNumber,
        bytes32 blockHash
    ) external pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ACTION_TYPEHASH,
                chainId,
                protocol,
                creator,
                target,
                value,
                dataHash,
                salt,
                blockNumber,
                blockHash,
                VERSION_HASH
            )
        );
    }

    function _exists(uint256 id) private view returns (Capsule storage c) {
        c = capsules[id];
        if (c.creator == address(0)) revert CapsuleNotFound();
    }

    function _active(uint256 id) private view returns (Capsule storage c) {
        c = _exists(id);
        if (c.outcome != 0) revert CapsuleClosed();
    }

    function _independent(Capsule storage c, uint256 id) private view {
        if (msg.sender == c.creator) revert SelfReview();
        if (hasReviewed[id][msg.sender]) revert DuplicateReview();
    }

    function _review(uint8 verdict, uint8 confidence, bytes32 digest, uint8 category) private pure {
        if (verdict > 2 || confidence == 0 || confidence > 100 || category > 7) revert InvalidReview();
        if (digest == 0) revert InvalidHash();
    }

    function _count(Capsule storage c, uint256 id, uint8 verdict) private {
        hasReviewed[id][msg.sender] = true;
        if (verdict == 1) c.approvals++;
        else if (verdict == 2) c.rejections++;
        else c.insufficient++;
    }

    function _text(string calldata value, uint256 max) private pure {
        bytes calldata data = bytes(value);
        if (data.length == 0 || data.length > max) revert InvalidText();
        bool nonspace = false;
        for (uint256 i; i < data.length; ++i) {
            uint8 character = uint8(data[i]);
            // Explicit ASCII avoids control/bidi spoofing. HTML is always escaped by the frontend.
            if (character < 32 || character > 126) revert InvalidText();
            if (character != 32) nonspace = true;
        }
        if (!nonspace) revert InvalidText();
    }
}
