# Guided Case — An 8-case Full Adder (v0.2 supported)

This case spans **number encoding → combinational logic → gate-level verification**, rather than treating each chapter as a disconnected chatbot prompt.

1. **Represent** three 1-bit inputs `A`, `B`, `Cin` as a 3-bit vector (8 values).
2. **Specification**: `S = A xor B xor Cin`; `Cout = AB + ACin + BCin`.
3. **Build** gate graph (XOR/AND/OR), using `theo_combinational` with `mode=netlist`.
4. **Verify** each of 8 rows independently against `fullAdder(A,B,Cin)` reference.
5. **Teach** why carry is a majority function, and why `S` captures odd parity.

The gate graph from the test suite is:

```json
{
  "inputs": ["A", "B", "Cin"],
  "gates": [
    {"id":"axb","op":"XOR","args":["A","B"]},
    {"id":"sum","op":"XOR","args":["axb","Cin"]},
    {"id":"ab","op":"AND","args":["A","B"]},
    {"id":"ac","op":"AND","args":["A","Cin"]},
    {"id":"bc","op":"AND","args":["B","Cin"]},
    {"id":"carry","op":"OR","args":["ab","ac","bc"]}
  ],
  "outputs": ["sum", "carry"]
}
```

**Current limitation:** This is zero-delay functional equivalence only. It does not prove freedom from glitches, timing violations or any HDL source correctness.

## Future end-to-end systems exercise

A traffic light controller should progress from verbal constraints through state diagram, Moore/Mealy transition table, Boolean implementation, synthesizable Verilog, testbench, simulation waveform, and learner feedback. The FSM trace is implemented now; RTL + waveform stages are future work.
