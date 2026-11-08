/** Teaching model of edge-ordered ROM / RAM accesses; not a timing-accurate SRAM model. */
export type MemOp = { kind: 'read' | 'write'; address: number; value?: number }
export interface MemorySpec {
  kind: 'ROM' | 'RAM'
  addressBits: number
  dataBits: number
  initial?: Record<string, number>
  operations: MemOp[]
}
export function traceMemory(spec: MemorySpec) {
  if (spec.kind !== 'ROM' && spec.kind !== 'RAM') throw new Error('Memory kind must be ROM or RAM')
  if (!Number.isInteger(spec.addressBits) || spec.addressBits < 1 || spec.addressBits > 12) throw new Error('Address width must be 1..12')
  if (!Number.isInteger(spec.dataBits) || spec.dataBits < 1 || spec.dataBits > 32) throw new Error('Data width must be 1..32')
  if (!Array.isArray(spec.operations) || spec.operations.length > 2048) throw new Error('Too many operations')
  const depth = 2 ** spec.addressBits
  const maxWord = 2 ** spec.dataBits - 1
  const store = new Map<number, number>()
  const checkAddress = (a: number) => { if (!Number.isInteger(a) || a < 0 || a >= depth) throw new Error(`Address out of range: ${a}`) }
  const checkWord = (word: number | undefined) => { if (!Number.isInteger(word) || word! < 0 || word! > maxWord) throw new Error('Word out of range') }
  for (const [key, value] of Object.entries(spec.initial ?? {})) {
    if (!/^\d+$/.test(key)) throw new Error('Invalid address key')
    const address = Number(key)
    checkAddress(address); checkWord(value)
    store.set(address, value)
  }
  const events = spec.operations.map((op, cycle) => {
    checkAddress(op.address)
    const before = store.get(op.address) ?? 0
    if (op.kind === 'read') return { cycle, action: 'read', address: op.address, value: before }
    if (op.kind !== 'write') throw new Error('Unknown operation')
    if (spec.kind === 'ROM') throw new Error('ROM is read-only')
    checkWord(op.value)
    store.set(op.address, op.value!)
    return { cycle, action: 'write', address: op.address, before, after: op.value! }
  })
  return { kind: spec.kind, depth, dataBits: spec.dataBits, events, nonzeroWords: Object.fromEntries([...store].filter(([, v]) => v !== 0).sort(([a], [b]) => a - b)) }
}
