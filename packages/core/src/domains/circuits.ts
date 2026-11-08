/** Simple zero-delay, single-bit combinational netlist interpreter. */
export type GateType = 'NOT' | 'BUF' | 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'XNOR'
export interface Gate { id: string; op: GateType; args: string[] }
export interface Netlist { inputs: string[]; gates: Gate[]; outputs: string[] }

function gateOp(op: GateType, args: number[]): number {
  if (!['NOT', 'BUF', 'AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR'].includes(op)) throw new Error(`Unsupported gate: ${op}`)
  if (['NOT', 'BUF'].includes(op) ? args.length !== 1 : args.length < 2) throw new Error(`Invalid fan-in for ${op}`)
  const and = args.every(Boolean) ? 1 : 0
  const or = args.some(Boolean) ? 1 : 0
  const xor = args.reduce((v, x) => v ^ x, 0)
  switch (op) {
    case 'NOT': return 1 - args[0]
    case 'BUF': return args[0]
    case 'AND': return and
    case 'OR': return or
    case 'XOR': return xor
    case 'NAND': return 1 - and
    case 'NOR': return 1 - or
    case 'XNOR': return 1 - xor
  }
}

export function evaluateNetlist(netlist: Netlist, values: Record<string, number>) {
  const ident = /^[A-Za-z_][A-Za-z0-9_]*$/
  if (!Array.isArray(netlist.inputs) || !Array.isArray(netlist.gates) || !Array.isArray(netlist.outputs)) throw new Error('Invalid netlist shape')
  if (netlist.inputs.length > 10 || netlist.gates.length > 500 || netlist.outputs.length > 32) throw new Error('Netlist size limit exceeded')
  const identifiers = [...netlist.inputs, ...netlist.gates.map(g => g.id)]
  if (new Set(identifiers).size !== identifiers.length || identifiers.some(id => !ident.test(id))) throw new Error('Invalid or duplicate signal name')
  const gateMap = new Map(netlist.gates.map(g => [g.id, g]))
  const memo = new Map<string, number>()
  const active = new Set<string>()
  function read(id: string): number {
    if (memo.has(id)) return memo.get(id)!
    if (netlist.inputs.includes(id)) {
      const bit = values[id]
      if (bit !== 0 && bit !== 1) throw new Error(`Missing or invalid input bit: ${id}`)
      memo.set(id, bit); return bit
    }
    const gate = gateMap.get(id)
    if (!gate) throw new Error(`Unknown signal: ${id}`)
    if (active.has(id)) throw new Error(`Combinational cycle at ${id}`)
    active.add(id)
    try {
      const result = gateOp(gate.op, gate.args.map(read))
      memo.set(id, result)
      return result
    } finally { active.delete(id) }
  }
  const output: Record<string, number> = {}
  for (const id of netlist.outputs) output[id] = read(id)
  return output
}

export function netlistTruthTable(netlist: Netlist) {
  if (netlist.inputs.length > 8) throw new Error('Truth table limited to eight inputs')
  const rows = []
  for (let n = 0; n < 2 ** netlist.inputs.length; n++) {
    const inputs: Record<string, number> = {}
    netlist.inputs.forEach((name, index) => inputs[name] = (n >> (netlist.inputs.length - index - 1)) & 1)
    rows.push({ inputs, outputs: evaluateNetlist(netlist, inputs) })
  }
  return { inputs: netlist.inputs, outputs: netlist.outputs, rows }
}

export function fullAdder(a: number, b: number, carryIn: number) {
  if (![a, b, carryIn].every(bit => bit === 0 || bit === 1)) throw new Error('Inputs must be bits')
  const total = a + b + carryIn
  return { sum: total & 1, carryOut: total >> 1 }
}
