import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDesign, validateDesign } from '../packages/core/dist/index.js'

const ref = (nodeId, port = 'out') => ({ nodeId, port })
const counter = () => JSON.parse(readFileSync(new URL('../examples/counter4-decoder/design.json', import.meta.url), 'utf8'))
const adder = () => ({
  schemaVersion: '0.3.0', id: 'adder4', name: 'Four-bit adder', revision: 1,
  ports: [
    { id: 'a', direction: 'input', width: 4 },
    { id: 'b', direction: 'input', width: 4 },
    { id: 'sum', direction: 'output', width: 4 },
  ],
  clocks: [],
  nodes: [{ id: 'add', kind: 'ADD', inputBindings: { a: ref('a'), b: ref('b') }, params: { width: 4 } }],
  outputBindings: { sum: ref('add') },
})
function expectFailure(design, code) {
  const result = validateDesign(design)
  assert.equal(result.ok, false, `Expected ${code}; validation succeeded`)
  assert.ok(result.diagnostics.some(d => d.code === code), JSON.stringify(result.diagnostics))
  for (const diagnostic of result.diagnostics) {
    assert.equal(typeof diagnostic.message, 'string')
    assert.ok(diagnostic.message.length > 0)
    assert.equal(typeof diagnostic.path, 'string')
  }
  assert.throws(() => parseDesign(design), error => typeof error.code === 'string' && typeof error.path === 'string')
}

test('IR: 4-bit adder can be validated without a clock or DSH host', () => {
  const result = validateDesign(adder())
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.design.id, 'adder4')
})

test('IR: counter feedback is legal and survives a JSON round trip', () => {
  const design = parseDesign(counter())
  assert.deepEqual(parseDesign(JSON.parse(JSON.stringify(design))), design)
  assert.equal(design.nodes.find(n => n.id === 'counter').params.initialValue, '0000')
})

test('IR: registers break a feedback cycle even when directly cross-connected', () => {
  const design = counter()
  const reg = design.nodes.find(n => n.kind === 'REGISTER')
  const second = structuredClone(reg)
  second.id = 'second'
  second.inputBindings.d = ref(reg.id, 'q')
  reg.inputBindings.d = ref(second.id, 'q')
  design.nodes.push(second)
  assert.equal(validateDesign(design).ok, true)
})

test('IR: all combinational primitive binding shapes have a valid example', () => {
  for (const kind of ['NOT', 'AND', 'OR', 'XOR', 'ADD', 'EQ']) {
    const design = adder()
    design.nodes[0].kind = kind
    if (kind === 'NOT') delete design.nodes[0].inputBindings.b
    if (kind === 'EQ') design.ports[2].width = 1
    assert.equal(validateDesign(design).ok, true, kind)
  }
  const design = adder()
  design.nodes = [
    { id: 'lo', kind: 'SLICE', inputBindings: { value: ref('a') }, params: { inputWidth: 4, lsb: 0, width: 2 } },
    { id: 'hi', kind: 'SLICE', inputBindings: { value: ref('b') }, params: { inputWidth: 4, lsb: 2, width: 2 } },
    { id: 'join', kind: 'CONCAT', inputBindings: { high: ref('hi'), low: ref('lo') }, params: { highWidth: 2, lowWidth: 2 } },
  ]
  design.outputBindings.sum = ref('join')
  assert.equal(validateDesign(design).ok, true)
})

test('IR: valid signed data connections retain one-bit unsigned comparator output', () => {
  const design = adder()
  design.ports[0].signed = true
  design.ports[1].signed = true
  design.ports[2].width = 1
  design.nodes[0].kind = 'EQ'
  design.nodes[0].params.signed = true
  assert.equal(validateDesign(design).ok, true)
})

test('IR: malformed top-level values produce diagnostics rather than TypeError', () => {
  for (const value of [null, undefined, [], 'design', 1, {}]) expectFailure(value, 'INVALID_SCHEMA')
})

test('IR: schema versions must be explicitly supported', () => {
  expectFailure({ ...adder(), schemaVersion: '0.4.0' }, 'UNSUPPORTED_SCHEMA_VERSION')
})

test('IR: ID namespace is shared across ports, nodes and clocks', () => {
  const design = adder()
  design.nodes[0].id = 'a'
  expectFailure(design, 'DUPLICATE_ID')
  const sequential = counter()
  sequential.clocks[0].id = 'reset'
  expectFailure(sequential, 'DUPLICATE_ID')
})

test('IR: missing source and unknown named source output are rejected', () => {
  const design = adder()
  design.nodes[0].inputBindings.a = ref('missing')
  expectFailure(design, 'UNKNOWN_REFERENCE')
  design.nodes[0].inputBindings.a = ref('a', 'q')
  expectFailure(design, 'UNKNOWN_REFERENCE')
})

test('IR: output ports cannot be used as sources', () => {
  const design = adder()
  design.nodes[0].inputBindings.a = ref('sum')
  expectFailure(design, 'UNKNOWN_REFERENCE')
})

test('IR: input bindings reject missing or surplus named terminals', () => {
  const design = adder()
  delete design.nodes[0].inputBindings.b
  expectFailure(design, 'INVALID_NODE_BINDINGS')
  design.nodes[0].inputBindings.b = ref('b')
  design.nodes[0].inputBindings.c = ref('a')
  expectFailure(design, 'INVALID_NODE_BINDINGS')
})

test('IR: data widths and signedness must match explicitly', () => {
  const design = adder()
  design.ports[0].width = 8
  expectFailure(design, 'WIDTH_MISMATCH')
  design.ports[0].width = 4
  design.ports[0].signed = true
  expectFailure(design, 'SIGNEDNESS_MISMATCH')
})

test('IR: MUX selector must be an unsigned one-bit signal', () => {
  const design = counter()
  design.ports.find(p => p.id === 'enable').width = 4
  expectFailure(design, 'WIDTH_MISMATCH')
  design.ports.find(p => p.id === 'enable').width = 1
  design.ports.find(p => p.id === 'enable').signed = true
  expectFailure(design, 'SIGNEDNESS_MISMATCH')
})

test('IR: every output needs exactly its declared driver', () => {
  const missing = adder()
  delete missing.outputBindings.sum
  expectFailure(missing, 'INVALID_DRIVER')
  const surplus = adder()
  surplus.outputBindings.a = ref('add')
  expectFailure(surplus, 'INVALID_DRIVER')
  const mismatch = adder()
  mismatch.ports[2].width = 8
  expectFailure(mismatch, 'WIDTH_MISMATCH')
})

test('IR: output-reachable combinational cycles are rejected', () => {
  const design = adder()
  design.nodes[0].inputBindings.a = ref('add')
  expectFailure(design, 'COMBINATIONAL_CYCLE')
})

test('IR: unconnected combinational cycles are also rejected', () => {
  const design = adder()
  design.nodes.push(
    { id: 'x', kind: 'NOT', inputBindings: { a: ref('y') }, params: { width: 4 } },
    { id: 'y', kind: 'NOT', inputBindings: { a: ref('x') }, params: { width: 4 } },
  )
  expectFailure(design, 'COMBINATIONAL_CYCLE')
})

test('IR: unconnected unknown references are not hidden by valid outputs', () => {
  const design = adder()
  design.nodes.push({ id: 'unused', kind: 'NOT', inputBindings: { a: ref('missing') }, params: { width: 4 } })
  expectFailure(design, 'UNKNOWN_REFERENCE')
})

test('IR: absent initial register state is not silently initialized', () => {
  const design = counter()
  delete design.nodes.find(n => n.kind === 'REGISTER').params.initialValue
  expectFailure(design, 'INVALID_SCHEMA')
})

test('IR: asynchronous reset and falling-edge clocks are unsupported', () => {
  const design = counter()
  design.nodes.find(n => n.kind === 'REGISTER').params.resetMode = 'asynchronous'
  expectFailure(design, 'UNSUPPORTED_SEMANTICS')
  const falling = counter()
  falling.clocks[0].edge = 'falling'
  expectFailure(falling, 'UNSUPPORTED_CLOCKING')
})

test('IR: multiple clock domains and undeclared register clocks are rejected', () => {
  const multi = counter()
  multi.clocks.push({ id: 'secondClock', edge: 'rising' })
  expectFailure(multi, 'UNSUPPORTED_CLOCKING')
  const missing = counter()
  missing.nodes.find(n => n.kind === 'REGISTER').params.clockDomain = 'missing'
  expectFailure(missing, 'UNSUPPORTED_CLOCKING')
})

test('IR: unknown fields and executable next-state callbacks are forbidden', () => {
  const topLevel = adder()
  topLevel.execute = () => 0
  expectFailure(topLevel, 'INVALID_SCHEMA')
  const node = counter()
  node.nodes.find(n => n.kind === 'REGISTER').params.nextStateFn = '() => 1'
  expectFailure(node, 'INVALID_SCHEMA')
  const reference = adder()
  reference.nodes[0].inputBindings.a.expression = 'a + 1'
  expectFailure(reference, 'INVALID_SCHEMA')
})

test('IR: two-state constants reject X/Z and incorrect bit lengths', () => {
  const design = counter()
  design.nodes[0].params.bits = '00X1'
  expectFailure(design, 'UNSUPPORTED_SEMANTICS')
  design.nodes[0].params.bits = '00001'
  expectFailure(design, 'INVALID_BIT_VECTOR')
})

test('IR: width, node count and port count are bounded', () => {
  const wide = adder()
  wide.ports[0].width = 65
  expectFailure(wide, 'RESOURCE_LIMIT')
  const manyNodes = adder()
  manyNodes.nodes = Array.from({ length: 1001 }, (_, i) => ({ id: `constant_${i}`, kind: 'CONST', inputBindings: {}, params: { width: 4, bits: '0000' } }))
  expectFailure(manyNodes, 'RESOURCE_LIMIT')
  const manyPorts = adder()
  manyPorts.ports = Array.from({ length: 129 }, (_, i) => ({ id: `input_${i}`, direction: 'input', width: 4 }))
  expectFailure(manyPorts, 'RESOURCE_LIMIT')
})

test('IR: SLICE cannot select beyond its source and CONCAT cannot exceed 64 bits', () => {
  const design = adder()
  design.nodes[0] = { id: 'add', kind: 'SLICE', inputBindings: { value: ref('a') }, params: { inputWidth: 4, lsb: 2, width: 4 } }
  expectFailure(design, 'WIDTH_MISMATCH')
  design.nodes[0] = { id: 'add', kind: 'CONCAT', inputBindings: { high: ref('a'), low: ref('b') }, params: { highWidth: 64, lowWidth: 1 } }
  expectFailure(design, 'RESOURCE_LIMIT')
})

test('IR: malformed nested collections and null references cannot crash validation', () => {
  const mutations = [
    d => { d.ports = null },
    d => { d.nodes = {} },
    d => { d.nodes[0] = null },
    d => { d.nodes[0].params = null },
    d => { d.nodes[0].inputBindings.a = null },
    d => { d.outputBindings = null },
  ]
  for (const mutate of mutations) {
    const design = adder()
    mutate(design)
    const result = validateDesign(design)
    assert.equal(result.ok, false)
    assert.ok(result.diagnostics.length > 0)
  }
})

test('IR: accessors are rejected without executing user code', () => {
  const design = adder()
  let reads = 0
  Object.defineProperty(design, 'name', { enumerable: true, get() { reads++; return reads === 1 ? 'valid' : {} } })
  expectFailure(design, 'INVALID_SCHEMA')
  assert.equal(reads, 0)
  const indexed = adder()
  Object.defineProperty(indexed.nodes, '0', { enumerable: true, get() { throw new Error('must not execute') } })
  expectFailure(indexed, 'INVALID_SCHEMA')
})

test('IR: symbols, hidden fields and extra array properties are not JSON data', () => {
  const symbolic = adder()
  symbolic[Symbol('extra')] = true
  expectFailure(symbolic, 'INVALID_SCHEMA')
  const hidden = adder()
  Object.defineProperty(hidden.nodes[0].params, 'extra', { value: true })
  expectFailure(hidden, 'INVALID_SCHEMA')
  const extra = adder()
  extra.ports.execute = () => 0
  expectFailure(extra, 'INVALID_SCHEMA')
  const sparse = adder()
  delete sparse.ports[0]
  expectFailure(sparse, 'INVALID_SCHEMA')
})

test('IR: validated designs are detached from caller mutation', () => {
  const original = adder()
  const parsed = parseDesign(original)
  original.nodes[0].params.width = 64
  assert.equal(parsed.nodes[0].params.width, 4)
  assert.equal(validateDesign(parsed).ok, true)
})
