import { CoreError, type Diagnostic, type ErrorCode } from '../foundation/errors.js'
import type { DigitalDesign, NodeSpec, SignalRef } from './types.js'

export const DESIGN_LIMITS = { nodes: 1000, ports: 128, width: 64, clocks: 1 } as const
type Obj = Record<string, unknown>
const has = (o: object, key: string) => Object.hasOwn(o, key)
function fail(code: ErrorCode, message: string, path: string): never { throw new CoreError(code, message, path) }
export function requireDataObject(value: unknown, path: string): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_SCHEMA', 'Expected a plain object', path)
  dataFields(value, path)
  return value as Obj
}
function dataFields(value: object, path: string, isArray = false) {
  // Accessors can change between validation and copying; only JSON-style data properties are allowed.
  for (const key of Reflect.ownKeys(value)) {
    if (isArray && key === 'length') continue
    if (typeof key !== 'string') fail('INVALID_SCHEMA', 'Symbol fields are not JSON data', path)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (!descriptor.enumerable || !has(descriptor, 'value')) fail('INVALID_SCHEMA', 'Expected enumerable data property', `${path}.${key}`)
    if (isArray && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= (value as unknown[]).length)) fail('INVALID_SCHEMA', 'Array properties must be indices', `${path}.${key}`)
  }
}
export function requireFields(o: Obj, required: string[], optional: string[], path: string, code: ErrorCode = 'INVALID_SCHEMA') {
  for (const k of required) if (!has(o, k)) fail(code, `Missing field: ${k}`, `${path}.${k}`)
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) fail(code, `Unknown field: ${k}`, `${path}.${k}`)
}
function text(value: unknown, path: string, max = 128): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID_SCHEMA', `Expected nonempty string of at most ${max} characters`, path)
}
function identifier(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(value)) fail('INVALID_SCHEMA', 'Expected identifier (1..64 letters, digits, underscore or hyphen; no leading digit)', path)
}
function integer(value: unknown, min: number, max: number, path: string, code: ErrorCode = 'INVALID_SCHEMA'): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail(code, `Expected integer in ${min}..${max}`, path)
}
function width(value: unknown, path: string): asserts value is number { integer(value, 1, DESIGN_LIMITS.width, path, 'RESOURCE_LIMIT') }
function signed(o: Obj, path: string) {
  if (has(o, 'signed') && typeof o.signed !== 'boolean') fail('INVALID_SCHEMA', 'signed must be boolean', `${path}.signed`)
}
function bits(value: unknown, w: number, path: string) {
  if (typeof value === 'string' && /[xz]/i.test(value)) fail('UNSUPPORTED_SEMANTICS', 'Only two-state 0/1 values are supported', path)
  if (typeof value !== 'string' || value.length !== w || !/^[01]+$/.test(value)) fail('INVALID_BIT_VECTOR', `Expected exactly ${w} binary digits`, path)
}
export function requireDataArray(value: unknown, max: number, path: string): unknown[] {
  if (!Array.isArray(value)) fail('INVALID_SCHEMA', 'Expected array', path)
  if (value.length > max) fail('RESOURCE_LIMIT', `At most ${max} entries allowed`, path)
  dataFields(value, path, true)
  // Sparse JS arrays are not valid JSON arrays of designs.
  for (let i = 0; i < value.length; i++) if (!has(value, String(i))) fail('INVALID_SCHEMA', 'Sparse arrays are not supported', `${path}[${i}]`)
  return value
}
function ref(value: unknown, path: string) {
  const o = requireDataObject(value, path)
  requireFields(o, ['nodeId', 'port'], [], path)
  identifier(o.nodeId, `${path}.nodeId`)
  identifier(o.port, `${path}.port`)
}

function nodeShape(value: unknown, path: string) {
  const n = requireDataObject(value, path)
  requireFields(n, ['id', 'kind', 'params', 'inputBindings'], [], path)
  identifier(n.id, `${path}.id`)
  const p = requireDataObject(n.params, `${path}.params`)
  const b = requireDataObject(n.inputBindings, `${path}.inputBindings`)
  let inputs: string[]
  switch (n.kind) {
    case 'CONST':
      requireFields(p, ['width', 'bits'], ['signed'], `${path}.params`)
      width(p.width, `${path}.params.width`); signed(p, `${path}.params`)
      bits(p.bits, p.width, `${path}.params.bits`)
      inputs = []; break
    case 'NOT': case 'AND': case 'OR': case 'XOR': case 'ADD': case 'EQ': case 'MUX':
      requireFields(p, ['width'], ['signed'], `${path}.params`)
      width(p.width, `${path}.params.width`); signed(p, `${path}.params`)
      inputs = n.kind === 'NOT' ? ['a'] : n.kind === 'MUX' ? ['sel', 'whenFalse', 'whenTrue'] : ['a', 'b']
      break
    case 'SLICE':
      requireFields(p, ['inputWidth', 'lsb', 'width'], [], `${path}.params`)
      width(p.inputWidth, `${path}.params.inputWidth`); width(p.width, `${path}.params.width`)
      integer(p.lsb, 0, p.inputWidth - 1, `${path}.params.lsb`)
      if (p.lsb + p.width > p.inputWidth) fail('WIDTH_MISMATCH', 'Slice extends beyond input', `${path}.params`)
      inputs = ['value']; break
    case 'CONCAT':
      requireFields(p, ['highWidth', 'lowWidth'], [], `${path}.params`)
      width(p.highWidth, `${path}.params.highWidth`); width(p.lowWidth, `${path}.params.lowWidth`)
      width(p.highWidth + p.lowWidth, `${path}.params`)
      inputs = ['high', 'low']; break
    case 'REGISTER':
      requireFields(p, ['width', 'clockDomain', 'resetMode', 'resetActive', 'resetValue', 'initialValue'], ['signed'], `${path}.params`)
      width(p.width, `${path}.params.width`); signed(p, `${path}.params`)
      identifier(p.clockDomain, `${path}.params.clockDomain`)
      if (p.resetMode !== 'synchronous' || p.resetActive !== 'high') fail('UNSUPPORTED_SEMANTICS', 'Only synchronous active-high reset is supported', `${path}.params`)
      bits(p.resetValue, p.width, `${path}.params.resetValue`)
      bits(p.initialValue, p.width, `${path}.params.initialValue`)
      inputs = ['d', 'reset']; break
    default: fail('UNSUPPORTED_SEMANTICS', 'Unknown or unsupported node kind', `${path}.kind`)
  }
  requireFields(b, inputs, [], `${path}.inputBindings`, 'INVALID_NODE_BINDINGS')
  for (const k of inputs) ref(b[k], `${path}.inputBindings.${k}`)
}

function shape(value: unknown): asserts value is DigitalDesign {
  const d = requireDataObject(value, '$')
  requireFields(d, ['schemaVersion', 'id', 'name', 'revision', 'ports', 'clocks', 'nodes', 'outputBindings'], ['metadata'], '$')
  if (d.schemaVersion !== '0.3.0') fail('UNSUPPORTED_SCHEMA_VERSION', 'Expected schemaVersion 0.3.0', '$.schemaVersion')
  identifier(d.id, '$.id'); text(d.name, '$.name'); integer(d.revision, 1, Number.MAX_SAFE_INTEGER, '$.revision')
  const ports = requireDataArray(d.ports, DESIGN_LIMITS.ports, '$.ports')
  for (let i = 0; i < ports.length; i++) {
    const path = `$.ports[${i}]`, p = requireDataObject(ports[i], path)
    requireFields(p, ['id', 'direction', 'width'], ['signed'], path)
    identifier(p.id, `${path}.id`); width(p.width, `${path}.width`); signed(p, path)
    if (p.direction !== 'input' && p.direction !== 'output') fail('INVALID_SCHEMA', 'Expected input or output', `${path}.direction`)
  }
  if (Array.isArray(d.clocks) && d.clocks.length > 1) fail('UNSUPPORTED_CLOCKING', 'Only one clock domain is supported', '$.clocks')
  const clocks = requireDataArray(d.clocks, DESIGN_LIMITS.clocks, '$.clocks')
  for (let i = 0; i < clocks.length; i++) {
    const path = `$.clocks[${i}]`, c = requireDataObject(clocks[i], path)
    requireFields(c, ['id', 'edge'], [], path); identifier(c.id, `${path}.id`)
    if (c.edge !== 'rising') fail('UNSUPPORTED_CLOCKING', 'Only rising edges are supported', `${path}.edge`)
  }
  const nodes = requireDataArray(d.nodes, DESIGN_LIMITS.nodes, '$.nodes')
  for (let i = 0; i < nodes.length; i++) nodeShape(nodes[i], `$.nodes[${i}]`)
  const outputs = requireDataObject(d.outputBindings, '$.outputBindings')
  for (const key of Object.keys(outputs)) ref(outputs[key], `$.outputBindings.${key}`)
  if (has(d, 'metadata')) {
    const m = requireDataObject(d.metadata, '$.metadata')
    requireFields(m, [], ['description', 'teachingTopic'], '$.metadata')
    for (const k of Object.keys(m)) text(m[k], `$.metadata.${k}`, 4096)
  }
}

type Signal = { width: number; signed: boolean; port: string }
function outputSignal(n: NodeSpec): Signal {
  if (n.kind === 'EQ') return { width: 1, signed: false, port: 'out' }
  if (n.kind === 'CONCAT') return { width: n.params.highWidth + n.params.lowWidth, signed: false, port: 'out' }
  if (n.kind === 'SLICE') return { width: n.params.width, signed: false, port: 'out' }
  return { width: n.params.width, signed: n.params.signed ?? false, port: n.kind === 'REGISTER' ? 'q' : 'out' }
}

function structure(d: DigitalDesign) {
  const ids = new Set<string>()
  for (const group of ['ports', 'nodes', 'clocks'] as const) d[group].forEach((item, i) => {
    if (ids.has(item.id)) fail('DUPLICATE_ID', `Duplicate id: ${item.id}`, `$.${group}[${i}].id`)
    ids.add(item.id)
  })
  const signals = new Map<string, Signal>()
  for (const p of d.ports) if (p.direction === 'input') signals.set(p.id, { width: p.width, signed: p.signed ?? false, port: 'out' })
  for (const n of d.nodes) signals.set(n.id, outputSignal(n))
  function check(r: SignalRef, expected: { width: number; signed?: boolean }, path: string) {
    const s = signals.get(r.nodeId)
    if (!s || s.port !== r.port) fail('UNKNOWN_REFERENCE', `Unknown signal: ${r.nodeId}.${r.port}`, path)
    if (s.width !== expected.width) fail('WIDTH_MISMATCH', `Expected ${expected.width} bits, received ${s.width}`, path)
    if (expected.signed !== undefined && s.signed !== expected.signed) fail('SIGNEDNESS_MISMATCH', 'Signedness must match; no implicit conversion', path)
  }
  d.nodes.forEach((n, i) => {
    const path = `$.nodes[${i}]`
    const input = (key: string, w: number, s?: boolean) => check((n.inputBindings as Record<string, SignalRef>)[key], { width: w, signed: s }, `${path}.inputBindings.${key}`)
    switch (n.kind) {
      case 'CONST': break
      case 'SLICE': input('value', n.params.inputWidth); break
      case 'CONCAT': input('high', n.params.highWidth); input('low', n.params.lowWidth); break
      case 'REGISTER':
        if (!d.clocks.some(c => c.id === n.params.clockDomain)) fail('UNSUPPORTED_CLOCKING', 'Register must reference the declared clock domain', `${path}.params.clockDomain`)
        input('d', n.params.width, n.params.signed ?? false); input('reset', 1, false); break
      case 'MUX':
        input('sel', 1, false); input('whenFalse', n.params.width, n.params.signed ?? false); input('whenTrue', n.params.width, n.params.signed ?? false); break
      default:
        input('a', n.params.width, n.params.signed ?? false)
        if (n.kind !== 'NOT') input('b', n.params.width, n.params.signed ?? false)
    }
  })
  const outputs = d.ports.filter(p => p.direction === 'output')
  requireFields(d.outputBindings as unknown as Obj, outputs.map(p => p.id), [], '$.outputBindings', 'INVALID_DRIVER')
  for (const p of outputs) check(d.outputBindings[p.id], { width: p.width, signed: p.signed ?? false }, `$.outputBindings.${p.id}`)

  // Validate every component, including gates unreachable from outputs. Register Q is a source in the combinational graph.
  const nodeIndexes = new Map(d.nodes.map((node, index) => [node.id, index]))
  const indegree = d.nodes.map(() => 0)
  const consumers = d.nodes.map((): number[] => [])
  d.nodes.forEach((node, index) => {
    if (node.kind === 'REGISTER') return
    for (const ref of Object.values(node.inputBindings)) {
      const source = nodeIndexes.get(ref.nodeId)
      if (source === undefined) continue
      indegree[index]++
      consumers[source].push(index)
    }
  })
  const ready: number[] = []
  indegree.forEach((degree, index) => { if (degree === 0) ready.push(index) })
  for (let i = 0; i < ready.length; i++) {
    for (const index of consumers[ready[i]]) {
      if (--indegree[index] === 0) ready.push(index)
    }
  }
  if (ready.length !== d.nodes.length) {
    const index = indegree.findIndex(degree => degree > 0)
    fail('COMBINATIONAL_CYCLE', `Combinational cycle blocks node ${d.nodes[index].id}`, `$.nodes[${index}].inputBindings`)
  }
  return ready
}

/** Internal entry point shared by the parser and evaluator. */
export function prepareDesign(input: unknown) {
  shape(input)
  const nodeOrder = structure(input)
  return { design: structuredClone(input), nodeOrder }
}

/** Validates the entire design and returns a detached JSON-compatible copy. */
export function parseDesign(input: unknown): DigitalDesign {
  return prepareDesign(input).design
}

export type DesignValidation = { ok: true; design: DigitalDesign } | { ok: false; diagnostics: Diagnostic[] }
/** Fail-fast diagnostics keep paths precise; internal programming errors are not relabeled as invalid designs. */
export function validateDesign(input: unknown): DesignValidation {
  try { return { ok: true, design: parseDesign(input) } }
  catch (error) {
    if (!(error instanceof CoreError)) throw error
    return { ok: false, diagnostics: [error.toJSON()] }
  }
}
