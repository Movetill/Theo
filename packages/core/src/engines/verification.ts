import { CoreError, type Diagnostic } from '../foundation/errors.js'
import { requireDataArray, requireDataObject, requireFields } from '../ir/validate.js'
import { readBitFrame, writeBitFrame } from './combinational.js'
import { simulate, type SimulationStep, type SimulationTrace } from './simulation.js'

type ReferenceInput = Pick<SimulationStep, 'cycle' | 'inputs' | 'stateBefore'>
type ReferenceOutput = Pick<SimulationStep, 'stateAfter' | 'outputsBeforeEdge' | 'outputsAfterEdge'>

export interface ReferenceModel {
  property: string
  assumptions: string[]
  step(input: ReferenceInput): ReferenceOutput
}

export interface VerificationResult {
  status: 'passed' | 'failed' | 'unsupported' | 'error'
  engine: 'truth-table-exhaustive' | 'theo-two-state-simulator' | 'reference-model' | 'external-rtl-simulator'
  designId?: string
  designRevision?: number
  property: string
  assumptions: string[]
  checkedCases?: number
  counterexample?: ReferenceInput & {
    field: keyof ReferenceOutput
    signal: string
    expected: string
    actual: string
  }
  diagnostics: Diagnostic[]
}

const fields = ['stateAfter', 'outputsBeforeEdge', 'outputsAfterEdge'] as const

function readReference(value: unknown): ReferenceModel {
  const reference = requireDataObject(value, '$.reference')
  requireFields(reference, ['property', 'assumptions', 'step'], [], '$.reference')
  if (typeof reference.property !== 'string' || !reference.property.trim()) {
    throw new CoreError('INVALID_SCHEMA', 'Expected a property description', '$.reference.property')
  }
  const assumptions = requireDataArray(reference.assumptions, 128, '$.reference.assumptions').map((value, index) => {
    if (typeof value !== 'string') throw new CoreError('INVALID_SCHEMA', 'Expected an assumption string', `$.reference.assumptions[${index}]`)
    return value
  })
  if (typeof reference.step !== 'function') throw new CoreError('INVALID_SCHEMA', 'Expected a reference step function', '$.reference.step')
  return { property: reference.property, assumptions, step: reference.step as ReferenceModel['step'] }
}

/** Compare against a trusted local reference function. Reference code is never read from the IR or request. */
export function verifyAgainstReference(candidate: unknown, request: unknown, reference: ReferenceModel): VerificationResult {
  const result: VerificationResult = {
    status: 'error', engine: 'reference-model', property: '', assumptions: [], checkedCases: 0, diagnostics: [],
  }
  let model: ReferenceModel
  let trace: SimulationTrace
  try {
    model = readReference(reference)
    result.property = model.property
    result.assumptions = model.assumptions
    trace = simulate(candidate, request)
  } catch (error) {
    if (!(error instanceof CoreError)) throw error
    if (error.code === 'UNSUPPORTED_SEMANTICS' || error.code === 'UNSUPPORTED_CLOCKING') result.status = 'unsupported'
    result.diagnostics.push(error.toJSON())
    return result
  }

  result.designId = trace.designId
  result.designRevision = trace.designRevision
  let referenceState = trace.steps[0].stateBefore
  for (const step of trace.steps) {
    const input: ReferenceInput = { cycle: step.cycle, inputs: step.inputs, stateBefore: referenceState }
    const referenceInput = structuredClone(input)
    let referenceOutput: unknown
    try {
      referenceOutput = model.step(referenceInput)
    } catch {
      const diagnostic = new CoreError('REFERENCE_ERROR', 'Reference step threw an error', '$.reference.step')
      result.diagnostics.push(diagnostic.toJSON())
      return result
    }
    try {
      const expected = requireDataObject(referenceOutput, '$.reference.result')
      requireFields(expected, [...fields], [], '$.reference.result')
      const frames = fields.map(field => {
        const layout = Object.entries(step[field]).map(([id, bits]) => ({ id, width: bits.length }))
        const values = readBitFrame(expected[field], layout, `$.reference.result.${field}`)
        return writeBitFrame(layout, id => values.get(id)!)
      })
      result.checkedCases = step.cycle + 1
      for (const [index, field] of fields.entries()) {
        for (const [signal, actual] of Object.entries(step[field])) {
          const wanted = frames[index][signal]
          if (actual !== wanted) {
            result.status = 'failed'
            result.counterexample = { ...input, field, signal, expected: wanted, actual }
            return result
          }
        }
      }
      referenceState = frames[0]
    } catch (error) {
      if (!(error instanceof CoreError)) throw error
      result.diagnostics.push(error.toJSON())
      return result
    }
  }
  result.status = 'passed'
  return result
}
