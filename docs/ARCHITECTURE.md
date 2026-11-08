# Theo — Architecture

## M3 implementation update

The standalone `packages/core` now contains the unchanged legacy domain algorithms, BitVector helpers, structured errors and DigitalDesign runtime validation. Legacy `src/logic-core` paths forward to the compiled Core; the adapter and its 12 tools retain their contracts. [IR_SPEC.md](IR_SPEC.md) defines the implemented schema. The combinational engine shares the validator’s topological order and evaluates one input frame at a time. The synchronous engine evaluates both sides of each rising edge and commits register updates atomically. The reference verifier checks state and outputs and reports the first divergent signal. The v0.2 architecture and future sketch below are historical context; `nextStateFn` is not an executable IR field.

See [DSH_INTEGRATION.md](DSH_INTEGRATION.md) for the verified Desktop workflow.

## Product goal

A whole-course **digital logic and digital systems learning companion**, not a Boolean equation calculator. The teaching layer serves learning; the verification layer serves correctness; their boundaries must remain explicit.

## Layered system

```text
Student / course material / schematic / RTL
                   |
         DeepSeek Harness agent loop
                   |
          Theo Skill (tutoring)
          + chapter references
                   |
         Theo Cordis Tool Adapter
                   |
        independent logic-core
      +-------------+-------------+
      |             |             |
  Representation  Circuits  Sequential/FSM
      |             |             |
   Boolean      Memory/PLA     HDL examples
```

The tool adapter is thin. Each pure engine can be tested in Node.js without LLM, network or DeepSeek Harness. For tool-layer integration use a mocked tools registry; a live DSH runtime test remains pending.

## Course domains and status

| Domain | Working v0.2 code | Still missing |
| --- | --- | --- |
| Number systems / coding | exact integer bases 2..36; fixed-width sign magnitude/ones/twos; Gray->BCD | fractional radix, excess-3, Hamming, arithmetic overflow explanations |
| Boolean functions | parser, truth table, min SOP, equivalence | interactive Karnaugh map, POS, hazard detection |
| Combinational logic | single-bit gate netlists, full adder | multibit busses, priority encoder, decoder, MUX as parameterized circuits, delays/hazards |
| Sequential logic | D/T/JK edge traces, Moore/Mealy FSM traces | latches, 4-state signals, timed events, setup/hold constraints |
| Verilog HDL | three syntax templates (MUX, DFF, counter) | real lint, compile, simulate, VCD, testbench, synthesis |
| Memory | RAM/ROM read/write educational traces | actual synchronous RAM interface / dual-port collision semantics, SRAM/DRAM timing |
| Programmable logic | multi-output PLA truth table | PAL restriction, CPLD/FPGA mapping and implementation |
| Small controllers | generic FSM trace, small traffic controller case | datapath integration, microinstruction/microprogramming, RTL end-to-end |

## Shared future intermediate representations

The long-term model should be an IR-based pipeline rather than eight unrelated calculators:

- `BitVector(width, signedness, knownMask, value)` for number and RTL semantics; later four-state support (`0,1,X,Z`).
- `CombinationalGraph(nodes, edges, ports)` for gates, MUX, adders, PLA realizations.
- `SequentialSystem(state, nextStateFn, outputsFn, clock/reset semantics)` for FF/counters/FSM/controllers.
- `MemoryModel(depth, width, portProtocol)` for ROM/RAM and controller datapath.
- `SimulationTrace(timestamp, inputs, state, outputs)` as a normalized output for tables and waveforms.
- `VerificationResult(status, assumptions, counterexample, engine)` for Boolean, circuit, FSM, and RTL checks.

**v0.2 does not claim these unified IRs are implemented**. Current small modules provide executable examples; designing compatible, reusable IRs is the next major engineering task.

## Verification strategy

1. Unit tests for every deterministic engine and edge conditions.
2. Exhaustive enumeration for small domains; property-based tests for bitvectors/circuit behavior.
3. Independent reference HDL testbench from behavioral specifications, simulated via iverilog/vvp when implemented.
4. Tool-calling acceptance tests with a pinned DSH runtime, plus trajectory inspection.
5. Safe runner: explicit tool allowlist, temporary working directory, output truncation, timeouts and resource limits. Never execute arbitrary RTL/testbenches as ordinary unsandboxed host code.

## Progressive disclosure & tool design

`SKILL.md` routes to relevant `references/*.md` on demand. Tool schemas expose 12 concrete actions; future UI and multi-tool workflow should group pedagogic actions while retaining precise interfaces. Do not force LLM to solve deterministic tasks without tools or claim confidence outside the verified model.
