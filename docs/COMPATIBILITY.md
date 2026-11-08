# 兼容性记录

| 项目 | 版本或状态 | 证据范围 |
| --- | --- | --- |
| DSH Desktop | 0.2.1-rc.5，macOS | M5 实测 DeepSeek-V4.1-Flash · High 的设计工具多轮流程 |
| Node | 本机 v26.8.1；额外验证 v22.14.0 | M5 在两个本地版本均通过 strict 构建和 96 项测试 |
| npm | 本轮本机 11.19.0 | 根锁文件与 workspaces |
| TypeScript | 固定 5.9.3 | strict 构建 |
| DSH 工具库 | 0.2.1-rc.5，内嵌 Node 24.21.0 | 隔离验证安装包中的 19 个定义与 7 个设计工具 |
| CI 目标 | Node 22 | 配置使用 npm ci；远端 CI 尚未执行 |
| Windows / Linux | 本轮未测试 | 不从 macOS 结果推断平台通过 |
| Core | 无 DSH、Cordis 或模型依赖 | 可单独构建、导入和运行测试 |

本地插件候选包为 0.3.0-rc.1，含旧 12 个工具及 7 个设计工具。Core 是私有 workspace 包。声明的 DSH 范围仍为 >=0.2.1-rc.2 <0.3.0，不能用这个范围代替逐版本实测。
