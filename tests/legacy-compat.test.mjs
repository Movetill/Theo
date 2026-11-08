/** Frozen outputs captured from Theo-v0.2-source-Windows.zip, SHA-256
 * f69ac0e012ed851a3b4b1ef9464b7c4b35277f1315f3f0ae59b0ecf1896b4ce1.
 * CI needs no original ZIP, DSH install or model connection.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import * as core from '../packages/core/dist/index.js'
import * as legacy from '../dist/logic-core/index.js'

const coreCases = [
  {"name": "grayToBcd","args": ["11110"],"expected": {"gray": "11110","binary": "10100","decimal": "20","bcd": "0010 0000"}},
  {"name": "parseExpression","args": ["A'B+AC"],"expected": {"kind": "or","left": {"kind": "and","left": {"kind": "not","child": {"kind": "var","name": "A"}},"right": {"kind": "var","name": "B"}},"right": {"kind": "and","left": {"kind": "var","name": "A"},"right": {"kind": "var","name": "C"}}}},
  {"name": "variables","args": [{"kind": "or","left": {"kind": "var","name": "B"},"right": {"kind": "var","name": "A"}}],"expected": ["A","B"]},
  {"name": "evaluate","args": [{"kind": "xor","left": {"kind": "var","name": "A"},"right": {"kind": "var","name": "B"}},{"A": true,"B": false}],"expected": true},
  {"name": "assignment","args": [["A","B"],2],"expected": {"A": true,"B": false}},
  {"name": "truthTable","args": ["A'B+AC"],"expected": {"expression": "A'B+AC","variables": ["A","B","C"],"rows": [{"input": "000","output": 0},{"input": "001","output": 0},{"input": "010","output": 1},{"input": "011","output": 1},{"input": "100","output": 0},{"input": "101","output": 1},{"input": "110","output": 0},{"input": "111","output": 1}]}},
  {"name": "checkEquivalence","args": ["A+B","A&B"],"expected": {"equivalent": false,"variables": ["A","B"],"counterexample": {"A": 0,"B": 1},"leftValue": 1,"rightValue": 0}},
  {"name": "simplifyExpression","args": ["A&B",[1]],"expected": {"original": "A&B","minimized": "B","variables": ["A","B"],"minterms": [3],"dontCares": [1],"verified": true}},
  {"name": "convertRadix","args": ["FFFFFFFFFFFFFFFF",16,10],"expected": {"input": "FFFFFFFFFFFFFFFF","fromBase": 16,"toBase": 10,"output": "18446744073709551615","decimal": "18446744073709551615"}},
  {"name": "encodeSigned","args": [-5,8,"ones-complement"],"expected": {"value": -5,"width": 8,"encoding": "ones-complement","bits": "11111010","range": ["-127","127"]}},
  {"name": "evaluateNetlist","args": [{"inputs": ["A","B"],"gates": [{"id": "Y","op": "XOR","args": ["A","B"]}],"outputs": ["Y"]},{"A": 1,"B": 0}],"expected": {"Y": 1}},
  {"name": "netlistTruthTable","args": [{"inputs": ["A","B"],"gates": [{"id": "Y","op": "XOR","args": ["A","B"]}],"outputs": ["Y"]}],"expected": {"inputs": ["A","B"],"outputs": ["Y"],"rows": [{"inputs": {"A": 0,"B": 0},"outputs": {"Y": 0}},{"inputs": {"A": 0,"B": 1},"outputs": {"Y": 1}},{"inputs": {"A": 1,"B": 0},"outputs": {"Y": 1}},{"inputs": {"A": 1,"B": 1},"outputs": {"Y": 0}}]}},
  {"name": "fullAdder","args": [1,1,1],"expected": {"sum": 1,"carryOut": 1}},
  {"name": "traceFlipFlop","args": ["JK",[{"j": 1,"k": 0},{"j": 1,"k": 1},{"reset": true}],0],"expected": [{"cycle": 0,"risingEdge": 1,"input": {"j": 1,"k": 0},"before": 0,"after": 1},{"cycle": 1,"risingEdge": 2,"input": {"j": 1,"k": 1},"before": 1,"after": 0},{"cycle": 2,"risingEdge": 3,"input": {"reset": true},"before": 0,"after": 0}]},
  {"name": "traceFSM","args": [{"kind": "moore","states": ["OFF","ON"],"initial": "OFF","outputs": {"OFF": "0","ON": "1"},"transitions": [{"from": "OFF","input": "toggle","to": "ON"},{"from": "ON","input": "toggle","to": "OFF"}]},["toggle","toggle"]],"expected": [{"cycle": 0,"input": "toggle","before": "OFF","after": "ON","output": "1"},{"cycle": 1,"input": "toggle","before": "ON","after": "OFF","output": "0"}]},
  {"name": "traceMemory","args": [{"kind": "RAM","addressBits": 2,"dataBits": 8,"initial": {"0": 5},"operations": [{"kind": "read","address": 0},{"kind": "write","address": 1,"value": 255},{"kind": "read","address": 1}]}],"expected": {"kind": "RAM","depth": 4,"dataBits": 8,"events": [{"cycle": 0,"action": "read","address": 0,"value": 5},{"cycle": 1,"action": "write","address": 1,"before": 0,"after": 255},{"cycle": 2,"action": "read","address": 1,"value": 255}],"nonzeroWords": {"0": 5,"1": 255}}},
  {"name": "plaTruthTable","args": [{"inputs": ["A","B"],"outputs": ["Y"],"terms": [{"cube": "1-","drives": [0]},{"cube": "-1","drives": [0]}]}],"expected": {"inputs": ["A","B"],"outputs": ["Y"],"terms": [{"cube": "1-","drives": [0]},{"cube": "-1","drives": [0]}],"rows": [{"inputBits": "00","outputBits": "0"},{"inputBits": "01","outputBits": "1"},{"inputBits": "10","outputBits": "1"},{"inputBits": "11","outputBits": "1"}]}},
  {"name": "verilogExample","args": ["counter4"],"expected": {"kind": "counter4","moduleName": "theo_example","code": "module theo_example(input wire clk, rst, en, output reg [3:0] count);\n  always @(posedge clk) begin\n    if (rst) count <= 4'b0000;\n    else if (en) count <= count + 4'b0001;\n  end\nendmodule\n","note": "Synchronous reset for DFF and counter; model must be validated with an external HDL simulator before making simulation claims."}},
]

const toolCases = [
  {"name": "theo_gray_to_bcd","args": {"gray": "1101"},"expected": "Gray: 1101\nBinary: 1001\nDecimal: 9\n8421 BCD: 1001"},
  {"name": "theo_truth_table","args": {"expression": "A'B+AB"},"expected": "Expression: A'B+AB\nVariables: A, B\n| A | B | F |\n| --- | --- | --- |\n| 0 | 0 | 0 |\n| 0 | 1 | 1 |\n| 1 | 0 | 0 |\n| 1 | 1 | 1 |"},
  {"name": "theo_simplify","args": {"expression": "A&B","dont_cares": "1"},"expected": "Original: A&B\nMinimized SOP: B\nVariables: A, B\nMinterms: 3\nDont-cares: 1\nVerified on all care rows: yes"},
  {"name": "theo_check_equivalence","args": {"left": "A+B","right": "A&B"},"expected": "Equivalent: no\nCounterexample: {\"A\":0,\"B\":1}\nLeft: 1; Right: 0"},
  {"name": "theo_radix_convert","args": {"value": "FF","from_base": 16,"to_base": 10},"expected": "{\n  \"input\": \"FF\",\n  \"fromBase\": 16,\n  \"toBase\": 10,\n  \"output\": \"255\",\n  \"decimal\": \"255\"\n}"},
  {"name": "theo_signed_encode","args": {"value": -5,"width": 8,"encoding": "twos-complement"},"expected": "{\n  \"value\": -5,\n  \"width\": 8,\n  \"encoding\": \"twos-complement\",\n  \"bits\": \"11111011\",\n  \"range\": [\n    \"-128\",\n    \"127\"\n  ]\n}"},
  {"name": "theo_combinational","args": {"mode": "netlist","netlist_json": "{\"inputs\":[\"A\",\"B\"],\"gates\":[{\"id\":\"Y\",\"op\":\"XOR\",\"args\":[\"A\",\"B\"]}],\"outputs\":[\"Y\"]}"},"expected": "{\n  \"inputs\": [\n    \"A\",\n    \"B\"\n  ],\n  \"outputs\": [\n    \"Y\"\n  ],\n  \"rows\": [\n    {\n      \"inputs\": {\n        \"A\": 0,\n        \"B\": 0\n      },\n      \"outputs\": {\n        \"Y\": 0\n      }\n    },\n    {\n      \"inputs\": {\n        \"A\": 0,\n        \"B\": 1\n      },\n      \"outputs\": {\n        \"Y\": 1\n      }\n    },\n    {\n      \"inputs\": {\n        \"A\": 1,\n        \"B\": 0\n      },\n      \"outputs\": {\n        \"Y\": 1\n      }\n    },\n    {\n      \"inputs\": {\n        \"A\": 1,\n        \"B\": 1\n      },\n      \"outputs\": {\n        \"Y\": 0\n      }\n    }\n  ]\n}"},
  {"name": "theo_flipflop_trace","args": {"kind": "T","samples_json": "[{\"t\":1},{\"t\":0},{\"reset\":true}]"},"expected": "[\n  {\n    \"cycle\": 0,\n    \"risingEdge\": 1,\n    \"input\": {\n      \"t\": 1\n    },\n    \"before\": 0,\n    \"after\": 1\n  },\n  {\n    \"cycle\": 1,\n    \"risingEdge\": 2,\n    \"input\": {\n      \"t\": 0\n    },\n    \"before\": 1,\n    \"after\": 1\n  },\n  {\n    \"cycle\": 2,\n    \"risingEdge\": 3,\n    \"input\": {\n      \"reset\": true\n    },\n    \"before\": 1,\n    \"after\": 0\n  }\n]"},
  {"name": "theo_fsm_trace","args": {"spec_json": "{\"kind\":\"moore\",\"states\":[\"OFF\",\"ON\"],\"initial\":\"OFF\",\"outputs\":{\"OFF\":\"0\",\"ON\":\"1\"},\"transitions\":[{\"from\":\"OFF\",\"input\":\"toggle\",\"to\":\"ON\"},{\"from\":\"ON\",\"input\":\"toggle\",\"to\":\"OFF\"}]}","inputs_json": "[\"toggle\",\"toggle\"]"},"expected": "[\n  {\n    \"cycle\": 0,\n    \"input\": \"toggle\",\n    \"before\": \"OFF\",\n    \"after\": \"ON\",\n    \"output\": \"1\"\n  },\n  {\n    \"cycle\": 1,\n    \"input\": \"toggle\",\n    \"before\": \"ON\",\n    \"after\": \"OFF\",\n    \"output\": \"0\"\n  }\n]"},
  {"name": "theo_memory_trace","args": {"spec_json": "{\"kind\":\"RAM\",\"addressBits\":2,\"dataBits\":8,\"initial\":{\"0\":5},\"operations\":[{\"kind\":\"read\",\"address\":0},{\"kind\":\"write\",\"address\":1,\"value\":255},{\"kind\":\"read\",\"address\":1}]}"},"expected": "{\n  \"kind\": \"RAM\",\n  \"depth\": 4,\n  \"dataBits\": 8,\n  \"events\": [\n    {\n      \"cycle\": 0,\n      \"action\": \"read\",\n      \"address\": 0,\n      \"value\": 5\n    },\n    {\n      \"cycle\": 1,\n      \"action\": \"write\",\n      \"address\": 1,\n      \"before\": 0,\n      \"after\": 255\n    },\n    {\n      \"cycle\": 2,\n      \"action\": \"read\",\n      \"address\": 1,\n      \"value\": 255\n    }\n  ],\n  \"nonzeroWords\": {\n    \"0\": 5,\n    \"1\": 255\n  }\n}"},
  {"name": "theo_pla_truth_table","args": {"spec_json": "{\"inputs\":[\"A\",\"B\"],\"outputs\":[\"Y\"],\"terms\":[{\"cube\":\"1-\",\"drives\":[0]},{\"cube\":\"-1\",\"drives\":[0]}]}"},"expected": "{\n  \"inputs\": [\n    \"A\",\n    \"B\"\n  ],\n  \"outputs\": [\n    \"Y\"\n  ],\n  \"terms\": [\n    {\n      \"cube\": \"1-\",\n      \"drives\": [\n        0\n      ]\n    },\n    {\n      \"cube\": \"-1\",\n      \"drives\": [\n        0\n      ]\n    }\n  ],\n  \"rows\": [\n    {\n      \"inputBits\": \"00\",\n      \"outputBits\": \"0\"\n    },\n    {\n      \"inputBits\": \"01\",\n      \"outputBits\": \"1\"\n    },\n    {\n      \"inputBits\": \"10\",\n      \"outputBits\": \"1\"\n    },\n    {\n      \"inputBits\": \"11\",\n      \"outputBits\": \"1\"\n    }\n  ]\n}"},
  {"name": "theo_hdl_example","args": {"kind": "mux2","module_name": "mux_test"},"expected": "{\n  \"kind\": \"mux2\",\n  \"moduleName\": \"mux_test\",\n  \"code\": \"module mux_test(input wire a, b, sel, output wire y);\\n  assign y = sel ? b : a;\\nendmodule\\n\",\n  \"note\": \"Synchronous reset for DFF and counter; model must be validated with an external HDL simulator before making simulation claims.\"\n}"},
]

for (const {name, args, expected} of coreCases) {
  test(`M1 migration preserves v0.2 ${name}`, () => {
    assert.deepEqual(core[name](...structuredClone(args)), expected)
    assert.deepEqual(legacy[name](...structuredClone(args)), expected)
  })
}

test('all 12 migrated tool results match the frozen v0.2 adapter outputs', async () => {
  const source = await readFile(new URL('../index.js', import.meta.url), 'utf8')
  const transformed = source.replace("import { defineTool } from '@deepseek-ai/dsh-tools'", 'const defineTool = definition => definition')
  assert.notEqual(transformed, source)
  const temp = new URL(`../.theo-adapter-test-baseline-${process.pid}.mjs`, import.meta.url)
  await writeFile(temp, transformed)
  try {
    const adapter = await import(temp.href)
    const registry = new Map()
    adapter.apply({ tools: { register: tool => registry.set(tool.name, tool) } })
    assert.deepEqual([...registry.keys()].slice(0, 12), toolCases.map(({ name }) => name))
    for (const {name, args, expected} of toolCases) {
      assert.equal(await registry.get(name).execute(args), expected, name)
    }
  } finally {
    await unlink(temp)
  }
})
