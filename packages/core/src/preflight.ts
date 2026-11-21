import { keccak256, type Hex } from 'viem';
import { createBscClient, safeRpcError, toRpcClient, type RpcClient } from './client';
import { RULE_VERSION, PROTOCOL_VERSION } from './constants';
import { decodeAction, type DecodedAction } from './decode';
import { actionSchema, type ActionInput, type NormalizedAction } from './schema';
import { hashManifest } from './hash';

export interface Finding {
  id: string;
  severity: 'info' | 'warning' | 'critical' | 'unknown';
  category: string;
  observed: string;
  evidence: unknown;
  source: string;
  ruleVersion: string;
  confidence: 'high' | 'medium' | 'unknown';
  limitations: string[];
}
export type RpcObservation =
  { status: 'SUCCESS'; result: unknown } | { status: 'FAILURE' | 'UNAVAILABLE'; error: string };
export interface PreflightManifest {
  protocolVersion: string;
  ruleVersion: string;
  action: NormalizedAction;
  context: { chainId: 56; blockNumber: string; blockHash: Hex; timestamp: string };
  decoded: DecodedAction;
  code: { bytes: number; hash: Hex; raw: Hex };
  simulation: { call: RpcObservation; estimateGas: RpcObservation; trace: RpcObservation };
  findings: Finding[];
  evidenceRoot: Hex;
  simulationHash: Hex;
  limitations: string[];
}
export async function inspectAction(
  input: ActionInput,
  options: { client?: RpcClient; rpcUrls?: readonly string[]; trace?: boolean } = {},
): Promise<PreflightManifest> {
  const action = actionSchema.parse(input);
  const client = options.client ?? toRpcClient(createBscClient(options.rpcUrls));
  const chainId = await client.request({ method: 'eth_chainId' });
  if (typeof chainId !== 'string' || BigInt(chainId) !== 56n)
    throw new Error(
      'RPC network mismatch: PREMORTEM requires chain ID 56. No simulation performed.',
    );
  const rawBlock = await client.request({
    method: 'eth_getBlockByNumber',
    params: ['latest', false],
  });
  const block = rawBlock as { number?: string; hash?: Hex; timestamp?: string } | null;
  if (
    !block ||
    !block.number ||
    !block.hash ||
    !block.timestamp ||
    !/^0x[0-9a-f]{64}$/i.test(block.hash)
  )
    throw new Error('RPC returned no reproducible block context');
  const rawCode = await client.request({
    method: 'eth_getCode',
    params: [action.to, block.number],
  });
  if (typeof rawCode !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(rawCode))
    throw new Error('RPC returned malformed code');
  const code = rawCode as Hex;
  const tx = {
    from: action.from,
    to: action.to,
    data: action.data,
    value: `0x${BigInt(action.value).toString(16)}`,
  };
  const observe = async (method: string, params: unknown[]): Promise<RpcObservation> => {
    try {
      const result = await client.request({ method, params });
      if (
        method === 'eth_call' &&
        (typeof result !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(result))
      )
        throw new Error('Malformed eth_call response');
      if (
        method === 'eth_estimateGas' &&
        (typeof result !== 'string' || !/^0x[0-9a-f]+$/i.test(result))
      )
        throw new Error('Malformed gas estimate');
      return { status: 'SUCCESS', result };
    } catch (error) {
      return {
        status: method === 'debug_traceCall' ? 'UNAVAILABLE' : 'FAILURE',
        error: safeRpcError(error),
      };
    }
  };
  const [call, estimateGas, trace] = await Promise.all([
    observe('eth_call', [tx, block.number]),
    observe('eth_estimateGas', [tx, block.number]),
    options.trace
      ? observe('debug_traceCall', [tx, block.number, { tracer: 'callTracer', timeout: '3s' }])
      : Promise.resolve<RpcObservation>({
          status: 'UNAVAILABLE',
          error: 'Optional trace was not requested; provider support is unknown.',
        }),
  ]);
  const decoded = decodeAction(action.data);
  const findings = deriveFindings(action, decoded, code, call, estimateGas);
  const simulation = { call, estimateGas, trace };
  const context = {
    chainId: 56 as const,
    blockNumber: BigInt(block.number).toString(),
    blockHash: block.hash,
    timestamp: BigInt(block.timestamp).toString(),
  };
  return {
    protocolVersion: PROTOCOL_VERSION,
    ruleVersion: RULE_VERSION,
    action,
    context,
    decoded,
    code: { bytes: (code.length - 2) / 2, hash: keccak256(code), raw: code },
    simulation,
    findings,
    evidenceRoot: hashManifest(findings),
    simulationHash: hashManifest({ action, context, simulation }),
    limitations: [
      'Advisory preflight only. This tool never executes the proposed action.',
      'RPC responses are provider assertions, not cryptographic execution proofs.',
      'Simulation at a historical block cannot predict future execution, MEV, upgrades, or state changes.',
      'Selector decoding does not authenticate contract behavior. Probability is unavailable.',
    ],
  };
}

export function deriveFindings(
  action: NormalizedAction,
  decoded: DecodedAction,
  code: Hex,
  call: RpcObservation,
  gas: RpcObservation,
): Finding[] {
  const findings: Finding[] = [];
  const add = (
    id: string,
    severity: Finding['severity'],
    category: string,
    observed: string,
    evidence: unknown,
    limitations: string[] = [],
    confidence: Finding['confidence'] = 'high',
  ) =>
    findings.push({
      id,
      severity,
      category,
      observed,
      evidence,
      source: id.startsWith('rpc') ? 'BSC JSON-RPC at recorded block' : 'Local deterministic rule',
      ruleVersion: RULE_VERSION,
      confidence,
      limitations,
    });
  add('rpc.chain', 'info', 'network', 'RPC reports BSC chain ID 56', { chainId: 56 }, [
    'RPC identity is provider asserted.',
  ]);
  add(
    'rpc.code',
    code === '0x' ? 'warning' : 'info',
    'target',
    code === '0x'
      ? 'Target has no runtime code at the recorded block'
      : 'Runtime code exists at target',
    { codeHash: keccak256(code), bytes: (code.length - 2) / 2 },
    ['Code existence does not establish trust, proxy implementation, or audit status.'],
  );
  add(
    'calldata.decode',
    decoded.status === 'KNOWN_SELECTOR' ? 'info' : 'unknown',
    'calldata',
    decoded.functionName
      ? `Known selector matches ${decoded.functionName}`
      : `Calldata decoding: ${decoded.status}`,
    decoded,
    [decoded.limitation],
    decoded.status === 'KNOWN_SELECTOR' ? 'high' : 'unknown',
  );
  add('calldata.size', 'info', 'calldata', `${(action.data.length - 2) / 2} calldata bytes`, {
    bytes: (action.data.length - 2) / 2,
  });
  if (BigInt(action.value) > 0n)
    add(
      'value.transfer',
      'warning',
      'assets',
      'Proposed action transfers native BNB value',
      { wei: action.value, target: action.to },
      ['Review recipient and amount independently. PREMORTEM does not send this transaction.'],
    );
  const name = decoded.functionName;
  if (name === 'approve' || name === 'increaseAllowance' || name === 'permit') {
    const index = name === 'permit' ? 2 : 1;
    const amount = decoded.args[index];
    const spender = decoded.args[name === 'permit' ? 1 : 0];
    const unlimited = typeof amount === 'string' && BigInt(amount) === 2n ** 256n - 1n;
    add(
      'authority.allowance',
      unlimited ? 'critical' : 'warning',
      'authority',
      unlimited ? 'Unlimited token allowance requested' : 'Token spending authority changes',
      { spender, amount, method: name },
      [
        'Selector is recognized; token behavior and current allowance are unverified.',
        'An allowance can permit future transfers without another approval.',
      ],
    );
  }
  if (name === 'setApprovalForAll')
    add(
      'authority.operator',
      decoded.args[1] ? 'critical' : 'info',
      'authority',
      decoded.args[1]
        ? 'All-token operator authority requested'
        : 'Operator authority revocation requested',
      { operator: decoded.args[0], approved: decoded.args[1] },
      ['Target may implement arbitrary behavior despite selector match.'],
    );
  if (
    name &&
    [
      'transferOwnership',
      'renounceOwnership',
      'pause',
      'unpause',
      'upgradeTo',
      'upgradeToAndCall',
    ].includes(name)
  )
    add(
      'authority.admin',
      'critical',
      'administration',
      `Administrative action: ${name}`,
      decoded.args,
      ['Privileges and implementation have not been independently verified.'],
    );
  if (name === 'transfer' || name === 'transferFrom') {
    const recipient = decoded.args[name === 'transfer' ? 0 : 1];
    add(
      'assets.recipient',
      'warning',
      'assets',
      'Token transfer selector decoded',
      { recipient, amount: decoded.args[name === 'transfer' ? 1 : 2], decimals: 'UNKNOWN' },
      ['Raw integer units; token metadata and token standard are unverified.'],
    );
    if (
      action.expectedRecipient &&
      typeof recipient === 'string' &&
      recipient.toLowerCase() !== action.expectedRecipient.toLowerCase()
    )
      add(
        'assets.recipient-mismatch',
        'critical',
        'assets',
        'Decoded recipient differs from expected recipient',
        { expected: action.expectedRecipient, actual: recipient },
      );
  }
  if (BigInt(action.value) > 0n && decoded.mutability === 'nonpayable')
    add(
      'value.nonpayable',
      'warning',
      'calldata',
      'Native value accompanies a known nonpayable selector',
      { wei: action.value },
      ['Implementation is unverified; selector ABI may not describe target.'],
    );
  add(
    'rpc.call',
    call.status === 'SUCCESS' ? 'info' : 'unknown',
    'simulation',
    call.status === 'SUCCESS'
      ? 'eth_call returned without an RPC error'
      : 'eth_call failed or unavailable; outcome UNKNOWN',
    call,
    [
      'An RPC success is not a safety guarantee; return data can encode failure. A failure may reflect provider restrictions or current state.',
    ],
    call.status === 'SUCCESS' ? 'high' : 'unknown',
  );
  if (
    call.status === 'SUCCESS' &&
    typeof call.result === 'string' &&
    /^0x0{64}$/.test(call.result) &&
    name &&
    ['approve', 'transfer', 'transferFrom', 'increaseAllowance'].includes(name)
  )
    add(
      'rpc.false-return',
      'warning',
      'simulation',
      'Known token method returned a zero word (possible false)',
      { result: call.result },
      ['ABI and target implementation remain unverified; inspect raw return data.'],
    );
  add(
    'rpc.gas',
    gas.status === 'SUCCESS' ? 'info' : 'unknown',
    'simulation',
    gas.status === 'SUCCESS'
      ? 'Gas estimate returned for exact action'
      : 'Gas estimate failed or unavailable',
    gas,
    ['Not a final gas price or execution guarantee.'],
    gas.status === 'SUCCESS' ? 'high' : 'unknown',
  );
  add(
    'verification.unavailable',
    'unknown',
    'verification',
    'Source authenticity, economic safety, and external claims remain unverified',
    { probability: 'UNAVAILABLE', sourceVerification: 'NOT_CHECKED' },
    ['No exhaustive risk score or security guarantee is provided.'],
    'unknown',
  );
  return findings;
}
