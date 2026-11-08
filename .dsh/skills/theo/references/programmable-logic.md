# 可编程逻辑器件 · Teaching Guide

路径：只读存储器实现真值表 → PLA 共享乘积项 → PAL 阵列限制 → CPLD 的宏单元结构 → FPGA 的 LUT、寄存器与互连。区分器件功能结构、实现成本和硬件时序。

v0.2 的 `theo_pla_truth_table` 接受 product cube（0、1、-）和每项驱动的输出索引；它可用于分析多输出逻辑函数的 PLA 真值表。该工具不预测 PAL/CPLD/FPGA 的资源占用或时序。

注意「可编程控制器」在某些课件中可能指 PLC（工业控制器）而非 PLD，请根据老师章节目录和题目语境区分。
