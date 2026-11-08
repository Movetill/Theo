# DSH Desktop 安装与验证

Theo 的多轮设计流程已在 macOS DSH Desktop 0.2.1-rc.5 上验证。已测运行环境和构建结果见[兼容性记录](COMPATIBILITY.md)。

## 本机安装流程

首次使用时先启动 Desktop 初始化 profile。安装前用 Command-Q 完全退出，然后在 Theo 仓库根目录运行以下命令。

```sh
npm ci --ignore-scripts
npm test
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add .
mkdir -p "$HOME/.dsh/skills"
cp -R .dsh/skills/theo "$HOME/.dsh/skills/"
```

复制前若已安装自定义 Theo Skill，先比较或备份。Desktop 安装使用内置 CLI 和 `desktop` profile。若以本地链接方式安装，重新构建后重启 Desktop 即可加载更新。

## 最小人工复验

1. 重新打开 Desktop，确认 theo Skill 可加载。
2. 要求实际调用 theo_gray_to_bcd，输入 1101；预期 binary=1001、decimal=9、BCD=1001。
3. 要求调用 theo_simplify，表达式 A'B+AB；预期最简式 B。
4. 输入非法 Gray 码 1020；确认报告失败且不声称已通过验证。
5. 图片先逐格转录并人工确认，再调用化简。记录识图结果和计算证据，分别评判。

保存 DSH/模型版本、提示词、工具参数、原始返回与最终回答。工具日志比模型自述更可靠。

## M4 设计工具接入

加载 M4 构建后，可用 counter4-decoder 模板执行创建、读取、校验、仿真、验证及改版。使用用户级 Theo Skill 时，从源码目录同步新版 SKILL.md。测试请按工具契约中的可复现用例执行。[设计 Workspace 与工具](DESIGN_WORKSPACE.md)

打包后的工具已用桌面版随附工具库在隔离注册表验证。M5 在 DSH Desktop 0.2.1-rc.5 与 DeepSeek-V4.1-Flash · High 上完成五轮真实会话验收。

## 本地候选包

在源码目录执行 `npm pack` 可生成 `dsh-plugin-theo-0.3.0-rc.1.tgz`。在初始化过 profile 的 Mac 上完全退出 Desktop，再用内置 CLI 执行 `plugin --profile desktop add <候选包绝对路径>`。用户级 Skill 需同步随包的 `.dsh/skills/theo/`，包括 references。重新打开 Desktop 后可按 Workspace 文档复验模板流程。
