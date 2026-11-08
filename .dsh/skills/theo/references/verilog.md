# Verilog HDL · Teaching Guide

路径：module/端口/位宽/逻辑常量 → assign/组合 always → always @(posedge clk)/寄存器 → `=` vs `<=` → 模块实例化 → testbench → Icarus 仿真和 VCD → Verilator lint → Yosys 综合与资源分析。

解题时区分语法错误、组合锁存器推断、位宽截断、符号扩展、阻塞/非阻塞赋值、跨时钟域和 testbench 竞态。

v0.2 仅 `theo_hdl_example` 返回 2:1 MUX、DFF 或四位计数器 Verilog 示例，不会执行 Verilog。用户自写 RTL 若需严谨验证，下一版将通过许可明确的外部 Icarus/Verilator/Yosys 适配器，在临时工作区运行并清理；必须显示工具日志、超时/失败信息。不得声称已综合或已仿真。
