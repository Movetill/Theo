# Theo 🧠 — Digital Logic & Systems Companion

**An open-source, verification-first learning assistant for an entire Digital Logic / Digital Systems course.**

Theo uses a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Skill for pedagogy and a Cordis plugin for verifiable computing. Unlike a Boolean algebra-only calculator, Theo is organized around eight course domains: number systems and codes; Boolean functions; combinational design; sequential circuits; Verilog HDL; memory; programmable logic; and small controllers.

[简体中文](README.zh.md) · [Contributing](CONTRIBUTING.md)

> **Status:** v0.3.0-rc.1 connects DigitalDesign to a persistent Workspace and seven DSH design tools. DigitalDesign supports combinational evaluation, synchronous simulation, replayable traces and reference-model verification. The multi-turn design workflow was exercised in macOS DSH Desktop 0.2.1-rc.5 with DeepSeek-V4.1-Flash. [Workspace and design tools](docs/DESIGN_WORKSPACE.md) · [IR specification](docs/IR_SPEC.md) · [Desktop integration](docs/DSH_INTEGRATION.md)

## Executable capabilities

| Area | v0.2 capability | Tool |
| --- | --- | --- |
| Number systems | radix 2–36 exact integer conversion | `theo_radix_convert` |
| Signed codes | sign-magnitude, ones', twos' complement with specified width | `theo_signed_encode` |
| Gray / BCD | reflected Gray → binary → unsigned decimal → 8421 BCD | `theo_gray_to_bcd` |
| Boolean functions | truth tables, exact two-level SOP (≤5 variables), equivalence (≤8 variables) | `theo_truth_table`, `theo_simplify`, `theo_check_equivalence` |
| Combinational | full-adder input/output, basic gate-netlist truth tables (≤8 input bits) | `theo_combinational` |
| Sequential | D/T/JK flip-flop traces; Moore/Mealy FSM traces | `theo_flipflop_trace`, `theo_fsm_trace` |
| Memory | simplified ROM / RAM access traces | `theo_memory_trace` |
| Programmable logic | shared-cube PLA truth table | `theo_pla_truth_table` |
| Verilog | learning templates: 2:1 mux, DFF, 4-bit counter | `theo_hdl_example` |

All tool results describe the **modeled behavior**, not physical timing/area/delay. HDL templates are **not** syntactically checked against an external compiler in v0.2.

## Repository layout

```text
.dsh/skills/theo/SKILL.md                 # Teaching behavior and tool policy
.dsh/skills/theo/references/*.md           # Eight chapter-aware guides
packages/core/src/domains/                # Existing algorithms, moved unchanged
packages/core/src/{foundation,ir}/         # BitVector, structured errors, DigitalDesign validation
packages/core/src/engines/                 # DigitalDesign evaluation, simulation and verification
packages/workspace/                        # Persistent design revisions and simulation runs
src/dsh/                                   # Design tools and service
examples/combinational4/design.json       # Four-bit adder, mux and equality comparator
src/logic-core/                            # Compatibility reexports for existing imports
examples/counter4-decoder/design.json      # Synchronous counter and decoder with a behavioral reference
index.js                                   # Thin Cordis adapter / tool registration
cordis.patch.yml                          # Bundle insertion patch
tests/{core,domains,adapter}.test.mjs      # Core + stub adapter tests
docs/{ARCHITECTURE,ROADMAP}.md             # Scope, IR plan, acceptance criteria
```

## Local development and tests

Use Node.js 22 or later.

```bash
git clone https://github.com/Movetill/Theo.git
cd Theo
npm ci --ignore-scripts
npm test
```

No LLM account or cloud services are needed for core unit tests.

## Install into DeepSeek Harness

For **macOS Desktop**, follow [Desktop installation and verification](docs/DSH_INTEGRATION.md), using its bundled CLI and `desktop` profile. The commands below are for the separate **Web** profile.

Follow the official [first-plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md), [tool API](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.zh.md) and [bundle-installation](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md) docs for your pinned DSH version. On a compatible local CLI, after building:

```bash
npm run build
dsh plugin --profile web add .
dsh --profile web --dump-config
dsh --profile web
```

The Skill also needs to be discovered. For a workspace-only installation, open this repository as the workspace so `.dsh/skills/theo` is visible. For global installation, copy `.dsh/skills/theo` **including the `references` directory** to `$HOME/.dsh/skills/theo`.

macOS Terminal from the repository root (compare or back up an existing Theo Skill first):

```sh
mkdir -p "$HOME/.dsh/skills"
cp -R .dsh/skills/theo "$HOME/.dsh/skills/"
```

Windows PowerShell from the repository root:

```powershell
Copy-Item '.dsh\skills\theo' "$HOME\.dsh\skills\theo" -Recurse -Force
```

## Suggested test prompts

- `/theo 把十六进制 2F 转成二进制；说明为什么前导零与位宽相关。`
- `/theo 把 -5 分别写成 8 位原码、反码和补码，解释范围与溢出。`
- `/theo 设计一个全加器，解释和输出与进位输出的区别。`
- `/theo 给定四个上升沿，JK 触发器如何变化？`
- `/theo 用 Moore 状态机描述交通灯，从状态图推导时序。`
- `/theo 设计容量 1K×8 的存储器，地址线和数据线需要多少？`
- `/theo 请讲 PLA 实现多个输出的共享乘积项。`
- `/theo 给我一个带同步复位的 Verilog 4 位计数器，说明为什么这里使用非阻塞赋值。`

## Contribution and next steps

See [architecture](docs/ARCHITECTURE.md) for domain boundaries and [roadmap](docs/ROADMAP.md) for the next milestones. v0.3 covers DigitalDesign and synchronous simulation. External RTL verification and waveform support are on the roadmap.

The candidate can be built locally with `npm pack`. The Desktop install and the end-to-end example are documented in [DSH integration](docs/DSH_INTEGRATION.md).

License: MIT.
