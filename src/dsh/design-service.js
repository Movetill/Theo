import { readFile } from 'node:fs/promises'
import { CoreError, simulate, verifyAgainstReference } from '../../packages/core/dist/index.js'
import { counterReference } from '../../examples/counter4-decoder/reference.mjs'

const counterTemplate = new URL('../../examples/counter4-decoder/design.json', import.meta.url)
const sections = ['ports', 'clocks', 'nodes', 'outputBindings']

function parseJson(json, field, maxBytes = 1024 ** 2) {
  if (typeof json !== 'string') throw new CoreError('INVALID_SCHEMA', 'Expected a JSON string', `$.${field}`)
  if (Buffer.byteLength(json) > maxBytes) throw new CoreError('RESOURCE_LIMIT', 'JSON argument exceeds size limit', `$.${field}`)
  try { return JSON.parse(json) }
  catch { throw new CoreError('INVALID_JSON', 'Malformed JSON argument', `$.${field}`) }
}

function summarize(design) {
  const { id, revision, name, schemaVersion, metadata } = design
  return {
    designId: id, revision, name, schemaVersion, metadata,
    counts: Object.fromEntries(sections.map(key => [key, Object.keys(design[key]).length])),
  }
}

function page(items, start = 0, limit = 8) {
  if (!Number.isSafeInteger(start) || start < 0 || start > items.length) {
    throw new CoreError('INVALID_SCHEMA', 'start must be a valid zero-based offset', '$.start')
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32) {
    throw new CoreError('INVALID_SCHEMA', 'limit must be an integer from 1 to 32', '$.limit')
  }
  const output = []
  let bytes = 2
  for (const item of items.slice(start, start + limit)) {
    const size = Buffer.byteLength(JSON.stringify(item)) + (output.length ? 1 : 0)
    if (bytes + size > 24 * 1024) {
      if (!output.length) throw new CoreError('RESOURCE_LIMIT', 'A single item exceeds the tool page budget', '$.start')
      break
    }
    bytes += size
    output.push(item)
  }
  const next = start + output.length
  return { start, total: items.length, nextStart: next < items.length ? next : null, items: output }
}

function requireRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new CoreError('INVALID_SCHEMA', 'Expected a positive safe integer revision', '$.revision')
  }
}

function simulationRequest(design, { stimuli_json, initial_registers_json }) {
  const request = {
    designId: design.id,
    revision: design.revision,
    stimuli: parseJson(stimuli_json, 'stimuli_json', 4 * 1024 ** 2),
  }
  if (initial_registers_json !== undefined) request.initialRegisters = parseJson(initial_registers_json, 'initial_registers_json')
  return request
}

function matchesCounterPorts(design) {
  const expected = [
    ['reset', 'input', 1], ['enable', 'input', 1],
    ['count', 'output', 4], ['is_nine', 'output', 1],
  ]
  const registers = design.nodes.filter(node => node.kind === 'REGISTER')
  return design.ports.length === expected.length && expected.every(([id, direction, width]) =>
    design.ports.some(port => port.id === id && port.direction === direction && port.width === width && !port.signed))
    && registers.length === 1 && registers[0].id === 'counter' && registers[0].params.width === 4 && !registers[0].params.signed
}

export function createDesignService(store) {
  return {
    async create({ design_json, template }) {
      if ((design_json === undefined) === (template === undefined)) {
        throw new CoreError('INVALID_SCHEMA', 'Supply exactly one of design_json and template', '$.design')
      }
      if (template !== undefined && template !== 'counter4-decoder') {
        throw new CoreError('UNSUPPORTED_SEMANTICS', 'Unknown design template', '$.template')
      }
      const candidate = template === undefined ? parseJson(design_json, 'design_json') : JSON.parse(await readFile(counterTemplate, 'utf8'))
      const { id, revision } = await store.create(candidate)
      return summarize({ ...candidate, id, revision })
    },

    async get({ design_id, revision, section, start, limit }) {
      const design = await store.get(design_id, revision)
      if (section === undefined) {
        if (start !== undefined || limit !== undefined) throw new CoreError('INVALID_SCHEMA', 'Pagination requires a design section', '$.section')
        return summarize(design)
      }
      if (!sections.includes(section)) throw new CoreError('INVALID_SCHEMA', 'Unknown design section', '$.section')
      const items = section === 'outputBindings'
        ? Object.entries(design.outputBindings).map(([id, source]) => ({ id, source }))
        : design[section]
      return { ...summarize(design), section, page: page(items, start, limit) }
    },

    async update({ design_id, expected_revision, design_json }) {
      const { revision } = await store.update(design_id, expected_revision, parseJson(design_json, 'design_json'))
      return { designId: design_id, revision }
    },

    async validate({ design_id, revision }) {
      requireRevision(revision)
      const design = await store.get(design_id, revision)
      return { designId: design.id, revision: design.revision, valid: true, diagnostics: [] }
    },

    async simulate(args) {
      requireRevision(args.revision)
      const design = await store.get(args.design_id, args.revision)
      const trace = simulate(design, simulationRequest(design, args))
      const runId = await store.saveRun(trace)
      return {
        designId: trace.designId, revision: trace.designRevision, runId, semantics: trace.semantics,
        summary: { cyclesExecuted: trace.steps.length, traceAvailable: true }, warnings: trace.warnings,
      }
    },

    async verify(args) {
      requireRevision(args.revision)
      const design = await store.get(args.design_id, args.revision)
      const request = simulationRequest(design, args)
      if (args.reference !== 'counter4-decoder' || !matchesCounterPorts(design)) {
        const error = new CoreError('UNSUPPORTED_SEMANTICS', 'Reference requires the counter4-decoder signal layout', '$.reference').toJSON()
        return { verification: {
          status: 'unsupported', engine: 'reference-model', designId: design.id, designRevision: design.revision,
          property: counterReference.property, assumptions: counterReference.assumptions, checkedCases: 0, diagnostics: [error],
        } }
      }
      return { verification: verifyAgainstReference(design, request, counterReference) }
    },

    async trace({ run_id, start, limit }) {
      const trace = await store.getRun(run_id)
      return {
        runId: run_id, designId: trace.designId, revision: trace.designRevision,
        semantics: trace.semantics, page: page(trace.steps, start, limit),
      }
    },
  }
}
