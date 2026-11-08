# DigitalDesign IR 0.3.0

DigitalDesign 支持全图校验、组合单帧求值和同步时序仿真。

## 公共入口

```js
import { validateDesign, parseDesign, fromBigInt, toBigInt } from '@theo/core'
const result = validateDesign(candidate)
if (!result.ok) console.log(result.diagnostics)
```

`validateDesign(unknown)` 返回 `{ ok: true, design }` 或 `{ ok: false, diagnostics: [{code,message,path}] }`。采用首错返回，路径指向具体字段；内部编程错误不会伪装成设计错误。`parseDesign(unknown)` 在不合法时抛出 `CoreError`，成功时返回脱离原输入对象的副本。调用方修改返回设计后，应在后续消费前重新校验。

输入为已解析的 JSON 对象，不接受 JSON 字符串或可执行函数。对象拒绝未声明字段、访问器、Symbol 和不可枚举字段，数组只接受完整索引数据；不自动改名、补初值、转换位宽或把 X/Z 变成 0。

## 顶层结构

必需字段：`schemaVersion: "0.3.0"`、`id`、`name`、`revision`、`ports`、`clocks`、`nodes`、`outputBindings`。

- `id` 及端口/节点/时钟 ID 使用 `[A-Za-z_][A-Za-z0-9_-]{0,63}`。端口、节点与时钟共享唯一命名空间；设计 id 独立。
- `name` 为 1..128 字符非空白字符串；`revision` 为 >=1 的安全整数（M1 仅校验数值，不提供版本存储）。
- 可选 `metadata` 只有 `description` 与 `teachingTopic` 两个可选字符串字段，每个最多 4096 字符。
- 最多 128 个端口、1000 个节点，位宽 1..64。组合设计允许 clocks 为空；时序设计只支持一个 `{id, edge:"rising"}` 时钟域。
- 时钟是引擎的离散边沿事件引用，不额外要求一个名为 clk 的数据端口。异步复位、多时钟和下降沿均拒绝。

端口为 `{id, direction:"input"|"output", width, signed?}`。`signed` 默认为 false。所有输出都必须且只能在 outputBindings 中绑定一次；不能为输入端口添加输出绑定。

`SignalRef` 固定为 `{nodeId, port}`。输入端口通过 `port:"out"` 引用；普通节点输出为 `out`，REGISTER 输出为 `q`。输出端口本身不能充当信号源。

## 节点判别联合

每个节点固定包含 `{id, kind, params, inputBindings}`；params 与 inputBindings 都必需，且按 kind 校验精确字段。

| kind | params | inputBindings | 输出 |
| --- | --- | --- | --- |
| CONST | width, signed?, bits | 空对象 | width 位 out |
| NOT | width, signed? | a | width 位 out |
| AND / OR / XOR | width, signed? | a, b | width 位 out |
| ADD | width, signed? | a, b | width 位 out，按模 2^width 截断 |
| EQ | width, signed?（描述两操作数） | a, b | 无符号 1 位 out |
| MUX | width, signed? | sel, whenFalse, whenTrue | width 位 out |
| SLICE | inputWidth, lsb, width | value | 无符号 width 位 out |
| CONCAT | highWidth, lowWidth | high, low | 无符号 highWidth+lowWidth 位 out |
| REGISTER | width, signed?, clockDomain, resetMode, resetActive, resetValue, initialValue | d, reset | width 位 q |

AND/OR/XOR 为二输入，多输入需显式串接。宽度与 signed 必须匹配，不隐式扩展。sel、reset 都为无符号 1 位。

SLICE 的 lsb 从最低位 0 起算，要求 `lsb + width <= inputWidth`；输入可有符号，输出按原始位切片解释为无符号。CONCAT 把 high 放高位、low 放低位，输入 signed 不影响拼接，输出总宽度不得超过 64。

REGISTER 的 resetMode 必须为 synchronous，resetActive 必须为 high，clockDomain 必须引用已声明域；resetValue 与 initialValue 为精确 width 长度的 01 字符串。节点必须声明 initialValue。仿真请求可以提供完整的初态覆盖。使能通过前级 MUX 表达。

CONST bits 同样为精确位宽的 01 字符串。

## 图校验

校验所有节点，包括与输出无关的节点：ID 唯一、引用存在且输出端口正确、输入绑定完整、位宽/符号一致、输出绑定完整、寄存器时钟合法。

使用拓扑检查拒绝组合环。REGISTER 的 q 作为本周期组合图的源，d/reset 连线仍检查存在性、位宽与符号，但不作为组合依赖边。因而合法的寄存器反馈被接受，寄存器外的组合环仍会被拒绝。同步仿真使用这个拓扑顺序，在每个上升沿原子更新所有寄存器。

错误包含 `INVALID_SCHEMA`、`INVALID_BIT_VECTOR`、`DUPLICATE_ID`、`UNKNOWN_REFERENCE`、`WIDTH_MISMATCH`、`SIGNEDNESS_MISMATCH`、`INVALID_NODE_BINDINGS`、`INVALID_DRIVER`、`COMBINATIONAL_CYCLE`、`UNSUPPORTED_CLOCKING`、`RESOURCE_LIMIT`、`UNSUPPORTED_SCHEMA_VERSION`、`UNSUPPORTED_SEMANTICS`。

## BitVector

可序列化形式为 `{width, signed, bits}`，三个字段必需，bits 为 MSB→LSB 的 01 字符串。内部转换使用 bigint，不把 bigint 放入 JSON。

- `parseBitVector(input, path?)`：严格检查并返回新对象。
- `fromBigInt(value, width, signed=false)`：按无符号或二进制补码的范围编码，超范围报 OUT_OF_RANGE。
- `toBigInt(input)`：按 signed 解释补码数值。
- `resizeBitVector(input, width)`：保留 signed；扩位进行符号/零扩展，缩位明确保留低位，可能改变数值。
- `addBitVectors(left, right)`：要求相同 width 和 signed，结果按模 2^width 截断，不输出进位或溢出标志。

## M2 组合求值

```js
import { readFileSync } from 'node:fs'
import { evaluateCombinational } from '@theo/core'

const design = JSON.parse(readFileSync('examples/combinational4/design.json', 'utf8'))
evaluateCombinational(design, { a: '1111', b: '0001', sel: '1' })
// { sum: '0000', selected: '0000', equal: '0' }
```

`evaluateCombinational(design, inputFrame)` 先校验完整设计，再按拓扑顺序计算一帧。输入对象须为每个输入端口提供一个位宽完全匹配的二值字符串。常量电路传 `{}`。结果以输出端口 ID 为键，值为保留前导零的二进制字符串。结构或输入不合法时抛出带 `code` 和 `path` 的 `CoreError`。含 REGISTER 的设计请调用 `simulate`。

NOT 在当前位宽内取反。ADD 保留结果低位，对有符号补码和无符号位型使用同一截断规则。EQ 比较同宽位型，输出一位。MUX 在 sel 为 0 时读取 whenFalse，为 1 时读取 whenTrue。

## M3 同步仿真与验证

在仓库根目录运行 `npm run build` 后，可通过 Core 仿真和验证计数器。

```js
import { readFileSync } from 'node:fs'
import { simulate, verifyAgainstReference } from '@theo/core'
import { counterReference } from './examples/counter4-decoder/reference.mjs'

const design = JSON.parse(readFileSync('examples/counter4-decoder/design.json', 'utf8'))
const request = {
  designId: design.id,
  revision: design.revision,
  initialRegisters: { counter: '1000' },
  stimuli: [
    { cycle: 0, clockEvent: 'rising', inputs: { reset: '0', enable: '1' } },
    { cycle: 1, clockEvent: 'rising', inputs: { reset: '1', enable: '1' } },
  ],
}
const trace = simulate(design, request)
trace.steps.map(step => step.outputsAfterEdge)
// [{ count: '1001', is_nine: '1' }, { count: '0000', is_nine: '0' }]
verifyAgainstReference(design, request, counterReference).status
// 'passed'
```

- 请求中的 designId 和 revision 必须匹配设计。stimuli 至少含一帧，cycle 从 0 连续编号。每帧须提供全部输入端口的定宽二值串。无数据输入的电路传 `{}`。对于纯组合设计，每帧仍使用 rising 标记，前后输出相同，寄存器状态为空。
- 默认使用每个寄存器的 initialValue。提供 initialRegisters 时，须完整列出所有寄存器的定宽初态。
- 每个周期先记录 stateBefore 和 outputsBeforeEdge，再用同一快照采样 D 和 reset。高电平同步复位优先。引擎统一提交 nextState，得到 stateAfter，并用同一输入计算 outputsAfterEdge。
- SimulationTrace 记录设计 ID、版本、语义标识、逐周期值与 warnings。用相同设计版本、首步 stateBefore 和每步 inputs 可以重建请求并回放。
- 单次限 10,000 周期、4 MiB 规范化请求 JSON 和 8 MiB 轨迹 JSON。引擎在周期边界检查 5 秒运行预算。超限抛出 RESOURCE_LIMIT。
- verifyAgainstReference 接受可信的本地 JavaScript 行为模型，模型包含 property、assumptions 和 step。step 接收 cycle、inputs 和参考模型的 stateBefore，返回 stateAfter、outputsBeforeEdge 和 outputsAfterEdge。回调与 IR 数据分开传递。
- 验证逐周期对照状态和两个边沿视图，返回 passed、failed、unsupported 或 error。出现差异时返回第一条反例，包含周期、输入、初态、信号、预期与实际位串。参考模型抛错时返回 REFERENCE_ERROR。

`npm test` 包含计数器的 64 组状态、使能与复位组合，以及 19 周期回放、寄存器互连、预算边界和旧工具回归。
