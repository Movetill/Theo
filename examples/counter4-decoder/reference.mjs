// Independent behavioral reference for the example's four-bit counter.
export const counterReference = {
  property: 'Count modulo 16 with synchronous reset priority, and decode count == 9',
  assumptions: ['Two-state inputs', 'One rising edge per stimulus', 'Stable inputs through each edge'],
  step({ inputs, stateBefore }) {
    const count = Number.parseInt(stateBefore.counter, 2)
    let next = count
    if (inputs.reset === '1') next = 0
    else if (inputs.enable === '1') next = (count + 1) % 16
    const binary = n => n.toString(2).padStart(4, '0')
    const outputs = n => ({ count: binary(n), is_nine: n === 9 ? '1' : '0' })
    return {
      stateAfter: { counter: binary(next) },
      outputsBeforeEdge: outputs(count),
      outputsAfterEdge: outputs(next),
    }
  },
}
