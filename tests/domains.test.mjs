import test from 'node:test'
import assert from 'node:assert/strict'
import { convertRadix, encodeSigned, evaluateNetlist, netlistTruthTable, fullAdder, traceFlipFlop, traceFSM, traceMemory, plaTruthTable, verilogExample } from '../dist/logic-core/index.js'

test('number bases and representations: negative, large integer, overflow', () => {
  assert.equal(convertRadix('FF', 16, 2).output, '11111111')
  assert.equal(convertRadix('-101', 2, 10).output, '-5')
  assert.equal(convertRadix('FFFFFFFFFFFFFFFF', 16, 10).decimal, '18446744073709551615')
  assert.equal(encodeSigned(-5, 8, 'twos-complement').bits, '11111011')
  assert.equal(encodeSigned(-5, 8, 'ones-complement').bits, '11111010')
  assert.equal(encodeSigned(-5, 8, 'sign-magnitude').bits, '10000101')
  assert.throws(() => encodeSigned(128, 8, 'twos-complement'), /out of range/)
  assert.throws(() => convertRadix('102', 2, 10), /Invalid/)
})

test('combinational netlist and adder; cycles rejected', () => {
  const netlist = {inputs:['A','B'], gates:[{id:'xor',op:'XOR',args:['A','B']},{id:'eq',op:'NOT',args:['xor']}], outputs:['xor','eq']}
  const rows = netlistTruthTable(netlist).rows
  assert.deepEqual(rows.map(r => r.outputs.eq), [1,0,0,1])
  assert.deepEqual(fullAdder(1,1,1), {sum:1,carryOut:1})
  assert.throws(() => evaluateNetlist({ inputs:['A'], gates:[{id:'x',op:'NOT',args:['y']},{id:'y',op:'NOT',args:['x']}], outputs:['x'] },{A:1}), /cycle/)
})

test('D, JK flip-flops update on rising-edge samples and synchronous reset', () => {
  assert.deepEqual(traceFlipFlop('D',[{d:1},{d:0},{reset:true}],0).map(t => t.after),[1,0,0])
  assert.deepEqual(traceFlipFlop('JK',[{j:1,k:0},{j:1,k:1},{j:0,k:0},{j:0,k:1}],0).map(t=>t.after),[1,0,0,0])
})

test('Moore FSM models a tiny two-state controller', () => {
  const spec = {kind:'moore',states:['RED','GREEN'],initial:'RED',outputs:{RED:'STOP',GREEN:'GO'},transitions:[{from:'RED',input:'tick',to:'GREEN'},{from:'GREEN',input:'tick',to:'RED'}]}
  const trace = traceFSM(spec,['tick','tick','tick'])
  assert.deepEqual(trace.map(x=>x.output),['GO','STOP','GO'])
  assert.deepEqual(trace.map(x=>x.after),['GREEN','RED','GREEN'])
  assert.throws(()=>traceFSM(spec,['stop']),/Missing transition/)
})

test('RAM write/read and ROM write protection',()=>{
  const result = traceMemory({kind:'RAM',addressBits:2,dataBits:8,initial:{0:5},operations:[{kind:'read',address:0},{kind:'write',address:1,value:255},{kind:'read',address:1}]})
  assert.deepEqual(result.events.map(e=>e.value ?? e.after),[5,255,255])
  assert.throws(()=>traceMemory({kind:'ROM',addressBits:2,dataBits:8,operations:[{kind:'write',address:0,value:1}]}),/read-only/)
})

test('PLA multi-output shared implicants',()=>{
  const truth = plaTruthTable({inputs:['A','B'], outputs:['OR','AND'],terms:[{cube:'1-',drives:[0]},{cube:'-1',drives:[0]},{cube:'11',drives:[1]}]})
  assert.deepEqual(truth.rows.map(r=>r.outputBits),['00','10','10','11'])
})

test('HDL example explicitly generates nonblocking sequential code',()=>{
  assert.match(verilogExample('counter4').code,/always @\(posedge clk\)/)
  assert.match(verilogExample('counter4').code,/<=/)
  assert.match(verilogExample('mux2').code,/assign y = sel \? b : a/)
  assert.throws(()=>verilogExample('mux2','bad-name'),/Invalid Verilog/)
})

test('cross-domain: full adder gate network agrees with arithmetic reference on all eight input vectors', () => {
  const netlist = {
    inputs: ['A', 'B', 'Cin'],
    gates: [
      {id:'axb',op:'XOR',args:['A','B']},
      {id:'sum',op:'XOR',args:['axb','Cin']},
      {id:'ab',op:'AND',args:['A','B']},
      {id:'ac',op:'AND',args:['A','Cin']},
      {id:'bc',op:'AND',args:['B','Cin']},
      {id:'carry',op:'OR',args:['ab','ac','bc']},
    ],
    outputs: ['sum','carry'],
  }
  for (const row of netlistTruthTable(netlist).rows) {
    const {A,B,Cin} = row.inputs
    const expected = fullAdder(A,B,Cin)
    assert.deepEqual(row.outputs, {sum:expected.sum,carry:expected.carryOut})
  }
})
