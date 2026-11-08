/** PLA: shared product terms with multiple OR-plane outputs. */
export type ProductTerm = { cube: string; drives: number[] }
export interface PLASpec { inputs: string[]; outputs: string[]; terms: ProductTerm[] }
export function plaTruthTable(spec: PLASpec) {
  if (!Array.isArray(spec.inputs) || !Array.isArray(spec.outputs) || !Array.isArray(spec.terms)) throw new Error('Invalid PLA spec')
  if (spec.inputs.length > 8 || spec.outputs.length > 8 || spec.inputs.length === 0 || spec.outputs.length === 0 || spec.terms.length > 256) throw new Error('PLA size out of range')
  if (new Set([...spec.inputs, ...spec.outputs]).size !== spec.inputs.length + spec.outputs.length) throw new Error('Duplicate PLA identifiers')
  for (const term of spec.terms) {
    if (term.cube.length !== spec.inputs.length || !/^[01-]+$/.test(term.cube)) throw new Error('Invalid cube, use 0/1/-')
    if (!Array.isArray(term.drives) || term.drives.some(j => !Number.isInteger(j) || j < 0 || j >= spec.outputs.length)) throw new Error('Invalid output index')
  }
  const rows = []
  for (let n = 0; n < 2 ** spec.inputs.length; n++) {
    const inputBits = n.toString(2).padStart(spec.inputs.length, '0')
    const bits = new Array(spec.outputs.length).fill(0)
    spec.terms.forEach(term => {
      if ([...term.cube].every((c, i) => c === '-' || c === inputBits[i])) term.drives.forEach(j => bits[j] = 1)
    })
    rows.push({ inputBits, outputBits: bits.join('') })
  }
  return { inputs: spec.inputs, outputs: spec.outputs, terms: spec.terms, rows }
}
