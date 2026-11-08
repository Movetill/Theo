import { CoreError } from '../foundation/errors.js'
import { prepareDesign, requireDataArray, requireDataObject, requireFields } from '../ir/validate.js'
import { evaluateSignals, readBitFrame, writeBitFrame } from './combinational.js'

type BitFrame = Record<string, string>

export interface StimulusFrame {
  cycle: number
  inputs: BitFrame
  clockEvent: 'rising'
}

export interface SimulationRequest {
  designId: string
  revision: number
  initialRegisters?: BitFrame
  stimuli: StimulusFrame[]
}

export interface SimulationStep {
  cycle: number
  inputs: BitFrame
  stateBefore: BitFrame
  outputsBeforeEdge: BitFrame
  nextState: BitFrame
  stateAfter: BitFrame
  outputsAfterEdge: BitFrame
}

export interface SimulationTrace {
  designId: string
  designRevision: number
  semantics: 'two-state-synchronous-rising-edge-v1'
  steps: SimulationStep[]
  warnings: string[]
}

const LIMITS = { cycles: 10_000, requestBytes: 4 * 1024 ** 2, traceBytes: 8 * 1024 ** 2, timeMs: 5_000 }

export function simulate(candidate: unknown, request: unknown): SimulationTrace {
  const start = performance.now()
  const { design, nodeOrder } = prepareDesign(candidate)
  const spec = requireDataObject(request, '$.request')
  requireFields(spec, ['designId', 'revision', 'stimuli'], ['initialRegisters'], '$.request')
  if (spec.designId !== design.id) throw new CoreError('INVALID_SCHEMA', 'Request designId must match the design', '$.request.designId')
  if (spec.revision !== design.revision) throw new CoreError('INVALID_SCHEMA', 'Request revision must match the design', '$.request.revision')
  const stimuli = requireDataArray(spec.stimuli, LIMITS.cycles, '$.request.stimuli')
  if (!stimuli.length) throw new CoreError('INVALID_SCHEMA', 'Expected at least one stimulus frame', '$.request.stimuli')

  const inputPorts = design.ports.filter(port => port.direction === 'input')
  const outputPorts = design.ports.filter(port => port.direction === 'output')
  const registers = design.nodes.filter(node => node.kind === 'REGISTER')
  const stateFields = registers.map(({ id, params }) => ({ id, width: params.width, signed: params.signed }))
  const overrides = Object.hasOwn(spec, 'initialRegisters')
  let state = overrides
    ? readBitFrame(spec.initialRegisters, stateFields, '$.request.initialRegisters')
    : new Map(registers.map(({ id, params }) => [id, BigInt(`0b${params.initialValue}`)]))
  const writeState = (snapshot: ReadonlyMap<string, bigint>) => writeBitFrame(stateFields, id => snapshot.get(id)!)
  const writeOutputs = (values: ReadonlyMap<string, bigint>) =>
    writeBitFrame(outputPorts, id => values.get(design.outputBindings[id].nodeId)!)

  const trace: SimulationTrace = {
    designId: design.id, designRevision: design.revision,
    semantics: 'two-state-synchronous-rising-edge-v1', steps: [], warnings: [],
  }
  // Validated identifiers and binary values are ASCII, so compact JSON length is its UTF-8 byte count.
  const requestHeader: SimulationRequest = { designId: design.id, revision: design.revision, stimuli: [] }
  if (overrides) requestHeader.initialRegisters = writeState(state)
  let requestBytes = JSON.stringify(requestHeader).length
  let traceBytes = JSON.stringify(trace).length

  for (let cycle = 0; cycle < stimuli.length; cycle++) {
    const path = `$.request.stimuli[${cycle}]`
    if (performance.now() - start >= LIMITS.timeMs) throw new CoreError('RESOURCE_LIMIT', 'Simulation exceeded its time budget', path)
    const frame = requireDataObject(stimuli[cycle], path)
    requireFields(frame, ['cycle', 'inputs', 'clockEvent'], [], path)
    if (frame.cycle !== cycle) throw new CoreError('INVALID_SCHEMA', 'Cycles must be consecutive, starting at zero', `${path}.cycle`)
    if (frame.clockEvent !== 'rising') throw new CoreError('UNSUPPORTED_CLOCKING', 'Only rising edges are supported', `${path}.clockEvent`)
    const values = readBitFrame(frame.inputs, inputPorts, `${path}.inputs`)
    const inputs = writeBitFrame(inputPorts, id => values.get(id)!)
    const stimulus: StimulusFrame = { cycle, inputs, clockEvent: 'rising' }
    requestBytes += JSON.stringify(stimulus).length + (cycle > 0 ? 1 : 0)
    if (requestBytes > LIMITS.requestBytes) throw new CoreError('RESOURCE_LIMIT', 'Stimulus request exceeds 4 MiB', path)

    const before = evaluateSignals(design, nodeOrder, values, state)
    // Each D and reset comes from the same pre-edge snapshot. Commit only after every sample is computed.
    const next = new Map<string, bigint>()
    for (const { id, params, inputBindings } of registers) {
      const reset = before.get(inputBindings.reset.nodeId) === 1n
      next.set(id, reset ? BigInt(`0b${params.resetValue}`) : before.get(inputBindings.d.nodeId)!)
    }
    const after = evaluateSignals(design, nodeOrder, values, next)
    const nextState = writeState(next)
    const step: SimulationStep = {
      cycle, inputs, stateBefore: writeState(state), outputsBeforeEdge: writeOutputs(before),
      nextState, stateAfter: { ...nextState }, outputsAfterEdge: writeOutputs(after),
    }
    traceBytes += JSON.stringify(step).length + (cycle > 0 ? 1 : 0)
    if (traceBytes > LIMITS.traceBytes) throw new CoreError('RESOURCE_LIMIT', 'Simulation trace exceeds 8 MiB', `$.trace.steps[${cycle}]`)
    if (performance.now() - start >= LIMITS.timeMs) throw new CoreError('RESOURCE_LIMIT', 'Simulation exceeded its time budget', path)
    trace.steps.push(step)
    state = next
  }
  return trace
}
