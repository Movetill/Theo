import { CoreError } from './errors.js'

/** JSON-safe two-state vector. Bits are displayed most significant bit first. */
export interface BitVectorSpec {
  width: number
  signed: boolean
  bits: string
}

function checkedWidth(width: unknown, path: string): number {
  if (typeof width !== 'number' || !Number.isInteger(width) || width < 1 || width > 64) {
    throw new CoreError('INVALID_BIT_VECTOR', 'Bit width must be an integer in 1..64', path)
  }
  return width
}

function checkedSigned(signed: unknown, path: string): boolean {
  if (typeof signed !== 'boolean') {
    throw new CoreError('INVALID_BIT_VECTOR', 'signed must be a boolean', path)
  }
  return signed
}

/** Validate unknown input and return a detached canonical value. */
export function parseBitVector(input: unknown, path = 'bitVector'): BitVectorSpec {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new CoreError('INVALID_BIT_VECTOR', 'Expected a plain bit-vector object', path)
  }
  const fields = Reflect.ownKeys(input)
  if (fields.length !== 3 || !['width', 'signed', 'bits'].every(key => fields.includes(key))) {
    throw new CoreError('INVALID_BIT_VECTOR', 'Expected exactly width, signed and bits', path)
  }
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new CoreError('INVALID_BIT_VECTOR', 'Expected enumerable data properties, not accessors', `${path}.${String(key)}`)
    }
  }
  const vector = input as Record<string, unknown>
  const width = checkedWidth(vector.width, `${path}.width`)
  const signed = checkedSigned(vector.signed, `${path}.signed`)
  if (typeof vector.bits !== 'string') {
    throw new CoreError('INVALID_BIT_VECTOR', 'bits must be a binary string', `${path}.bits`)
  }
  if (/[xz]/i.test(vector.bits)) {
    throw new CoreError('UNSUPPORTED_SEMANTICS', 'X/Z values require a four-state model', `${path}.bits`)
  }
  if (vector.bits.length !== width || !/^[01]+$/.test(vector.bits)) {
    throw new CoreError('INVALID_BIT_VECTOR', 'bits must contain exactly width binary digits', `${path}.bits`)
  }
  return { width, signed, bits: vector.bits }
}

/** Encode a mathematical integer; unlike arithmetic, construction rejects overflow. */
export function fromBigInt(value: bigint, width: number, signed = false): BitVectorSpec {
  checkedWidth(width, 'width')
  checkedSigned(signed, 'signed')
  if (typeof value !== 'bigint') {
    throw new CoreError('INVALID_BIT_VECTOR', 'value must be a bigint', 'value')
  }
  const modulus = 1n << BigInt(width)
  const minimum = signed ? -(modulus >> 1n) : 0n
  const maximum = signed ? (modulus >> 1n) - 1n : modulus - 1n
  if (value < minimum || value > maximum) {
    throw new CoreError('OUT_OF_RANGE', `value must be in [${minimum}, ${maximum}]`, 'value')
  }
  return { width, signed, bits: (value < 0n ? modulus + value : value).toString(2).padStart(width, '0') }
}

/** Interpret signed vectors as two's-complement integers, without Number conversion. */
export function toBigInt(input: unknown): bigint {
  const vector = parseBitVector(input)
  const unsigned = BigInt(`0b${vector.bits}`)
  return vector.signed && vector.bits[0] === '1' ? unsigned - (1n << BigInt(vector.width)) : unsigned
}

/** Explicit resize: widen by sign/zero extension; narrow by discarding high bits. */
export function resizeBitVector(input: unknown, width: number): BitVectorSpec {
  const vector = parseBitVector(input)
  checkedWidth(width, 'width')
  const fill = vector.signed ? vector.bits[0] : '0'
  return { width, signed: vector.signed, bits: vector.bits.slice(-width).padStart(width, fill) }
}

/** Fixed-width addition wraps modulo 2^width, discarding carry and signed overflow. */
export function addBitVectors(left: unknown, right: unknown): BitVectorSpec {
  const a = parseBitVector(left, 'left')
  const b = parseBitVector(right, 'right')
  if (a.width !== b.width) {
    throw new CoreError('WIDTH_MISMATCH', 'Addition requires equal widths; resize explicitly', 'right.width')
  }
  if (a.signed !== b.signed) {
    throw new CoreError('SIGNEDNESS_MISMATCH', 'Addition requires equal signedness', 'right.signed')
  }
  const mask = (1n << BigInt(a.width)) - 1n
  const bits = ((BigInt(`0b${a.bits}`) + BigInt(`0b${b.bits}`)) & mask).toString(2).padStart(a.width, '0')
  return { width: a.width, signed: a.signed, bits }
}
