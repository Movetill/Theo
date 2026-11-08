import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { DesignStore } from '../packages/workspace/index.js'

const candidate = async () => JSON.parse(await readFile(new URL('../examples/counter4-decoder/design.json', import.meta.url), 'utf8'))
const frames = [
  { cycle: 0, clockEvent: 'rising', inputs: { enable: '1', reset: '0' } },
  { cycle: 1, clockEvent: 'rising', inputs: { enable: '1', reset: '1' } },
]

async function harness(t) {
  const temp = await mkdtemp(join(tmpdir(), 'theo-tools-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const module = new URL(`../.theo-adapter-test-m4-${randomUUID()}.mjs`, import.meta.url)
  const code = await readFile(new URL('../index.js', import.meta.url), 'utf8')
  const transformed = code.replace("import { defineTool } from '@deepseek-ai/dsh-tools'", 'const defineTool = value => value')
  assert.notEqual(code, transformed)
  await writeFile(module, transformed)
  t.after(() => rm(module, { force: true }))
  const { apply } = await import(module.href)
  const root = join(temp, 'workspace')
  function connect() {
    const tools = new Map()
    apply({ tools: { register(tool) {
      assert.ok(!tools.has(tool.name))
      for (const parameter of Object.values(tool.parameters)) {
        assert.ok(!Object.hasOwn(parameter, 'required') || parameter.required === true)
      }
      tools.set(tool.name, tool)
    } } }, { workspaceRoot: root })
    assert.equal(tools.size, 19)
    return async (name, args) => {
      const tool = tools.get(`theo_${name}`)
      const value = await tool.execute(args)
      assert.deepEqual(tool.output.render(args, value), [{ type: 'text', text: value }])
      const result = JSON.parse(value)
      assert.equal(result.tool, tool.name)
      return result
    }
  }
  return { connect, root, temp }
}

test('M4 adapter creates, inspects, validates, simulates and verifies a design across connections', async t => {
  const { connect, root } = await harness(t)
  const first = connect()
  const created = await first('create_design', { template: 'counter4-decoder' })
  assert.equal(created.ok, true)
  const design_id = created.designId
  const revision = created.revision
  assert.equal(revision, 1)
  const second = connect()
  const result = await second('get_design', { design_id, section: 'nodes', limit: 1 })
  assert.equal(result.ok, true)
  assert.equal(result.page.items.length, 1)
  assert.equal(result.page.nextStart, 1)
  const validated = await second('validate_design', { design_id, revision })
  assert.equal(validated.ok, true)
  assert.equal(validated.valid, true)

  const args = { design_id, revision, stimuli_json: JSON.stringify(frames), initial_registers_json: '{"counter":"1000"}' }
  const simulation = await second('simulate_design', args)
  assert.equal(simulation.ok, true)
  assert.deepEqual(simulation.summary, { cyclesExecuted: 2, traceAvailable: true })
  const third = connect()
  const trace = await third('get_trace', { run_id: simulation.runId, limit: 1 })
  assert.equal(trace.ok, true)
  assert.equal(trace.designId, design_id)
  assert.equal(trace.revision, 1)
  assert.equal(trace.page.nextStart, 1)
  assert.deepEqual(trace.page.items[0].outputsAfterEdge, { count: '1001', is_nine: '1' })
  const later = await third('get_trace', { run_id: simulation.runId, start: 1, limit: 1 })
  assert.deepEqual(later.page.items[0].outputsAfterEdge, { count: '0000', is_nine: '0' })
  assert.equal(later.page.nextStart, null)
  const verified = await third('verify_design', { ...args, reference: 'counter4-decoder' })
  assert.equal(verified.ok, true)
  assert.equal(verified.verification.checkedCases, 2)
  assert.equal(verified.verification.status, 'passed')

  const draft = await new DesignStore(root).get(design_id)
  draft.nodes.find(n => n.id === 'nine').params.bits = '1010'
  const update = { design_id, expected_revision: 1, design_json: JSON.stringify(draft) }
  assert.equal((await third('update_design', update)).revision, 2)
  assert.equal((await third('update_design', update)).error.code, 'REVISION_CONFLICT')
  const mismatch = await third('verify_design', { ...args, revision: 2, reference: 'counter4-decoder' })
  assert.equal(mismatch.ok, false)
  assert.equal(mismatch.error.code, 'VERIFICATION_FAILED')
  assert.equal(mismatch.verification.counterexample.signal, 'is_nine')
  assert.equal((await third('verify_design', { ...args, reference: 'counter4-decoder' })).ok, true)
})

test('M4 adapter returns structured errors for invalid data and does not claim failed runs were saved', async t => {
  const { connect, root, temp } = await harness(t)
  const call = connect()
  const bad = await call('create_design', { design_json: '{' })
  assert.equal(bad.ok, false)
  assert.equal(bad.error.code, 'INVALID_JSON')
  const invalidDesign = await candidate()
  invalidDesign.ports.find(port => port.id === 'count').width = 8
  const invalid = await call('create_design', { design_json: JSON.stringify(invalidDesign) })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'WIDTH_MISMATCH')
  const { designId } = await call('create_design', { design_json: JSON.stringify(await candidate()) })
  const args = { design_id: designId, revision: 1, stimuli_json: JSON.stringify(frames) }
  assert.equal((await call('validate_design', { ...args, revision: 2 })).error.code, 'NOT_FOUND')
  assert.equal((await call('validate_design', { design_id: designId })).error.code, 'INVALID_SCHEMA')
  assert.equal((await call('get_design', { design_id: '../outside' })).error.code, 'INVALID_SCHEMA')
  const unsupported = await call('verify_design', { ...args, reference: 'unknown' })
  assert.equal(unsupported.ok, false)
  assert.equal(unsupported.verification.status, 'unsupported')
  await symlink(temp, join(root, 'runs'), 'dir')
  const failed = await call('simulate_design', args)
  assert.equal(failed.ok, false)
  assert.equal(failed.error.code, 'UNSAFE_WORKSPACE_PATH')
  assert.equal(failed.runId, undefined)
  assert.deepEqual(await readdir(temp), ['workspace'])
})
