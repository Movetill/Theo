# Theo roadmap: whole-course digital systems assistant

## Current milestone

- M0: local Core and DSH Desktop tool-call baseline.
- M1: independent Core, preserved legacy APIs, BitVector, DigitalDesign types and strict structural validation implemented. See [migration](MIGRATION_M1.md).
- M2: single-frame evaluation of nine combinational nodes in validated DigitalDesign. The 4-bit example matches independent references on all 512 input combinations.
- M3: synchronous atomic register updates, replayable traces and reference-model verification. The 4-bit counter and decoder pass all 64 transitions.
- M4: persistent design revisions, simulation runs and seven DSH design tools.
- M5: live DSH Desktop acceptance and local 0.3.0-rc.1 candidate verified.

The latest v0.3 development design governs scope. The older roadmap below records the original longer-term direction; its 2-bit saturating counter + RTL case is not the current v0.3 acceptance case.

## Earlier roadmap

- **v0.1 (done, core tested):** basic Boolean, Gray/BCD, SOP and equivalence.
- **v0.2 (prototype in this repository, core/stub tested):** exact radix/signed encodings, combinational netlist, FF/FSM trace, simplified ROM/RAM, PLA table, Verilog teaching templates; chapter-specific Skill references. **Not** full chapter coverage or a live DSH-validated release.
- **v0.3 (next engineering milestone):** common bit-vector/circuit/FSM IR; standardized input/trace/result schema; full adders/multiplexers/decoders/counters/registers built from the same IR; machine-generated exercise fixtures. Add cross-module consistency tests.
- **v0.4:** iverilog/vvp and Verilator lint adapter with explicit user consent, process sandbox, timeouts, diagnostic parsing, VCD waveform visualization; testbenches for sample FSM/controllers; practical nonblocking assignment and reset exercises.
- **v0.5:** ROM/PLA/PAL synthesis lessons, simple datapath + control FSM co-simulation, controller experiments, optional Yosys synthesis/resource report, visual circuit/transition/timing diagrams.
- **v1.0:** broad course exercise bank across eight chapters, reliable installation on a pinned DSH version, automated tests with release assets, Chinese + English docs, UI, reproducible cross-domain project tutorials.

## First end-to-end teaching acceptance case

1. Student describes a 2-bit saturating counter controller with `enable`, `reset`.
2. Theo helps write state table and state transition diagram.
3. Deterministic FSM/core verifies all transitions and outputs.
4. Theo generates synthesizable Verilog and a testbench.
5. Approved sandbox runs HDL simulation and returns waveform trace.
6. The student sees any discrepancy as an input sequence + time point + expected/actual state.

Only steps 1-3 are approximated by current tools. Do not mark the pipeline complete until the RTL and waveform cross-check exists.
