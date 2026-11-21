import { getAddress, isAddress, type Address } from 'viem';
import { z } from 'zod';
import { BSC_CHAIN_ID, MAX_CALLDATA_BYTES } from './constants';

// Deterministic runtime validation works under strict CSP without dynamic-code probes.
z.config({ jitless: true });

export const addressSchema = z
  .string()
  .refine((v) => isAddress(v, { strict: true }), 'Invalid address or mixed-case checksum')
  .transform((v): Address => getAddress(v));
export const hexDataSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/, 'Calldata must contain complete hex bytes')
  .refine((v) => (v.length - 2) / 2 <= MAX_CALLDATA_BYTES, 'Calldata exceeds 32768 bytes')
  .transform((v) => v.toLowerCase() as `0x${string}`);
export const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .refine((v) => !/^0x0{64}$/i.test(v), 'Zero digest is not permitted')
  .transform((v) => v.toLowerCase() as `0x${string}`);
export const weiSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/, 'Value must be canonical nonnegative integer wei')
  .refine((v) => v.length <= 78 && BigInt(v) < 2n ** 256n, 'Value exceeds uint256');
export const actionSchema = z
  .object({
    chainId: z.literal(BSC_CHAIN_ID).default(BSC_CHAIN_ID),
    from: addressSchema,
    to: addressSchema,
    data: hexDataSchema.default('0x'),
    value: weiSchema.default('0'),
    expectedRecipient: addressSchema.optional(),
  })
  .strict();
export type ActionInput = z.input<typeof actionSchema>;
export type NormalizedAction = z.output<typeof actionSchema>;

export function publicLabel(value: string, max = 96): string {
  if (value.length < 1 || value.length > max || !/^[\x20-\x7E]+$/.test(value) || !value.trim())
    throw new Error(`Use 1-${max} printable ASCII characters; do not disclose secrets`);
  return value;
}
