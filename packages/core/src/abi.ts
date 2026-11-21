import { parseAbi } from 'viem';

export const REGISTRY_ABI = parseAbi([
  'function AGENT_ID() view returns (address)',
  'function capsuleCount() view returns (uint256)',
  'function createCapsule(bytes32 actionHash, bytes32 evidenceRoot, bytes32 simulationHash, string calldataLabel, uint64 commitDeadline, uint64 revealDeadline, uint8 minQuorum, uint8 reviewMode) returns (uint256 capsuleId)',
  'function addEvidence(uint256 capsuleId,bytes32 evidenceDigest,uint8 evidenceType,string shortNote)',
  'function reviewOpen(uint256 capsuleId,uint8 verdict,uint8 confidence,bytes32 evidenceDigest,uint8 category)',
  'function commitReview(uint256 capsuleId,bytes32 commitment)',
  'function revealReview(uint256 capsuleId,uint8 verdict,uint8 confidence,bytes32 salt,bytes32 evidenceDigest,uint8 category)',
  'function finalizeCapsule(uint256 capsuleId)',
  'function getCapsule(uint256 capsuleId) view returns ((address creator,uint64 createdAt,uint64 commitDeadline,uint64 revealDeadline,uint8 minQuorum,uint8 reviewMode,uint8 outcome,uint32 approvals,uint32 rejections,uint32 insufficient,uint32 commitments,bytes32 actionHash,bytes32 evidenceRoot,bytes32 simulationHash,string label))',
  'function getReviewTotals(uint256 capsuleId) view returns (uint32 approvals,uint32 rejections,uint32 insufficient,uint32 committed)',
  'function hasReviewed(uint256 capsuleId,address reviewer) view returns (bool)',
  'function hasCommitted(uint256 capsuleId,address reviewer) view returns (bool)',
  'function reviewCommitment(uint256 capsuleId,address reviewer,uint8 verdict,uint8 confidence,bytes32 evidenceDigest,uint8 category,bytes32 salt) view returns (bytes32)',
  'function hashAction(uint256 chainId,address protocol,address creator,address target,uint256 value,bytes32 dataHash,bytes32 salt,uint256 blockNumber,bytes32 blockHash) pure returns (bytes32)',
  'event CapsuleCreated(uint256 indexed capsuleId,address indexed actor,bytes32 indexed actionHash,bytes32 evidenceRoot,bytes32 simulationHash,string label,uint64 commitDeadline,uint64 revealDeadline,uint8 minQuorum,uint8 reviewMode)',
  'event EvidenceAdded(uint256 indexed capsuleId,address indexed actor,bytes32 indexed evidenceDigest,uint8 evidenceType,string shortNote)',
  'event ReviewSubmitted(uint256 indexed capsuleId,address indexed actor,bytes32 indexed evidenceDigest,uint8 verdict,uint8 confidence,uint8 category)',
  'event ReviewCommitted(uint256 indexed capsuleId,address indexed actor,bytes32 commitment)',
  'event ReviewRevealed(uint256 indexed capsuleId,address indexed actor,bytes32 indexed evidenceDigest,uint8 verdict,uint8 confidence,uint8 category)',
  'event CapsuleFinalized(uint256 indexed capsuleId,address indexed actor,uint8 outcome,uint32 approvals,uint32 rejections,uint32 insufficient)',
]);
export const PROTOCOL_EVENTS = REGISTRY_ABI.filter((entry) => entry.type === 'event');
