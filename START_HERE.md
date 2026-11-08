# Theo — 当前开发入口

M5 已完成 DSH Desktop 多轮验收，并生成本地 0.3.0-rc.1 候选包。

- `index.js`：Cordis 插件入口，注册 12 个旧工具与 7 个设计工具。
- `packages/core/src/domains/`：迁移后的旧算法。
- `packages/core/src/foundation/`：BitVector 与结构化错误。
- `packages/core/src/ir/`：DigitalDesign 类型与严格运行时校验。
- `packages/core/src/engines/combinational.ts`：组合电路单帧求值。
- `packages/core/src/engines/simulation.ts`：同步仿真与逐周期轨迹。
- `packages/core/src/engines/verification.ts`：参考模型验证与反例。
- `examples/counter4-decoder/`：计数器、译码器和独立行为参考。
- `examples/combinational4/design.json`：四位加法器、选择器和相等比较器。
- `src/logic-core/`、`dist/logic-core/`：旧导入路径兼容层。
- `packages/workspace/index.js`：设计版本和仿真轨迹持久化。
- `docs/DESIGN_WORKSPACE.md`：设计工具契约与验收用例。
- `docs/IR_SPEC.md`：新 IR 的实际契约。
- `docs/MIGRATION_M1.md`：迁移说明。
- `docs/DSH_INTEGRATION.md`：Mac Desktop 接入与证据边界。
- `docs/COMPATIBILITY.md`：已验证的 DSH 与 Node.js 版本。

在本目录执行：

```sh
npm ci --ignore-scripts
npm test
```

真实会话按 20 项用例分四轮运行，另有一轮分页回填复验。
