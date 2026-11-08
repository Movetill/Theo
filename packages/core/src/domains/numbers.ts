/** Exact number-system and signed-encoding utilities (no floating-point conversions). */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function convertRadix(value: string, fromBase: number, toBase: number) {
  if (!Number.isInteger(fromBase) || fromBase < 2 || fromBase > 36 || !Number.isInteger(toBase) || toBase < 2 || toBase > 36) {
    throw new Error('Bases must be integers from 2 to 36')
  }
  const text = value.trim().toUpperCase()
  const negative = text.startsWith('-')
  const body = negative ? text.slice(1) : text
  if (!body || body.length > 256) throw new Error('Expected 1..256 digits')
  let n = 0n
  for (const c of body) {
    const digit = DIGITS.indexOf(c)
    if (digit < 0 || digit >= fromBase) throw new Error(`Invalid base-${fromBase} digit: ${c}`)
    n = n * BigInt(fromBase) + BigInt(digit)
  }
  if (negative) n = -n
  return { input: value, fromBase, toBase, output: n.toString(toBase).toUpperCase(), decimal: n.toString() }
}

export type SignedEncoding = 'sign-magnitude' | 'ones-complement' | 'twos-complement'
export function encodeSigned(value: number, width: number, encoding: SignedEncoding) {
  if (!Number.isSafeInteger(value)) throw new Error('value must be a safe integer')
  if (!Number.isInteger(width) || width < 2 || width > 53) throw new Error('width must be 2..53')
  if (!['sign-magnitude', 'ones-complement', 'twos-complement'].includes(encoding)) throw new Error('Unsupported encoding')
  const v = BigInt(value)
  const w = BigInt(width)
  const scale = 1n << w
  const magnitudeLimit = (1n << (w - 1n)) - 1n
  const min = encoding === 'twos-complement' ? -(1n << (w - 1n)) : -magnitudeLimit
  if (v < min || v > magnitudeLimit) throw new Error(`Value out of range [${min}, ${magnitudeLimit}]`)
  let bits: bigint
  if (encoding === 'twos-complement') bits = (v + scale) % scale
  else if (encoding === 'ones-complement') bits = v < 0 ? (scale - 1n) ^ (-v) : v
  else bits = v < 0 ? (1n << (w - 1n)) | -v : v
  return { value, width, encoding, bits: bits.toString(2).padStart(width, '0'), range: [min.toString(), magnitudeLimit.toString()] }
}
