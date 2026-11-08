# M4 设计 Workspace 与 DSH 工具

DSH 插件共注册 19 个工具，其中 7 个用于保存和运行 DigitalDesign。先在仓库根目录执行 `npm ci --ignore-scripts` 和 `npm test`，再按桌面接入说明加载构建产物。[DSH Desktop 接入](DSH_INTEGRATION.md)

## 工具契约

| 工具 | 参数 | 成功时返回 |
| --- | --- | --- |
| theo_create_design | design_json 或 template，二选一 | 生成的 designId、revision=1 和概要 |
| theo_get_design | design_id，选填 revision、section、start、limit | 概要或 IR 分页 |
| theo_update_design | design_id、expected_revision、design_json | 同一 ID 的下一版本 |
| theo_validate_design | design_id、revision | valid=true 和诊断列表 |
| theo_simulate_design | design_id、revision、stimuli_json，选填 initial_registers_json | runId、周期数和仿真语义 |
| theo_verify_design | 与仿真同样的参数，另传 reference | verification，包括状态、覆盖周期数和首条反例 |
| theo_get_trace | run_id，选填 start、limit | 仿真版本与轨迹分页 |

`*_json` 参数使用 JSON 字符串。design_json 为完整 DigitalDesign。stimuli_json 为从 0 连续编号的帧数组。每帧包含 cycle、clockEvent 和 inputs。提供 initial_registers_json 时须给出所有寄存器的定宽初值。[IR 与仿真规范](IR_SPEC.md)

`get_design` 默认读取最新版本。传入 revision 时读取指定快照，旧版本也可以校验、仿真与验证。可分页读取 ports、clocks、nodes 或 outputBindings。start 从 0 开始，limit 默认 8，范围 1～32。每页条目合计最多 24 KiB。nextStart 为 null 表示读完。单个条目超过预算时返回 RESOURCE_LIMIT。合并分页后，outputBindings 项为 {id, source}，应以 id 作键、source 作值重建对象。其他三个 section 仍为数组。

template 与 reference 的内置取值为 `counter4-decoder`。参考模型要求四位 counter 寄存器、reset 和 enable 输入、count 与 is_nine 输出。它按给定初态和输入序列逐周期比较，识别配置符合但行为错误的设计。

工具输出为可解析 JSON 文本，含 ok 和 tool。输入错误、仿真失败、保存失败和验证未通过都返回 ok=false，error 包含 code、message 和 path。验证失败时同时返回 verification 及反例。验证报告通过仅覆盖返回的属性、假设和输入序列。

## 持久化与并发

默认目录是 `${DSH_HOME:-$HOME/.dsh}/.theo-workspace`，当前用户的 DSH 会话共用。设计 ID 以 d_ 开头，运行 ID 以 r_ 开头，后接随机 UUID。设计快照位于 `designs/<designId>/rev-<revision>.json`，轨迹位于 `runs/<runId>.json`。轨迹记录了实际版本、输入帧和首步状态。

更新提交完整设计，沿用读到的 ID 和 revision。存储先校验，再写入同目录临时文件并同步到磁盘，通过排他的硬链接发布完整版本。并发写入同一版本时，后提交方收到 REVISION_CONFLICT。该实现面向支持硬链接的本地文件系统。Workspace 下的符号链接和任意路径输入会被拒绝。

## 可复现用例

1. 创建 `counter4-decoder` 模板并保留 designId 和 revision。
2. 校验 revision 1，再用 `{"counter":"1000"}` 作为初态运行两帧。
   - 周期 0 使用 enable=1、reset=0。边沿后 count=1001、is_nine=1。
   - 周期 1 使用 enable=1、reset=1。边沿后 count=0000、is_nine=0。
3. 用 runId 查看两帧的轨迹，再用相同输入调用 `theo_verify_design`，预期 passed 且 checkedCases=2。
4. 分两轮使用同一 designId 读取和编辑。保存 revision 2 后，再以 expected_revision=1 提交，预期 REVISION_CONFLICT。

`npm test` 覆盖此流程、旧工具回归、并发版本竞争、无效 JSON、位宽错误、符号链接与反例。M5 已完成 Desktop 模型多轮验收。

## M4 验证记录

本地 Node 22.14.0 与 26.8.1 均通过 96 项测试。临时目录中的 npm 安装包包含 79 个文件。使用本机 DSH Desktop 0.2.1-rc.5 随附的 dsh-tools 与内嵌 Node 24.21.0，在隔离注册表编译了全部 19 个定义，并调用了 7 个设计工具。参数、输出 schema 与文本呈现均通过检查。该库要求可选字段省略 required。 [DSH 工具开发说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.zh.md)

M5 在实际 Desktop 会话中验证了同一 ID 跨轮引用、仿真、验证、改版、冲突和反例。
