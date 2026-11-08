/** Small teaching examples; NOT a general Verilog generator, compiler or validator. */
export function verilogExample(kind: 'mux2' | 'dff' | 'counter4', name = 'theo_example') {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name) || name.length > 64) throw new Error('Invalid Verilog module name')
  let moduleSource: string
  if (kind === 'mux2') moduleSource = `module ${name}(input wire a, b, sel, output wire y);\n  assign y = sel ? b : a;\nendmodule\n`
  else if (kind === 'dff') moduleSource = `module ${name}(input wire clk, rst, d, output reg q);\n  always @(posedge clk) begin\n    if (rst) q <= 1'b0;\n    else q <= d;\n  end\nendmodule\n`
  else if (kind === 'counter4') moduleSource = `module ${name}(input wire clk, rst, en, output reg [3:0] count);\n  always @(posedge clk) begin\n    if (rst) count <= 4'b0000;\n    else if (en) count <= count + 4'b0001;\n  end\nendmodule\n`
  else throw new Error('Unsupported example')
  return { kind, moduleName: name, code: moduleSource, note: 'Synchronous reset for DFF and counter; model must be validated with an external HDL simulator before making simulation claims.' }
}
