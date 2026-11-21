import { decodeFunctionData, parseAbi, type Hex } from 'viem';

export const KNOWN_ACTION_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function increaseAllowance(address spender, uint256 addedValue) returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
  'function transferOwnership(address newOwner)',
  'function renounceOwnership()',
  'function pause()',
  'function unpause()',
  'function upgradeTo(address newImplementation)',
  'function upgradeToAndCall(address newImplementation,bytes data) payable',
]);
export interface DecodedAction {
  status: 'KNOWN_SELECTOR' | 'UNKNOWN' | 'EMPTY' | 'MALFORMED';
  selector: string | null;
  functionName: string | null;
  args: (string | boolean)[];
  abiVerified: false;
  mutability: string | null;
  limitation: string;
}
export function decodeAction(data: Hex): DecodedAction {
  const base = {
    abiVerified: false as const,
    limitation:
      'Selector matching does not verify target implementation, token standard, return values, or economic behavior.',
  };
  if (data === '0x')
    return {
      ...base,
      status: 'EMPTY',
      selector: null,
      functionName: null,
      args: [],
      mutability: null,
    };
  if (data.length < 10)
    return {
      ...base,
      status: 'MALFORMED',
      selector: data,
      functionName: null,
      args: [],
      mutability: null,
    };
  try {
    const decoded = decodeFunctionData({ abi: KNOWN_ACTION_ABI, data });
    const definition = KNOWN_ACTION_ABI.find(
      (entry) => entry.type === 'function' && entry.name === decoded.functionName,
    );
    return {
      ...base,
      status: 'KNOWN_SELECTOR',
      selector: data.slice(0, 10),
      functionName: decoded.functionName,
      args: (decoded.args ?? []).map((value) =>
        typeof value === 'boolean' ? value : String(value),
      ),
      mutability: definition && definition.type === 'function' ? definition.stateMutability : null,
    };
  } catch {
    const knownSelectors = new Set([
      '0xa9059cbb',
      '0x23b872dd',
      '0x095ea7b3',
      '0x39509351',
      '0xa22cb465',
      '0xd505accf',
      '0xf2fde38b',
      '0x715018a6',
      '0x8456cb59',
      '0x3f4ba83a',
      '0x3659cfe6',
      '0x4f1ef286',
    ]);
    return {
      ...base,
      status: knownSelectors.has(data.slice(0, 10).toLowerCase()) ? 'MALFORMED' : 'UNKNOWN',
      selector: data.slice(0, 10),
      functionName: null,
      args: [],
      mutability: null,
    };
  }
}
