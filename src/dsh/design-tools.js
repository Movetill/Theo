import { CoreError } from '../../packages/core/dist/index.js'

const output = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}

function parameter(type, description, required) {
  return required ? { type, required: true, description } : { type, description }
}
const str = (description, required = true) => parameter('string', description, required)
const num = (description, required = true) => parameter('number', description, required)
const designId = str('Generated Theo design ID returned by create_design.')
const revision = num('Exact saved revision.')
const paging = {
  start: num('Zero-based offset, default 0.', false),
  limit: num('Maximum entries, 1–32, default 8.', false),
}
const simulation = {
  design_id: designId, revision,
  stimuli_json: str('JSON array of {cycle, clockEvent:"rising", inputs:{portId:"binary"}}. Cycles start at 0 and are consecutive.'),
  initial_registers_json: str('Optional JSON object of all register IDs to exact-width initial bit strings.', false),
}

export function registerDesignTools(registry, defineTool, service) {
  function add(suffix, description, parameters, execute) {
    const name = `theo_${suffix}`
    registry.register(defineTool({
      name, description, parameters, output,
      async execute(args) {
        try {
          const result = await execute(args)
          const verification = result.verification
          if (verification && verification.status !== 'passed') {
            const error = verification.diagnostics[0] ?? {
              code: 'VERIFICATION_FAILED', message: 'Behavior differs from the reference model', path: '$.verification',
            }
            return JSON.stringify({ ok: false, tool: name, error, ...result })
          }
          return JSON.stringify({ ok: true, tool: name, ...result })
        } catch (cause) {
          let error
          if (cause instanceof CoreError) error = cause.toJSON()
          else if (typeof cause?.syscall === 'string') error = { code: 'WORKSPACE_IO', message: 'Theo workspace operation failed', path: '$.workspace' }
          else error = { code: 'INTERNAL_ERROR', message: 'Theo tool could not complete the request', path: '$' }
          return JSON.stringify({ ok: false, tool: name, error })
        }
      },
    }))
  }

  add('create_design', 'Validate and persist a DigitalDesign or create the counter4-decoder template.', {
    design_json: str('Complete DigitalDesign JSON. Supply this or template.', false),
    template: str('Built-in template: counter4-decoder. Supply this or design_json.', false),
  }, service.create)
  add('get_design', 'Read a design summary or a page of an IR section.', {
    design_id: designId, revision: num('Saved revision. Defaults to latest.', false),
    section: str('Optional section: ports, clocks, nodes, outputBindings.', false), ...paging,
  }, service.get)
  add('update_design', 'Save a full design as its next revision if expected_revision is still current.', {
    design_id: designId, expected_revision: num('Current revision of the design being edited.'),
    design_json: str('Complete edited DigitalDesign JSON with its original ID and expected revision.'),
  }, service.update)
  add('validate_design', 'Check the structure of an exact saved DigitalDesign revision.', {
    design_id: designId, revision,
  }, service.validate)
  add('simulate_design', 'Simulate a saved revision over rising-edge stimuli and save its trace.', simulation, service.simulate)
  add('verify_design', 'Check the behavior of a saved revision against the independent counter4-decoder reference.', {
    ...simulation, reference: str('Reference name: counter4-decoder.'),
  }, service.verify)
  add('get_trace', 'Read a page of an existing simulation trace.', {
    run_id: str('Run ID returned by simulate_design.'), ...paging,
  }, service.trace)
}
