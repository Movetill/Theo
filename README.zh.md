# Theo 数字逻辑学习助手

<p align="center">
  <img src="assets/theo.png" width="320" alt="Theo 项目形象，身旁是笔记本电脑和数字逻辑教材">
</p>

Theo 在 DeepSeek Harness（DSH）中调用可复现的数字逻辑工具。v0.3 候选版支持保存设计版本、仿真单时钟同步电路、回放逐周期轨迹，以及用独立参考模型核对计数器。

[English README](README.md) · [Mac 安装](docs/DSH_INTEGRATION.md) · [贡献指南](CONTRIBUTING.md)

| 学习任务 | 可用功能 |
| --- | --- |
| 数制与编码 | 任意整数进制转换、有符号编码、Gray 转二进制和 8421 BCD |
| 布尔与组合逻辑 | 真值表、SOP 化简、等价检查、全加器、单比特门网表 |
| 多位数字设计 | DigitalDesign 结构校验、定宽加法、选择、比较、切片、拼接 |
| 时序 | 同步复位、原子寄存器更新、边沿前后轨迹 |
| 存储与可编程逻辑 | ROM/RAM 行为模型和 PLA 真值表 |
| HDL 学习 | Verilog 教学模板与行为讲解 |

## 本地构建

需要 Node.js 22 或更高版本。

```sh
git clone https://github.com/Movetill/Theo.git
cd Theo
npm ci --ignore-scripts
npm test
```

Mac Desktop 使用内置 CLI 和 `desktop` profile。按照安装指南加载插件与 Theo Skill 后，可以让模型使用 `counter4-decoder` 模板创建设计，验证 revision 1 并模拟 20 个上升沿。从默认初态连续计数时，周期 8 的边沿后为 `count=1001, is_nine=1`，周期 19 为 `count=0100, is_nine=0`。

[Workspace 与 DSH 工具契约](docs/DESIGN_WORKSPACE.md) · [Core 与 IR 接口](docs/IR_SPEC.md) · [架构](docs/ARCHITECTURE.md) · [兼容性](docs/COMPATIBILITY.md)

Theo 的设计模型采用二值信号与稳定的上升沿输入。时序结果针对该模型和指定刺激。项目采用 MIT 许可。
