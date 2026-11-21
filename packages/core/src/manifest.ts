import { keccak256, type Hex } from 'viem';
import { z } from 'zod';
import { PROTOCOL_VERSION, RULE_VERSION } from './constants';
import { decodeAction } from './decode';
import { canonicalJson, hashAction, hashManifest } from './hash';
import { deriveFindings, type PreflightManifest } from './preflight';
import { actionSchema, addressSchema, bytes32Schema, hexDataSchema, weiSchema } from './schema';

const observationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('SUCCESS'), result: z.unknown() }).strict(),
  z.object({ status: z.enum(['FAILURE', 'UNAVAILABLE']), error: z.string().max(20_000) }).strict(),
]);
const findingSchema = z
  .object({
    id: z.string(),
    severity: z.enum(['info', 'warning', 'critical', 'unknown']),
    category: z.string(),
    observed: z.string(),
    evidence: z.unknown(),
    source: z.string(),
    ruleVersion: z.literal(RULE_VERSION),
    confidence: z.enum(['high', 'medium', 'unknown']),
    limitations: z.array(z.string()),
  })
  .strict();
const manifestSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    ruleVersion: z.literal(RULE_VERSION),
    action: actionSchema,
    context: z
      .object({
        chainId: z.literal(56),
        blockNumber: weiSchema,
        blockHash: bytes32Schema,
        timestamp: weiSchema,
      })
      .strict(),
    decoded: z
      .object({
        status: z.enum(['KNOWN_SELECTOR', 'UNKNOWN', 'EMPTY', 'MALFORMED']),
        selector: z.string().nullable(),
        functionName: z.string().nullable(),
        args: z.array(z.union([z.string(), z.boolean()])),
        abiVerified: z.literal(false),
        mutability: z.string().nullable(),
        limitation: z.string(),
      })
      .strict(),
    code: z
      .object({ bytes: z.number().int().nonnegative(), hash: bytes32Schema, raw: hexDataSchema })
      .strict(),
    simulation: z
      .object({ call: observationSchema, estimateGas: observationSchema, trace: observationSchema })
      .strict(),
    findings: z.array(findingSchema).max(100),
    evidenceRoot: bytes32Schema,
    simulationHash: bytes32Schema,
    limitations: z.array(z.string()),
    salt: bytes32Schema,
    canonicalAction: bytes32Schema.optional(),
    actionHash: bytes32Schema.optional(),
  })
  .strict();

export interface ManifestVerificationOptions {
  registry: string;
  creator: string;
  expected?: { actionHash?: Hex; evidenceRoot?: Hex; simulationHash?: Hex };
}
export interface ManifestVerification {
  verified: boolean;
  checks: Record<string, boolean>;
  errors: string[];
  computed: { actionHash: Hex; evidenceRoot: Hex; simulationHash: Hex } | null;
  manifest: PreflightManifest | null;
  limitations: string[];
}

/** Offline integrity check against an actual capsule. This does not authenticate historical RPC assertions. */
export function verifyManifest(
  input: unknown,
  options: ManifestVerificationOptions,
): ManifestVerification {
  const checks: Record<string, boolean> = {};
  const errors: string[] = [];
  const limitations = [
    'Hash equality checks content identity, not truth or safety.',
    'Historical RPC responses remain provider assertions; this offline check does not rerun simulation.',
    'The expected capsule hashes and creator must be read from an authenticated registry deployment.',
  ];
  const result: ManifestVerification = {
    verified: false,
    checks,
    errors,
    computed: null,
    manifest: null,
    limitations,
  };
  try {
    if (new TextEncoder().encode(canonicalJson(input)).length > 1_000_000)
      throw new Error('Manifest exceeds 1 MB verification limit');
    const parsed = manifestSchema.parse(input);
    const registry = addressSchema.parse(options.registry);
    const creator = addressSchema.parse(options.creator);
    const manifest: PreflightManifest = {
      protocolVersion: parsed.protocolVersion,
      ruleVersion: parsed.ruleVersion,
      action: parsed.action,
      context: parsed.context,
      decoded: parsed.decoded,
      code: parsed.code,
      simulation: parsed.simulation,
      findings: parsed.findings,
      evidenceRoot: parsed.evidenceRoot,
      simulationHash: parsed.simulationHash,
      limitations: parsed.limitations,
    };
    result.manifest = manifest;
    const check = (name: string, condition: boolean, error: string) => {
      checks[name] = condition;
      if (!condition) errors.push(error);
    };
    check(
      'sourceMatchesCreator',
      parsed.action.from.toLowerCase() === creator.toLowerCase(),
      'Inspected source does not match the actual capsule creator',
    );
    check(
      'rpcResponseShapes',
      (parsed.simulation.call.status !== 'SUCCESS' ||
        (typeof parsed.simulation.call.result === 'string' &&
          /^0x(?:[0-9a-f]{2})*$/i.test(parsed.simulation.call.result))) &&
        (parsed.simulation.estimateGas.status !== 'SUCCESS' ||
          (typeof parsed.simulation.estimateGas.result === 'string' &&
            /^0x[0-9a-f]+$/i.test(parsed.simulation.estimateGas.result))),
      'Included successful call or gas result has a malformed RPC shape',
    );
    const decoded = decodeAction(parsed.action.data);
    check(
      'decodedAction',
      canonicalJson(decoded) === canonicalJson(parsed.decoded),
      'Decoded selector data differs from deterministic decoding',
    );
    check(
      'codeMetadata',
      parsed.code.hash === keccak256(parsed.code.raw) &&
        parsed.code.bytes === (parsed.code.raw.length - 2) / 2,
      'Runtime code metadata does not match included code bytes',
    );
    const findings = deriveFindings(
      parsed.action,
      decoded,
      parsed.code.raw,
      parsed.simulation.call,
      parsed.simulation.estimateGas,
    );
    check(
      'deterministicFindings',
      canonicalJson(findings) === canonicalJson(parsed.findings),
      'Findings differ from deterministic rule output for this manifest',
    );
    const evidenceRoot = hashManifest(parsed.findings);
    const simulationHash = hashManifest({
      action: parsed.action,
      context: parsed.context,
      simulation: parsed.simulation,
    });
    const actionHash = hashAction({
      chainId: 56,
      protocol: registry,
      creator,
      target: parsed.action.to,
      value: BigInt(parsed.action.value),
      data: parsed.action.data,
      salt: parsed.salt,
      blockNumber: BigInt(parsed.context.blockNumber),
      blockHash: parsed.context.blockHash,
    });
    result.computed = { actionHash, evidenceRoot, simulationHash };
    check(
      'evidenceRoot',
      parsed.evidenceRoot === evidenceRoot,
      'Evidence root does not match included findings',
    );
    check(
      'simulationHash',
      parsed.simulationHash === simulationHash,
      'Simulation hash does not bind the included action, context and observations',
    );
    if (parsed.canonicalAction)
      check(
        'exportedActionHash',
        parsed.canonicalAction === actionHash,
        'Exported canonicalAction differs from recomputed action hash',
      );
    if (parsed.actionHash)
      check(
        'exportedActionHashAlias',
        parsed.actionHash === actionHash,
        'Exported actionHash differs from recomputed action hash',
      );
    for (const key of ['actionHash', 'evidenceRoot', 'simulationHash'] as const) {
      const expected = options.expected?.[key];
      if (expected)
        check(
          `onchain${key[0].toUpperCase()}${key.slice(1)}`,
          bytes32Schema.parse(expected) === result.computed[key],
          `Recomputed ${key} differs from actual on-chain capsule`,
        );
    }
    check(
      'onchainComparisonProvided',
      Boolean(
        options.expected?.actionHash &&
        options.expected?.evidenceRoot &&
        options.expected?.simulationHash,
      ),
      'All three on-chain capsule hashes are required for anchored verification',
    );
    result.verified = errors.length === 0;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Malformed manifest');
  }
  return result;
}
