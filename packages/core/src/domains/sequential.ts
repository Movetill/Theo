/** Discrete rising-edge models for teaching: no propagation-delay simulation. */
export type FlipFlop = 'D' | 'T' | 'JK'
export type FFInput = { d?: number; t?: number; j?: number; k?: number; reset?: boolean }
const bit = (v: unknown) => v === 0 || v === 1

export function traceFlipFlop(type: FlipFlop, samples: FFInput[], initial = 0) {
  if (!['D', 'T', 'JK'].includes(type) || !bit(initial)) throw new Error('Invalid flip-flop configuration')
  if (!Array.isArray(samples) || samples.length > 512) throw new Error('Expected at most 512 cycles')
  let q = initial
  return samples.map((input, cycle) => {
    const before = q
    if (input.reset === true) q = 0 // synchronous, active-high reset
    else if (type === 'D') {
      if (!bit(input.d)) throw new Error(`D must be a bit at cycle ${cycle}`)
      q = input.d!
    } else if (type === 'T') {
      if (!bit(input.t)) throw new Error(`T must be a bit at cycle ${cycle}`)
      q = q ^ input.t!
    } else {
      if (!bit(input.j) || !bit(input.k)) throw new Error(`J/K must be bits at cycle ${cycle}`)
      if (input.j === 1 && input.k === 1) q = 1 - q
      else if (input.j === 1) q = 1
      else if (input.k === 1) q = 0
    }
    return { cycle, risingEdge: cycle + 1, input, before, after: q }
  })
}

export interface FSMTransition { from: string; input: string; to: string; output?: string }
export interface FSMSpec {
  states: string[]
  initial: string
  kind: 'moore' | 'mealy'
  outputs?: Record<string, string> // Moore outputs of states
  transitions: FSMTransition[]
}
export function traceFSM(spec: FSMSpec, inputSequence: string[]) {
  if (!Array.isArray(spec.states) || !spec.states.length || spec.states.length > 64 || new Set(spec.states).size !== spec.states.length) throw new Error('Invalid states')
  if (!spec.states.includes(spec.initial) || !['moore', 'mealy'].includes(spec.kind)) throw new Error('Invalid initial/mode')
  if (!Array.isArray(spec.transitions) || spec.transitions.length > 1024 || !Array.isArray(inputSequence) || inputSequence.length > 512) throw new Error('Sequence too large')
  const lookup = new Map<string, FSMTransition>()
  for (const t of spec.transitions) {
    if (!spec.states.includes(t.from) || !spec.states.includes(t.to)) throw new Error('Unknown state in transition')
    const key = JSON.stringify([t.from, t.input])
    if (lookup.has(key)) throw new Error('Nondeterministic FSM transitions')
    lookup.set(key, t)
  }
  if (spec.kind === 'moore' && spec.states.some(s => spec.outputs?.[s] === undefined)) throw new Error('Every Moore state needs an output')
  let state = spec.initial
  return inputSequence.map((input, cycle) => {
    const t = lookup.get(JSON.stringify([state, input]))
    if (!t) throw new Error(`Missing transition from ${state} on ${input}`)
    const before = state
    state = t.to
    // A Mealy output is computed for each input+current-state pair before the edge.
    // A Moore output is associated with the state occupied after the edge.
    const output = spec.kind === 'mealy' ? t.output : spec.outputs![state]
    if (output === undefined) throw new Error('Missing Mealy transition output')
    return { cycle, input, before, after: state, output }
  })
}
