import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CoreError, evaluateCombinational } from '../packages/core/dist/index.js'

const readExample = name => JSON.parse(readFileSync(new URL(`../examples/${name}/design.json`, import.meta.url), 'utf8'))
const ref = nodeId => ({ nodeId, port: 'out' })
const port = (id, direction, width, signed = false) => ({ id, direction, width, signed })
const bits = (n, width) => n.toString(2).padStart(width, '0')
const node = (id, kind, params, inputs = {}) => ({
  id, kind, params,
  inputBindings: Object.fromEntries(Object.entries(inputs).map(([name, source]) => [name, ref(source)])),
})
const frame = { a: '0001', b: '0010', sel: '1' }

function circuit(ports, nodes, outputs) {
  return {
    schemaVersion: '0.3.0', id: 'example', name: 'Combinational test design', revision: 1,
    clocks: [], ports, nodes, outputBindings: Object.fromEntries(Object.entries(outputs).map(([id, source]) => [id, ref(source)])),
  }
}

function expectError(run, code, path) {
  assert.throws(run, error => error instanceof CoreError && error.code === code && (!path || error.path === path))
}

test('M2: 4-bit ADD, MUX and EQ agree with independent references on all 512 frames', () => {
  const design = readExample('combinational4')
  for (let a = 0; a < 16; a++) {
    for (let b = 0; b < 16; b++) {
      for (let sel = 0; sel < 2; sel++) {
        const sum = (a + b) % 16
        assert.deepEqual(evaluateCombinational(design, { a: bits(a, 4), b: bits(b, 4), sel: String(sel) }), {
          sum: bits(sum, 4), selected: bits(sel === 1 ? sum : a, 4), equal: String(Number(a === b)),
        }, `a=${a}, b=${b}, sel=${sel}`)
      }
    }
  }
})

test('M2: multi-bit NOT, AND, OR and XOR match per-bit truth tables', () => {
  const design = circuit(
    [port('a', 'input', 3), port('b', 'input', 3), ...['inv', 'both', 'either', 'different'].map(id => port(id, 'output', 3))],
    [
      node('inv_gate', 'NOT', { width: 3 }, { a: 'a' }),
      node('and_gate', 'AND', { width: 3 }, { a: 'a', b: 'b' }),
      node('or_gate', 'OR', { width: 3 }, { a: 'a', b: 'b' }),
      node('xor_gate', 'XOR', { width: 3 }, { a: 'a', b: 'b' }),
    ],
    { inv: 'inv_gate', both: 'and_gate', either: 'or_gate', different: 'xor_gate' },
  )
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
    const left = bits(a, 3), right = bits(b, 3)
    const eachBit = fn => [...left].map((bit, i) => fn(bit, right[i]) ? '1' : '0').join('')
    assert.deepEqual(evaluateCombinational(design, { a: left, b: right }), {
      inv: eachBit(x => x === '0'), both: eachBit((x, y) => x === '1' && y === '1'),
      either: eachBit((x, y) => x === '1' || y === '1'), different: eachBit((x, y) => x !== y),
    })
  }
})

test('M2: SLICE uses LSB offsets and CONCAT preserves order with repeated dependencies', () => {
  const design = circuit(
    [port('a', 'input', 4, true), port('combined', 'output', 3), port('repeated', 'output', 4)],
    [
      node('joined', 'CONCAT', { highWidth: 2, lowWidth: 1 }, { high: 'part', low: 'last' }),
      node('repeat_part', 'CONCAT', { highWidth: 2, lowWidth: 2 }, { high: 'part', low: 'part' }),
      node('last', 'SLICE', { inputWidth: 4, lsb: 0, width: 1 }, { value: 'a' }),
      node('part', 'SLICE', { inputWidth: 4, lsb: 1, width: 2 }, { value: 'a' }),
    ],
    { combined: 'joined', repeated: 'repeat_part' },
  )
  for (let a = 0; a < 16; a++) {
    const input = bits(a, 4)
    assert.deepEqual(evaluateCombinational(design, { a: input }), { combined: input.slice(1), repeated: input.slice(1, 3).repeat(2) })
  }
})

test('M2: 64-bit signed operations preserve bits and wrap exactly', () => {
  const max = `0${'1'.repeat(63)}`
  const one = '1'.padStart(64, '0')
  const min = `1${'0'.repeat(63)}`
  const design = circuit(
    [port('result', 'output', 64, true), port('inverse', 'output', 64, true)],
    [
      node('max', 'CONST', { width: 64, signed: true, bits: max }),
      node('one', 'CONST', { width: 64, signed: true, bits: one }),
      node('sum', 'ADD', { width: 64, signed: true }, { a: 'max', b: 'one' }),
      node('complement', 'NOT', { width: 64, signed: true }, { a: 'sum' }),
    ],
    { result: 'sum', inverse: 'complement' },
  )
  assert.deepEqual(evaluateCombinational(design, {}), { result: min, inverse: max })
})

test('M2: port IDs remain own data keys, including __proto__', () => {
  const design = circuit(
    [port('source', 'input', 2), port('__proto__', 'output', 2)],
    [],
    { ['__proto__']: 'source' },
  )
  assert.deepEqual(evaluateCombinational(design, { source: '01' }), { ['__proto__']: '01' })
})

test('M2: reject incomplete, extra, malformed or executable input fields', () => {
  const design = readExample('combinational4')
  expectError(() => evaluateCombinational(design, { a: '0001', b: '0010' }), 'INVALID_SCHEMA', '$.inputs.sel')
  expectError(() => evaluateCombinational(design, { ...frame, extra: '0' }), 'INVALID_SCHEMA', '$.inputs.extra')
  expectError(() => evaluateCombinational(design, { ...frame, a: '001' }), 'INVALID_BIT_VECTOR', '$.inputs.a.bits')
  expectError(() => evaluateCombinational(design, { ...frame, b: 2 }), 'INVALID_BIT_VECTOR', '$.inputs.b.bits')
  expectError(() => evaluateCombinational(design, { ...frame, a: '00XZ' }), 'UNSUPPORTED_SEMANTICS', '$.inputs.a.bits')
  const accessor = { ...frame, get a() { assert.fail('input getter must not be executed') } }
  expectError(() => evaluateCombinational(design, accessor), 'INVALID_SCHEMA', '$.inputs.a')
})

test('M2: design validation runs before evaluation and covers disconnected nodes', () => {
  const design = readExample('combinational4')
  design.nodes.push(node('hidden', 'NOT', { width: 4 }, { a: 'absent' }))
  expectError(() => evaluateCombinational(design, frame), 'UNKNOWN_REFERENCE')
  design.nodes.at(-1).inputBindings.a = ref('hidden')
  expectError(() => evaluateCombinational(design, frame), 'COMBINATIONAL_CYCLE')
})

test('M2: sequential IR requires a sequential evaluator', () => {
  expectError(() => evaluateCombinational(readExample('counter4-decoder'), {}), 'UNSUPPORTED_SEMANTICS')
})
