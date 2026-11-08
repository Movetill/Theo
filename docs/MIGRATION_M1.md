# M1 迁移说明

旧算法从 src/logic-core 移到 packages/core/src/domains，保持算法和错误行为。src/logic-core 中保留同名模块的转发导出，构建后的 dist/logic-core 路径仍然可用；index.js 的 12 Tool 名称、参数和输出没有迁移到新 IR。

根工程使用 npm workspaces。构建顺序为 Core → 旧路径兼容层。根包发布白名单同时包含 packages/core/dist 和 packages/core/package.json，避免插件安装后兼容层引用丢失。新的程序可从 @theo/core 导入算法与基础类型。

旧算法已知的输入校验局限保持原语义，未借此次搬迁静默改变行为。新 DigitalDesign 校验器独立提供严格校验，包括输出不可达组合环。新 IR 校验通过不等于旧网表校验器已被替换。

新增 IR_SPEC 定义实际接口；原开发设计中的后续 Workspace、引擎、工具和验证结果类型仍按里程碑实现。新增计数器 JSON 是结构样例，不是已模拟的结果。

下一阶段 M2：实现固定节点的组合求值、复用结构校验、小位宽独立参考穷举；再到 M3 实现同步边沿与原子更新。
