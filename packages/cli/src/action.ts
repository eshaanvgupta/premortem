import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
  type Address,
} from 'viem';
import { z } from 'zod';
import type { ProtocolTransaction } from './adapter.js';

// Exact protocol write signatures. Deliberately excludes arbitrary execution and asset calls.
export const writeAbi = parseAbi([
  'function createCapsule(bytes32 actionHash,bytes32 evidenceRoot,bytes32 simulationHash,string calldataLabel,uint64 commitDeadline,uint64 revealDeadline,uint8 minQuorum,uint8 reviewMode) returns (uint256 capsuleId)',
  'function addEvidence(uint256 capsuleId,bytes32 evidenceDigest,uint8 evidenceType,string shortNote)',
  'function reviewOpen(uint256 capsuleId,uint8 verdict,uint8 confidence,bytes32 evidenceDigest,uint8 category)',
  'function commitReview(uint256 capsuleId,bytes32 commitment)',
  'function revealReview(uint256 capsuleId,uint8 verdict,uint8 confidence,bytes32 salt,bytes32 evidenceDigest,uint8 category)',
  'function finalizeCapsule(uint256 capsuleId)',
]);
export const methods = [
  'createCapsule',
  'addEvidence',
  'reviewOpen',
  'commitReview',
  'revealReview',
  'finalizeCapsule',
] as const;
const address = z.string().transform((value, context) => {
  try {
    return getAddress(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid address/checksum' });
    return z.NEVER;
  }
});
const bytes32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .refine((value) => !/^0x0{64}$/.test(value), 'Zero hash forbidden');
const decimal = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .max(78);
const uint = (max: bigint, nonzero = false) =>
  decimal.refine((value) => BigInt(value) <= max && (!nonzero || BigInt(value) > 0n));
const id = uint((1n << 256n) - 1n, true);
const label = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[\x20-\x7e]+$/, 'Printable ASCII only')
    .refine((value) => value.trim().length > 0, 'A substantive label/note is required');
const verdict = z.number().int().min(0).max(2);
const confidence = z.number().int().min(1).max(100);
const category = z.number().int().min(0).max(7);
const argsSchemas = {
  createCapsule: z.tuple([
    bytes32,
    bytes32,
    bytes32,
    label(96),
    uint((1n << 64n) - 1n),
    uint((1n << 64n) - 1n),
    z.number().int().min(2).max(9),
    z.number().int().min(0).max(1),
  ]),
  addEvidence: z.tuple([id, bytes32, category, label(160)]),
  reviewOpen: z.tuple([id, verdict, confidence, bytes32, category]),
  commitReview: z.tuple([id, bytes32]),
  revealReview: z.tuple([id, verdict, confidence, bytes32, bytes32, category]),
  finalizeCapsule: z.tuple([id]),
};
export const actionSchema = z
  .object({
    version: z.literal('premortem-action/1'),
    chainId: z.literal(56),
    registry: address,
    from: address,
    method: z.enum(methods),
    args: z.array(z.unknown()).max(8),
    value: z.literal('0'),
    data: z
      .string()
      .regex(/^0x(?:[0-9a-fA-F]{2})*$/)
      .max(20000)
      .optional(),
    calldataHash: bytes32.optional(),
  })
  .strict();
export type ActionFile = z.input<typeof actionSchema>;

export function prepareAction(input: unknown, expectedRegistry?: Address): ProtocolTransaction {
  const action = actionSchema.parse(input);
  if (expectedRegistry && action.registry.toLowerCase() !== expectedRegistry.toLowerCase())
    throw new Error('Action file registry differs from PREMORTEM_REGISTRY. Refusing substitution.');
  const args = argsSchemas[action.method].parse(action.args);
  // ABI uint256/uint64 values are decimal strings in action files to preserve precision.
  const abiArgs = args.map((arg, index) =>
    typeof arg === 'string' &&
    /^(0|[1-9][0-9]*)$/.test(arg) &&
    (index === 0 || (action.method === 'createCapsule' && (index === 4 || index === 5)))
      ? BigInt(arg)
      : arg,
  );
  const data = encodeFunctionData({
    abi: writeAbi,
    functionName: action.method,
    args: abiArgs as never,
  });
  const calldataHash = keccak256(data);
  if (action.data && action.data.toLowerCase() !== data.toLowerCase())
    throw new Error('Action file calldata does not match the decoded method and parameters.');
  if (action.calldataHash && action.calldataHash.toLowerCase() !== calldataHash.toLowerCase())
    throw new Error('Action file calldata hash mismatch.');
  decodeFunctionData({ abi: writeAbi, data });
  return {
    from: action.from,
    to: action.registry,
    data,
    value: '0',
    chainId: 56,
    method: action.method,
    args,
    calldataHash,
  };
}
