import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CoreError, simulate, verifyAgainstReference } from '../packages/core/dist/index.js'
import { counterReference } from '../examples/counter4-decoder/reference.mjs'

const counter = () => JSON.parse(readFileSync(new URL('../examples/counter4-decoder/design.json', import.meta.url), 'utf8'))
const binary = n => n.toString(2).padStart(4, '0')
const request = (design, inputFrames, initialRegisters) => ({
  designId: design.id,
  revision: design.revision,
  ...(initialRegisters === undefined ? {} : { initialRegisters }),
  stimuli: inputFrames.map((inputs, cycle) => ({ cycle, inputs, clockEvent: 'rising' })),
})
const run = { reset: '0', enable: '1' }
const hold = { reset: '0', enable: '0' }
const resetAndEnable = { reset: '1', enable: '1' }
const ref = (nodeId, port = 'out') => ({ nodeId, port })
const constant = (id, width, bits) => ({ id, kind: 'CONST', inputBindings: {}, params: { width, bits } })
const reg = (id, d, reset, initialValue) => ({
  id, kind: 'REGISTER', inputBindings: { d, reset },
  params: { width: initialValue.length, clockDomain: 'clk', resetMode: 'synchronous', resetActive: 'high',
    resetValue: '0'.repeat(initialValue.length), initialValue },
})
function designWithRegisters(registers, otherNodes) {
  return {
    schemaVersion: '0.3.0', id: 'regs', name: 'Registers', revision: 1,
    ports: [], outputBindings: {}, clocks: [{ id: 'clk', edge: 'rising' }],
    nodes: [...registers, ...otherNodes],
  }
}
function expectError(fn, code, path) {
  assert.throws(fn, e => e instanceof CoreError && e.code === code && (!path || e.path === path))
}

test('M3: every counter state, enable and reset combination agrees with the reference', () => {
  const design = counter()
  let checked = 0
  for (let count = 0; count < 16; count++) {
    for (const reset of ['0', '1']) {
      for (const enable of ['0', '1']) {
        const spec = request(design, [{ reset, enable }], { counter: binary(count) })
        const result = verifyAgainstReference(design, spec, counterReference)
        assert.equal(result.status, 'passed', JSON.stringify({ count, reset, enable, result }))
        checked += result.checkedCases
      }
    }
  }
  assert.equal(checked, 64)
})

test('M3: counter trace covers count 9, hold, synchronous reset and wrap, and replays from JSON', () => {
  const design = counter()
  const spec = request(design, [run, hold, resetAndEnable, ...Array(16).fill(run)], { counter: '1000' })
  const trace = simulate(design, spec)
  assert.equal(trace.semantics, 'two-state-synchronous-rising-edge-v1')
  assert.equal(trace.designId, design.id)
  assert.equal(trace.designRevision, design.revision)
  assert.deepEqual(trace.steps[0], {
    cycle: 0, inputs: run, stateBefore: { counter: '1000' },
    outputsBeforeEdge: { count: '1000', is_nine: '0' },
    nextState: { counter: '1001' }, stateAfter: { counter: '1001' },
    outputsAfterEdge: { count: '1001', is_nine: '1' },
  })
  assert.deepEqual(trace.steps[1].outputsAfterEdge, { count: '1001', is_nine: '1' })
  assert.deepEqual(trace.steps[2].outputsBeforeEdge, { count: '1001', is_nine: '1' })
  assert.deepEqual(trace.steps[2].outputsAfterEdge, { count: '0000', is_nine: '0' })
  assert.deepEqual(trace.steps.at(-1).stateBefore, { counter: '1111' })
  assert.deepEqual(trace.steps.at(-1).stateAfter, { counter: '0000' })
  const saved = JSON.parse(JSON.stringify(trace))
  const replay = request(design, saved.steps.map(step => step.inputs), saved.steps[0].stateBefore)
  assert.deepEqual(simulate(design, replay), saved)
  const verified = verifyAgainstReference(design, replay, counterReference)
  assert.equal(verified.status, 'passed')
  assert.equal(verified.checkedCases, 19)
  assert.equal(simulate(design, request(design, [hold])).steps[0].stateBefore.counter, '0000')
})

test('M3: cross-connected registers swap simultaneously regardless of node order', () => {
  const design = designWithRegisters([
    reg('left', ref('right', 'q'), ref('zero'), '0'),
    reg('right', ref('left', 'q'), ref('zero'), '1'),
  ], [constant('zero', 1, '0')])
  const spec = request(design, [{}, {}, {}])
  const trace = simulate(design, spec)
  assert.deepEqual(trace.steps.map(s => s.stateBefore), [{ left: '0', right: '1' }, { left: '1', right: '0' }, { left: '0', right: '1' }])
  assert.deepEqual(trace.steps.map(s => s.nextState), [{ left: '1', right: '0' }, { left: '0', right: '1' }, { left: '1', right: '0' }])
  assert.deepEqual(trace.steps.map(s => s.stateAfter), trace.steps.map(s => s.nextState))
  design.nodes.reverse()
  assert.deepEqual(simulate(design, spec), trace)
})

test('M3: a reset sourced from another register is also sampled before commit', () => {
  const design = designWithRegisters([
    reg('assert_reset', ref('one'), ref('zero'), '0'),
    reg('target', ref('one'), ref('assert_reset', 'q'), '0'),
  ], [constant('zero', 1, '0'), constant('one', 1, '1')])
  assert.deepEqual(simulate(design, request(design, [{}, {}])).steps.map(s => s.stateAfter), [
    { assert_reset: '1', target: '1' }, { assert_reset: '1', target: '0' },
  ])
})

test('M3: request validation rejects stale design versions, gaps, invalid inputs and incomplete overrides', () => {
  const design = counter()
  const spec = request(design, [run])
  expectError(() => simulate(design, { ...spec, designId: 'stale' }), 'INVALID_SCHEMA', '$.request.designId')
  expectError(() => simulate(design, { ...spec, revision: 2 }), 'INVALID_SCHEMA', '$.request.revision')
  expectError(() => simulate(design, { ...spec, stimuli: [] }), 'INVALID_SCHEMA', '$.request.stimuli')
  expectError(() => simulate(design, { ...spec, stimuli: [{ ...spec.stimuli[0], cycle: 1 }] }), 'INVALID_SCHEMA', '$.request.stimuli[0].cycle')
  expectError(() => simulate(design, { ...spec, stimuli: [{ ...spec.stimuli[0], clockEvent: 'falling' }] }), 'UNSUPPORTED_CLOCKING', '$.request.stimuli[0].clockEvent')
  expectError(() => simulate(design, request(design, [{ enable: '1' }])), 'INVALID_SCHEMA', '$.request.stimuli[0].inputs.reset')
  expectError(() => simulate(design, request(design, [{ ...run, enable: '01' }])), 'INVALID_BIT_VECTOR', '$.request.stimuli[0].inputs.enable.bits')
  expectError(() => simulate(design, request(design, [{ ...run, enable: 'X' }])), 'UNSUPPORTED_SEMANTICS')
  expectError(() => simulate(design, { ...spec, initialRegisters: {} }), 'INVALID_SCHEMA', '$.request.initialRegisters.counter')
  expectError(() => simulate(design, { ...spec, initialRegisters: { counter: '1' } }), 'INVALID_BIT_VECTOR')
  const accessor = [{ ...spec.stimuli[0], get inputs() { assert.fail('must not invoke stimulus getter') } }]
  expectError(() => simulate(design, { ...spec, stimuli: accessor }), 'INVALID_SCHEMA', '$.request.stimuli[0].inputs')
})

test('M3: reject excessive cycles and oversized traces with structured limits', () => {
  const design = counter()
  expectError(() => simulate(design, request(design, Array(10_001).fill(run))), 'RESOURCE_LIMIT', '$.request.stimuli')
  const state = '1'.repeat(64)
  const registers = Array.from({ length: 999 }, (_, i) => {
    const id = `r${i}`.padEnd(64, '_')
    return reg(id, ref(id, 'q'), ref('zero'), state)
  })
  const large = designWithRegisters(registers, [constant('zero', 1, '0')])
  assert.throws(() => simulate(large, request(large, Array(25).fill({}))),
    e => e instanceof CoreError && e.code === 'RESOURCE_LIMIT' && e.path.startsWith('$.trace.steps['))
})

test('M3: stimulus byte budget is independent of the trace byte budget', () => {
  const design = designWithRegisters([], [])
  design.clocks = []
  design.ports = Array.from({ length: 128 }, (_, index) => ({
    id: `p${index}`.padEnd(64, '_'), direction: 'input', width: 64,
  }))
  const inputs = Object.fromEntries(design.ports.map(({ id }) => [id, '0'.repeat(64)]))
  assert.throws(() => simulate(design, request(design, Array(250).fill(inputs))),
    e => e instanceof CoreError && e.code === 'RESOURCE_LIMIT' && e.path.startsWith('$.request.stimuli[') && /4 MiB/.test(e.message))
})

test('M3: verification reports the first divergence with a replayable input and initial state', () => {
  const design = counter()
  const spec = request(design, [run, run], { counter: '0111' })
  const wrong = {
    ...counterReference,
    step(frame) {
      const expected = counterReference.step(frame)
      if (frame.cycle === 1) expected.outputsAfterEdge.is_nine = '0'
      return expected
    },
  }
  const result = verifyAgainstReference(design, spec, wrong)
  assert.equal(result.status, 'failed')
  assert.equal(result.checkedCases, 2)
  assert.deepEqual(result.counterexample, {
    cycle: 1, inputs: run, stateBefore: { counter: '1000' }, field: 'outputsAfterEdge',
    signal: 'is_nine', expected: '0', actual: '1',
  })
})

test('M3: invalid requests, unsupported edges and malformed references receive distinct results', () => {
  const design = counter()
  const spec = request(design, [run])
  const badRequest = verifyAgainstReference(design, { ...spec, revision: 2 }, counterReference)
  assert.equal(badRequest.status, 'error')
  assert.equal(badRequest.diagnostics[0].code, 'INVALID_SCHEMA')
  const unsupported = verifyAgainstReference(design, { ...spec, stimuli: [{ ...spec.stimuli[0], clockEvent: 'falling' }] }, counterReference)
  assert.equal(unsupported.status, 'unsupported')
  assert.equal(unsupported.diagnostics[0].code, 'UNSUPPORTED_CLOCKING')
  const malformed = verifyAgainstReference(design, spec, { ...counterReference, step: () => ({}) })
  assert.equal(malformed.status, 'error')
  assert.equal(malformed.checkedCases, 0)
  assert.equal(malformed.diagnostics[0].path, '$.reference.result.stateAfter')
  const thrown = verifyAgainstReference(design, spec, { ...counterReference, step() { throw new Error('broken model') } })
  assert.equal(thrown.status, 'error')
  assert.equal(thrown.diagnostics[0].code, 'REFERENCE_ERROR')
  assert.equal(thrown.diagnostics[0].path, '$.reference.step')
})
