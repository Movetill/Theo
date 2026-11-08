/** Adapter smoke test with a stub registry; not a live DSH integration test. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
test('Cordis tool adapter keeps all 12 legacy tools callable (stubbed registry)', async () => {
  const code = await readFile(path.join(root, 'index.js'), 'utf8')
  const transformed = code.replace("import { defineTool } from '@deepseek-ai/dsh-tools'", 'const defineTool = definition => definition')
  assert.notEqual(transformed, code, 'stub should replace host package import')
  const temp = path.join(root, `.theo-adapter-test-${process.pid}.mjs`)
  await writeFile(temp, transformed)
  try {
    const adapter = await import(pathToFileURL(temp).href)
    assert.equal(adapter.inject[0], 'tools')
    const registry = []
    adapter.apply({ tools: { register: tool => registry.push(tool) } })
    assert.deepEqual(registry.slice(0, 12).map(tool => tool.name), [
      'theo_gray_to_bcd', 'theo_truth_table', 'theo_simplify', 'theo_check_equivalence',
      'theo_radix_convert', 'theo_signed_encode', 'theo_combinational', 'theo_flipflop_trace',
      'theo_fsm_trace', 'theo_memory_trace', 'theo_pla_truth_table', 'theo_hdl_example',
    ])
    const get = name => registry.find(x => x.name === name)
    assert.match(await get('theo_gray_to_bcd').execute({ gray: '1101' }), /8421 BCD: 1001/)
    assert.match(await get('theo_truth_table').execute({ expression: 'A' }), /\| 1 \| 1 \|/)
    assert.match(await get('theo_check_equivalence').execute({ left: "A'B+AB", right: 'B' }), /Equivalent: yes/)
    await assert.rejects(get('theo_gray_to_bcd').execute({ gray: '102' }), /Gray/)
    await assert.rejects(get('theo_combinational').execute({ mode: 'netlist', netlist_json: '{' }), /valid JSON/)
    assert.match(await get('theo_simplify').execute({ expression: "A'B+AB" }), /Minimized SOP: B/)
    assert.match(await get('theo_radix_convert').execute({value:'FF',from_base:16,to_base:10}), /"output": "255"/)
    assert.match(await get('theo_signed_encode').execute({value:-5,width:8,encoding:'twos-complement'}), /11111011/)
    assert.match(await get('theo_combinational').execute({mode:'full_adder',a:1,b:1,carry_in:1}), /"carryOut": 1/)
    assert.match(await get('theo_flipflop_trace').execute({kind:'D',samples_json:'[{"d":1}]'}), /"after": 1/)
    assert.match(await get('theo_fsm_trace').execute({spec_json:JSON.stringify({states:['S'],initial:'S',kind:'moore',outputs:{S:'1'},transitions:[{from:'S',input:'go',to:'S'}]}),inputs_json:'["go"]'}), /"output": "1"/)
    assert.match(await get('theo_memory_trace').execute({spec_json:'{"kind":"ROM","addressBits":2,"dataBits":8,"initial":{"0":7},"operations":[{"kind":"read","address":0}]}' }), /"value": 7/)
    assert.match(await get('theo_pla_truth_table').execute({spec_json:'{"inputs":["A"],"outputs":["Y"],"terms":[{"cube":"1","drives":[0]}]}'}), /"outputBits": "1"/)
    assert.match(await get('theo_hdl_example').execute({kind:'mux2'}), /module theo_example/)
  } finally {
    await unlink(temp).catch(() => {})
  }
})
