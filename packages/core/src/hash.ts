import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';
import { PROTOCOL_VERSION } from './constants';

/** Sorted-key canonical JSON for JSON-compatible values. Integers larger than JS precision must be decimal strings. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      throw new Error('Noncanonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (
    typeof value === 'object' &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  throw new Error('Manifest contains an unsupported value');
}
export const hashManifest = (value: unknown): Hex => keccak256(stringToHex(canonicalJson(value)));
export const ACTION_TYPEHASH = keccak256(
  stringToHex(
    'PremortemAction(uint256 chainId,address protocol,address creator,address target,uint256 value,bytes32 dataHash,bytes32 salt,uint256 blockNumber,bytes32 blockHash,bytes32 versionHash)',
  ),
);
export const REVIEW_TYPEHASH = keccak256(
  stringToHex(
    'PremortemReview(uint256 chainId,address protocol,uint256 capsuleId,address reviewer,uint8 verdict,uint8 confidence,bytes32 evidenceDigest,uint8 category,bytes32 salt)',
  ),
);
export interface ActionHashInput {
  chainId: number | bigint;
  protocol: Address;
  creator: Address;
  target: Address;
  value: bigint;
  data: Hex;
  salt: Hex;
  blockNumber: bigint;
  blockHash: Hex;
}
export function hashAction(a: ActionHashInput): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        'bytes32,uint256,address,address,address,uint256,bytes32,bytes32,uint256,bytes32,bytes32',
      ),
      [
        ACTION_TYPEHASH,
        BigInt(a.chainId),
        a.protocol,
        a.creator,
        a.target,
        a.value,
        keccak256(a.data),
        a.salt,
        a.blockNumber,
        a.blockHash,
        keccak256(stringToHex(PROTOCOL_VERSION)),
      ],
    ),
  );
}
export interface ReviewCommitmentInput {
  chainId: number | bigint;
  protocol: Address;
  capsuleId: bigint;
  reviewer: Address;
  verdict: number;
  confidence: number;
  evidenceDigest: Hex;
  category: number;
  salt: Hex;
}
export function reviewCommitment(a: ReviewCommitmentInput): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        'bytes32,uint256,address,uint256,address,uint8,uint8,bytes32,uint8,bytes32',
      ),
      [
        REVIEW_TYPEHASH,
        BigInt(a.chainId),
        a.protocol,
        a.capsuleId,
        a.reviewer,
        a.verdict,
        a.confidence,
        a.evidenceDigest,
        a.category,
        a.salt,
      ],
    ),
  );
}
