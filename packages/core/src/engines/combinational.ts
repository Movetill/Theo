import { fromBigInt, parseBitVector } from '../foundation/bit-vector.js'
import { CoreError } from '../foundation/errors.js'
import type { DigitalDesign, NodeSpec, SignalRef } from '../ir/types.js'
import { prepareDesign, requireDataObject, requireFields } from '../ir/validate.js'

type CombinationalNode = Exclude<NodeSpec, { kind: 'REGISTER' }>
export type BitField = { id: string; width: number; signed?: boolean }

export function readBitFrame(frame: unknown, fields: BitField[], path: string): Map<string, bigint> {
  const bits = requireDataObject(frame, path)
  requireFields(bits, fields.map(field => field.id), [], path)
  const values = new Map<string, bigint>()
  for (const { id, width, signed } of fields) {
    const vector = parseBitVector({ width, signed: signed ?? false, bits: bits[id] }, `${path}.${id}`)
    values.set(id, BigInt(`0b${vector.bits}`))
  }
  return values
}

export function writeBitFrame(fields: BitField[], read: (id: string) => bigint): Record<string, string> {
  return Object.fromEntries(fields.map(({ id, width }) => [id, fromBigInt(read(id), width).bits]))
}

function mask(width: number): bigint {
  return (1n << BigInt(width)) - 1n
}

// All node values are unsigned bit patterns. Signedness is checked at the wiring boundary.
function evaluateNode(node: CombinationalNode, read: (ref: SignalRef) => bigint): bigint {
  switch (node.kind) {
    case 'CONST': return BigInt(`0b${node.params.bits}`)
    case 'NOT': return mask(node.params.width) ^ read(node.inputBindings.a)
    case 'AND': return read(node.inputBindings.a) & read(node.inputBindings.b)
    case 'OR': return read(node.inputBindings.a) | read(node.inputBindings.b)
    case 'XOR': return read(node.inputBindings.a) ^ read(node.inputBindings.b)
    case 'ADD': return (read(node.inputBindings.a) + read(node.inputBindings.b)) & mask(node.params.width)
    case 'EQ': return read(node.inputBindings.a) === read(node.inputBindings.b) ? 1n : 0n
    case 'MUX': {
      const { sel, whenTrue, whenFalse } = node.inputBindings
      return read(read(sel) === 1n ? whenTrue : whenFalse)
    }
    case 'SLICE': {
      const { lsb, width } = node.params
      return (read(node.inputBindings.value) >> BigInt(lsb)) & mask(width)
    }
    case 'CONCAT': {
      const { high, low } = node.inputBindings
      return (read(high) << BigInt(node.params.lowWidth)) | read(low)
    }
  }
}

/** Internal evaluator for a validated circuit with an explicit snapshot of register Q values. */
export function evaluateSignals(
  design: DigitalDesign, nodeOrder: number[], inputs: ReadonlyMap<string, bigint>, registers?: ReadonlyMap<string, bigint>,
): Map<string, bigint> {
  const values = new Map(inputs)
  if (registers) for (const [id, value] of registers) values.set(id, value)
  // Validation resolves each named output. Each supported node has one output.
  const read = (ref: SignalRef): bigint => values.get(ref.nodeId)!
  for (const index of nodeOrder) {
    const node = design.nodes[index]
    if (node.kind !== 'REGISTER') values.set(node.id, evaluateNode(node, read))
  }
  return values
}

/** Evaluates one input frame and returns fixed-width binary strings by output port ID. */
export function evaluateCombinational(candidate: unknown, inputFrame: unknown): Record<string, string> {
  const { design, nodeOrder } = prepareDesign(candidate)
  const registerIndex = design.nodes.findIndex(node => node.kind === 'REGISTER')
  if (registerIndex !== -1) {
    throw new CoreError('UNSUPPORTED_SEMANTICS', 'Combinational evaluation requires a design without registers', `$.nodes[${registerIndex}].kind`)
  }

  const inputPorts = design.ports.filter(port => port.direction === 'input')
  const inputs = readBitFrame(inputFrame, inputPorts, '$.inputs')
  const values = evaluateSignals(design, nodeOrder, inputs)
  const outputPorts = design.ports.filter(port => port.direction === 'output')
  return writeBitFrame(outputPorts, id => values.get(design.outputBindings[id].nodeId)!)
}
