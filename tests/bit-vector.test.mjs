import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBitVector, fromBigInt, toBigInt, resizeBitVector, addBitVectors,
} from '../packages/core/dist/foundation/bit-vector.js'

const failsWith = (code, path) => error => {
  assert.equal(error.code, code)
  if (path !== undefined) assert.equal(error.path, path)
  return true
}

test('BitVector round-trips JSON and detaches the validated value', () => {
  const original = { width: 4, signed: false, bits: '1001' }
  const vector = parseBitVector(JSON.parse(JSON.stringify(original)))
  assert.deepEqual(vector, original)
  assert.notEqual(parseBitVector(original), original)
  assert.equal(toBigInt(vector), 9n)
  assert.deepEqual(JSON.parse(JSON.stringify(fromBigInt(9n, 4))), original)
})

test('BitVector rejects malformed structure, widths, flags and digits', () => {
  const valid = { width: 4, signed: false, bits: '1001' }
  const invalid = [
    null, [], '1001', 9, new Date(), {},
    { ...valid, extra: 0 }, { width: 4, bits: '1001' },
    { ...valid, width: 0 }, { ...valid, width: 65 },
    { ...valid, width: 1.5 }, { ...valid, width: NaN }, { ...valid, width: Infinity },
    { ...valid, width: '4' }, { ...valid, signed: 0 }, { ...valid, signed: 'false' },
    { ...valid, bits: 1001 }, { ...valid, bits: '101' }, { ...valid, bits: '10010' },
    { ...valid, bits: '1002' }, { ...valid, bits: ' 001' },
    { ...valid, [Symbol('extra')]: 0 }, Object.create(valid),
  ]
  for (const value of invalid) assert.throws(() => parseBitVector(value), failsWith('INVALID_BIT_VECTOR'))
  assert.throws(() => parseBitVector({ ...valid, bits: '000' }, 'initial'), failsWith('INVALID_BIT_VECTOR', 'initial.bits'))
})

test('BitVector rejects X/Z semantics explicitly instead of silently producing zero', () => {
  for (const bits of ['X001', '100Z', 'x001', '100z']) {
    assert.throws(() => parseBitVector({ width: 4, signed: false, bits }), failsWith('UNSUPPORTED_SEMANTICS'))
  }
})

test('BitVector rejects accessors without invocation and rejects hidden fields', () => {
  let invoked = false
  for (const key of ['width', 'signed', 'bits']) {
    const vector = { width: 4, signed: false, bits: '1001' }
    Object.defineProperty(vector, key, {
      enumerable: true,
      get() { invoked = true; throw new Error('Accessor must never run') },
    })
    assert.throws(() => parseBitVector(vector), failsWith('INVALID_BIT_VECTOR', `bitVector.${key}`))
    const hidden = { width: 4, signed: false, bits: '1001' }
    Object.defineProperty(hidden, key, { enumerable: false })
    assert.throws(() => parseBitVector(hidden), failsWith('INVALID_BIT_VECTOR', `bitVector.${key}`))
  }
  const setterOnly = { width: 4, signed: false, bits: '1001' }
  Object.defineProperty(setterOnly, 'bits', { enumerable: true, set() { invoked = true } })
  assert.throws(() => parseBitVector(setterOnly), failsWith('INVALID_BIT_VECTOR', 'bitVector.bits'))
  assert.equal(invoked, false)
})

test('BitVector preserves all 64 bits beyond Number precision', () => {
  const maximum = 18446744073709551615n
  assert.equal(fromBigInt(maximum, 64).bits, '1'.repeat(64))
  assert.equal(toBigInt(fromBigInt(maximum, 64)), maximum)
  assert.equal(toBigInt(fromBigInt(9007199254740993n, 64)), 9007199254740993n)
  assert.equal(toBigInt({ width: 64, signed: true, bits: '1' + '0'.repeat(63) }), -9223372036854775808n)
  assert.equal(toBigInt(fromBigInt(9223372036854775807n, 64, true)), 9223372036854775807n)
})

test('BitVector construction enforces signed and unsigned range including width one', () => {
  assert.deepEqual(fromBigInt(-1n, 1, true), { width: 1, signed: true, bits: '1' })
  assert.equal(toBigInt(fromBigInt(0n, 1, true)), 0n)
  assert.equal(toBigInt(fromBigInt(1n, 1)), 1n)
  for (const args of [[-1n, 4], [16n, 4], [-9n, 4, true], [8n, 4, true], [1n, 1, true], [18446744073709551616n, 64]]) {
    assert.throws(() => fromBigInt(...args), failsWith('OUT_OF_RANGE', 'value'))
  }
  assert.throws(() => fromBigInt(1, 4), failsWith('INVALID_BIT_VECTOR', 'value'))
  assert.throws(() => fromBigInt(1n, 65), failsWith('INVALID_BIT_VECTOR', 'width'))
  assert.throws(() => fromBigInt(1n, 4, 'false'), failsWith('INVALID_BIT_VECTOR', 'signed'))
})

test('BitVector resize uses sign/zero extension and explicit low-bit truncation', () => {
  assert.equal(resizeBitVector(fromBigInt(-3n, 4, true), 8).bits, '11111101')
  assert.equal(resizeBitVector(fromBigInt(13n, 4), 8).bits, '00001101')
  assert.equal(resizeBitVector(fromBigInt(5n, 4, true), 8).bits, '00000101')
  assert.equal(toBigInt(resizeBitVector(fromBigInt(15n, 8, true), 4)), -1n)
  assert.equal(toBigInt(resizeBitVector(fromBigInt(-9n, 8, true), 4)), 7n)
  const input = fromBigInt(5n, 4)
  assert.deepEqual(resizeBitVector(input, 4), input)
  assert.notEqual(resizeBitVector(input, 4), input)
  assert.throws(() => resizeBitVector(input, 0), failsWith('INVALID_BIT_VECTOR', 'width'))
})

test('BitVector addition wraps unsigned carry and signed overflow without mutation', () => {
  const left = fromBigInt(15n, 4)
  const right = fromBigInt(1n, 4)
  assert.equal(toBigInt(addBitVectors(left, right)), 0n)
  assert.equal(left.bits, '1111')
  assert.equal(right.bits, '0001')
  assert.equal(toBigInt(addBitVectors(fromBigInt(7n, 4, true), fromBigInt(1n, 4, true))), -8n)
  assert.equal(toBigInt(addBitVectors(fromBigInt(-8n, 4, true), fromBigInt(-1n, 4, true))), 7n)
  assert.equal(toBigInt(addBitVectors(fromBigInt(18446744073709551615n, 64), fromBigInt(1n, 64))), 0n)
  assert.throws(() => addBitVectors(left, fromBigInt(1n, 8)), failsWith('WIDTH_MISMATCH', 'right.width'))
  assert.throws(() => addBitVectors(left, fromBigInt(1n, 4, true)), failsWith('SIGNEDNESS_MISMATCH', 'right.signed'))
})

test('BitVector operations validate inputs even when called directly from JavaScript', () => {
  const invalid = { width: 4, signed: false, bits: '100' }
  assert.throws(() => toBigInt(invalid), failsWith('INVALID_BIT_VECTOR'))
  assert.throws(() => resizeBitVector(invalid, 8), failsWith('INVALID_BIT_VECTOR'))
  assert.throws(() => addBitVectors(invalid, fromBigInt(0n, 4)), failsWith('INVALID_BIT_VECTOR', 'left.bits'))
  assert.throws(() => addBitVectors(fromBigInt(0n, 4), invalid), failsWith('INVALID_BIT_VECTOR', 'right.bits'))
})

test('BitVector small-width arithmetic and resize agree with independent integer references', () => {
  for (let width = 1; width <= 4; width++) {
    const modulus = 2 ** width
    for (const signed of [false, true]) {
      const minimum = signed ? -modulus / 2 : 0
      for (let a = minimum; a < minimum + modulus; a++) {
        const vector = fromBigInt(BigInt(a), width, signed)
        assert.equal(toBigInt(vector), BigInt(a))
        assert.equal(toBigInt(resizeBitVector(vector, width + 1)), BigInt(a))
        for (let b = minimum; b < minimum + modulus; b++) {
          let expected = ((a + b) % modulus + modulus) % modulus
          if (signed && expected >= modulus / 2) expected -= modulus
          assert.equal(toBigInt(addBitVectors(vector, fromBigInt(BigInt(b), width, signed))), BigInt(expected))
        }
        for (let target = 1; target < width; target++) {
          const targetModulus = 2 ** target
          let expected = ((a % targetModulus) + targetModulus) % targetModulus
          if (signed && expected >= targetModulus / 2) expected -= targetModulus
          assert.equal(toBigInt(resizeBitVector(vector, target)), BigInt(expected))
        }
      }
    }
  }
})
