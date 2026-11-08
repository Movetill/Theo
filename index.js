/** DeepSeek Harness adapter. Pure algorithms live in dist/logic-core. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DesignStore } from './packages/workspace/index.js'
import { createDesignService } from './src/dsh/design-service.js'
import { registerDesignTools } from './src/dsh/design-tools.js'
import { grayToBcd, truthTable, simplifyExpression, checkEquivalence,
  convertRadix, encodeSigned, fullAdder, netlistTruthTable, traceFlipFlop, traceFSM, traceMemory, plaTruthTable, verilogExample } from './dist/logic-core/index.js'

export const name = 'theo-digital-logic'
export const inject = ['tools']

const output = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}

export function apply(ctx, config = {}) {
  ctx.tools.register(defineTool({
    name: 'theo_gray_to_bcd',
    description: 'Convert unsigned binary-reflected Gray code to binary, decimal and 8421 BCD; use for exact code-conversion questions. Input: 1–64 bits.',
    parameters: { gray: { type: 'string', required: true, description: 'A bit string such as 1101' } },
    output,
    async execute(args) {
      const result = grayToBcd(args.gray)
      return `Gray: ${result.gray}\nBinary: ${result.binary}\nDecimal: ${result.decimal}\n8421 BCD: ${result.bcd}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'theo_truth_table',
    description: 'Deterministically generate a truth table for an expression of up to 8 variables. Supports A, !A, A\u0027, AND adjacency or &, OR +, XOR ^, and parentheses.',
    parameters: { expression: { type: 'string', required: true, description: "Boolean expression such as A'B+AC" } },
    output,
    async execute(args) {
      const data = truthTable(args.expression)
      const cols = [...data.variables, 'F']
      const header = `| ${cols.join(' | ')} |`
      const separator = `| ${cols.map(() => '---').join(' | ')} |`
      const rows = data.rows.map(row => `| ${[...row.input, String(row.output)].join(' | ')} |`)
      return [`Expression: ${data.expression}`, `Variables: ${data.variables.join(', ') || '(none)'}`, header, separator, ...rows].join('\n')
    },
  }))
  ctx.tools.register(defineTool({
    name: 'theo_simplify',
    description: 'Exact minimal two-level SOP via Quine-McCluskey with up to 5 variables; internally verifies equivalence. Optional comma-separated decimal dont-cares.',
    parameters: {
      expression: { type: 'string', required: true, description: "Boolean expression, e.g. A'B+AB" },
      dont_cares: { type: 'string', description: 'Optional decimal indices, e.g. 1,3; leave empty when none' },
    },
    output,
    async execute(args) {
      const raw = args.dont_cares?.trim() ?? ''
      if (raw && !/^\d+(\s*,\s*\d+)*$/.test(raw)) throw new Error('无关项应为逗号分隔的非负十进制整数')
      const dc = raw ? raw.split(',').map(v => Number(v.trim())) : []
      const result = simplifyExpression(args.expression, dc)
      return [`Original: ${result.original}`, `Minimized SOP: ${result.minimized}`, `Variables: ${result.variables.join(', ') || '(none)'}`, `Minterms: ${result.minterms.join(', ') || '(none)'}`, `Dont-cares: ${result.dontCares.join(', ') || '(none)'}`, 'Verified on all care rows: yes'].join('\n')
    },
  }))
  ctx.tools.register(defineTool({
    name: 'theo_check_equivalence',
    description: 'Exhaustively check whether two Boolean expressions are equivalent for up to 8 total variables; provides a counterexample when false.',
    parameters: {
      left: { type: 'string', required: true, description: "First expression, e.g. A'B+AB" },
      right: { type: 'string', required: true, description: 'Second expression, e.g. B' },
    },
    output,
    async execute(args) {
      const result = checkEquivalence(args.left, args.right)
      return result.equivalent
        ? `Equivalent: yes (exhaustive ${2 ** result.variables.length} assignments)`
        : `Equivalent: no\nCounterexample: ${JSON.stringify(result.counterexample)}\nLeft: ${result.leftValue}; Right: ${result.rightValue}`
    },
  }))

  // Domain tools: deterministic runtime implementations. Complex schemas are JSON
  // strings so the engine remains independent from any particular agent SDK.
  const toJson = result => JSON.stringify(result, null, 2)
  const parseSpec = (json, label) => {
    if (typeof json !== 'string' || json.length > 100_000) throw new Error(`${label} must be a JSON string <=100 KB`)
    try { return JSON.parse(json) } catch { throw new Error(`${label} must be valid JSON`) }
  }
  ctx.tools.register(defineTool({
    name: 'theo_radix_convert',
    description: 'Convert an exact integer in base 2..36 to another base; includes decimal interpretation. Not for fractional values.',
    parameters: {
      value: { type: 'string', required: true, description: 'Integer digits without base prefix, e.g. 2F or -1011' },
      from_base: { type: 'number', required: true, description: 'Source base, 2..36' },
      to_base: { type: 'number', required: true, description: 'Destination base, 2..36' },
    }, output,
    async execute(args) { return toJson(convertRadix(args.value, args.from_base, args.to_base)) },
  }))
  ctx.tools.register(defineTool({
    name: 'theo_signed_encode',
    description: 'Encode a signed integer using sign-magnitude, ones-complement or twos-complement with explicit fixed width. Rejects overflow.',
    parameters: {
      value: { type: 'number', required: true, description: 'Signed integer, e.g. -5' },
      width: { type: 'number', required: true, description: 'Bit width, 2..53' },
      encoding: { type: 'string', required: true, description: 'sign-magnitude | ones-complement | twos-complement' },
    }, output,
    async execute(args) { return toJson(encodeSigned(args.value, args.width, args.encoding)) },
  }))
  ctx.tools.register(defineTool({
    name: 'theo_combinational',
    description: 'Evaluate a full adder, or enumerate the truth table of a zero-delay 1-bit-gate netlist (AND/OR/NOT/XOR/NAND/NOR/XNOR/BUF).',
    parameters: {
      mode: { type: 'string', required: true, description: 'full_adder or netlist' },
      a: { type: 'number', description: 'Full adder input bit' },
      b: { type: 'number', description: 'Full adder input bit' },
      carry_in: { type: 'number', description: 'Full adder carry input bit' },
      netlist_json: { type: 'string', description: 'For netlist mode, JSON: {"inputs":["A","B"],"gates":[{"id":"y","op":"XOR","args":["A","B"]}],"outputs":["y"]}' },
    }, output,
    async execute(args) {
      if (args.mode === 'full_adder') return toJson(fullAdder(args.a, args.b, args.carry_in))
      if (args.mode === 'netlist') return toJson(netlistTruthTable(parseSpec(args.netlist_json, 'netlist_json')))
      throw new Error('mode must be full_adder or netlist')
    },
  }))
  ctx.tools.register(defineTool({
    name: 'theo_flipflop_trace',
    description: 'Simulate D/T/JK flip-flop at successive rising clock edges; reset is synchronous active-high. Returns before/after Q.',
    parameters: {
      kind: { type: 'string', required: true, description: 'D, T, or JK' },
      samples_json: { type: 'string', required: true, description: 'JSON array, e.g. [{"d":1},{"d":0},{"reset":true}] for D' },
      initial_q: { type: 'number', description: 'Initial Q, 0 or 1; defaults to 0' },
    }, output,
    async execute(args) { return toJson(traceFlipFlop(args.kind, parseSpec(args.samples_json, 'samples_json'), args.initial_q ?? 0)) },
  }))
  ctx.tools.register(defineTool({
    name: 'theo_fsm_trace',
    description: 'Simulate a Moore or Mealy FSM over rising-edge input samples. Requires explicit total path transitions for the supplied input sequence.',
    parameters: {
      spec_json: { type: 'string', required: true, description: 'JSON {states:[...],initial:"S0",kind:"moore"|"mealy",outputs:{S0:"0"},transitions:[{from:"S0",input:"1",to:"S1",output:"1"}]}' },
      inputs_json: { type: 'string', required: true, description: 'JSON array of input symbols, e.g. ["0","1","1"]' },
    }, output,
    async execute(args) { return toJson(traceFSM(parseSpec(args.spec_json, 'spec_json'), parseSpec(args.inputs_json, 'inputs_json'))) },
  }))
  ctx.tools.register(defineTool({
    name: 'theo_memory_trace',
    description: 'Model edge-ordered reads/writes to ROM or RAM with address and data widths (educational model, not physical timing).',
    parameters: {
      spec_json: { type: 'string', required: true, description: 'JSON {kind:"RAM",addressBits:2,dataBits:8,initial:{"0":5},operations:[{kind:"read",address:0},{kind:"write",address:1,value:7}]}' },
    }, output,
    async execute(args) { return toJson(traceMemory(parseSpec(args.spec_json, 'spec_json'))) },
  }))
  ctx.tools.register(defineTool({
    name: 'theo_pla_truth_table',
    description: 'Generate exact truth table of a PLA with shared product cubes; do not confuse with PAL, CPLD or FPGA timing models.',
    parameters: {
      spec_json: { type: 'string', required: true, description: 'JSON {inputs:["A","B"],outputs:["Y"],terms:[{cube:"1-",drives:[0]}]}' },
    }, output,
    async execute(args) { return toJson(plaTruthTable(parseSpec(args.spec_json, 'spec_json'))) },
  }))
  ctx.tools.register(defineTool({
    name: 'theo_hdl_example',
    description: 'Generate small educational synthesizable Verilog modules for mux2, dff and counter4. This is NOT compilation, lint or simulation.',
    parameters: {
      kind: { type: 'string', required: true, description: 'mux2 | dff | counter4' },
      module_name: { type: 'string', description: 'Optional Verilog module identifier' },
    }, output,
    async execute(args) { return toJson(verilogExample(args.kind, args.module_name ?? 'theo_example')) },
  }))
  const workspace = config?.workspaceRoot ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), '.theo-workspace')
  registerDesignTools(ctx.tools, defineTool, createDesignService(new DesignStore(workspace)))
}
