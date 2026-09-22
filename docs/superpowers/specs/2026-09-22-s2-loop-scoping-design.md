# S2 设计：画布内循环体与子工作流作用域

- 状态：已完成（122 项测试全绿，提交见分支末尾）
- 日期：2026-09-22
- 前置：S0（主链路做实）、S1（引擎可靠性）已完成
- 形态决定：画布内循环体 + 显式 `loop-end` 边界节点（用户在三个方案中选定）

## 1. 问题陈述

| # | 缺陷 | 证据 |
| --- | --- | --- |
| L1 | 循环是假的：只在本节点内逐项渲染模板，下游节点不会逐项执行 | `nodes/logic/loop.ts` 的 for 循环只 `results.push(rendered)`，不触发任何下游 |
| L2 | `NodeResult.iterations` 从未被写入 | `shared/workflow.ts:82` 声明 `iterations?: NodeResult[][]`，全仓无赋值点 |
| L3 | 子工作流与父级共享可变 `variables`，且流式输出未接线 | `engine/index.ts` `executeSubWorkflow` 接收 `_stream` 形参但从不使用（S0 已标注） |
| L4 | 子工作流的输入靠 `global.sub_input` 魔法字符串传递 | 无类型约束，写错即静默丢数据 |

## 2. 目标

- G1 循环体是画布上真实的子图：`loop → …→ loop-end` 之间的节点**逐项执行**。
- G2 循环体内可引用 `{{item}}` / `{{index}}` / `{{count}}` 与 `{{<loopId>.item}}`。
- G3 迭代产物落入 `NodeResult.iterations`，历史详情可逐轮回看。
- G4 嵌套循环可成立（内层循环体是外层体的子集）。
- G5 子工作流的输入改为显式声明，流式输出接通到父运行的事件流。
- G6 结构非法（无 loop-end、loop-end 不被任何 loop 支配、循环体成环）在**执行前**报错。

## 3. 非目标

- 不做 `break` / `continue` / 并行迭代（迭代串行，与现有层屏障一致）。
- 不做循环内错误分支的新语义：S1 的 onError 策略在循环体节点上照常生效，`stop` 即中止整个运行。
- 不做子工作流的跨层事务或断点续跑。

## 4. 设计

### 4.1 新增 `loop-end` 节点

catalog 增加 `logic/loop-end`：无字段（仅可选 `loopId` 留空自动探测），单入单出，**不激活任何下游**（它的出边用于"循环结束后的续行"，见 4.3）。

`loop` 节点改造：
- `sourceHandles: ['body', 'done']`
- fields 保留 items/itemsSource，删除 `template`/`mode`（模板渲染降级为一种特殊情形：无循环体时等价于旧行为，见 4.4）
- 新增输出 `results`（各轮汇总）、`iterations`（逐轮子结果）

这一步会让 `template` 字段从 catalog 消失 —— 已有项目 JSON 里带 `template` 时，校验器按 S0 规则给"未声明配置键"**告警**而非报错，兼容不破。

### 4.2 循环体识别

```
body(loop)   = 从 loop 的 'body' 出口可达、且能到达某个 loop-end 的节点集合
endOf(loop)  = body 可达的 loop-end 节点（必须恰好一个）
done 分支    = 从 loop 的 'done' 出口可达的节点
```

约束（校验器执行，全部为 error）：

1. `loop` 必须存在 `body` 出边，且 `body` 子图内可达一个 `loop-end`；
2. 一个 `loop-end` 只能归属一个 `loop`（多义时报错并列出候选）；
3. 循环体内不得出现回到 `loop` 自身的边（真环），嵌套循环必须整体位于外层体内；
4. 循环体节点的入边若来自体外（除 `loop` 本身），报错：迭代作用域不成立。

这些规则的实现依赖图可达性计算，与 S1 已有的 `deactivateBranch` 分离，独立成
`electron/engine/graph/scopes.ts`，纯函数、可脱离引擎单测。

### 4.3 执行语义

`loop` 节点在引擎内被特殊对待（与 `sub-workflow` 同级），不再走注册表执行：

```
对每个 item（按序，串行）:
  scope = { item, index, count }
  以 body 子图构造一个内部工作流，注入 scope 后调用 runWorkflow（复用 S1 的
  per-run 中止、错误策略、事件流）
  把该轮各节点结果收集进 iterations[i]
所有轮结束后：
  loop 自身 NodeResult.output = { results, count, items }
  继续走 loop 的 'done' 出口
```

作用域注入方式：内部工作流的节点结果 Map 之外，额外提供 `scopeVars`，插值时
`{{item}}`/`{{index}}`/`{{count}}` 与 `{{<loopId>.item}}` 优先从作用域取。这样循环体内
任何节点都能拿到当前项，而不只是模板类节点。

**每轮覆盖 body 节点的 nodeResults**：使循环体下游写 `{{httpNode.data}}` 时拿到"当前轮"的值，
这与 n8n 的逐项执行语义一致，也是唯一不引入命名冲突的做法。

### 4.4 无循环体时的向后兼容

若 `loop` 只有 `body` 自环或用户仅配了 `template`（旧数据），按 4.2 规则会因"可达不到 loop-end"而报错。
为了让旧项目仍可运行，提供降级路径：**校验器对旧式 loop（带 template、无 body 子图）给告警并沿用 S1 前的逐项渲染行为**，对新式（有 body 出口）才要求完整作用域。

理由：S0 已确认旧模板从未真正跑过，所以"兼容"的意义主要在于用户手工搭过的旧循环，代价可控。

### 4.5 子工作流

- 输入改为 catalog 字段 `input`（已存在）注入到内部 `global.sub_input`——保留现有行为，但补一条校验：若子工作流 JSON 里引用了 `{{global.sub_input}}` 而父级 `input` 为空，则告警。
- 流式：把 `_stream`（S0 标注的未接线形参）真正接到 `executeSubWorkflow` 的 `runWorkflow` 调用上，父运行面板即可看到子流程内 LLM 的流式输出。
- 取消：子工作流已共享父 `AbortController`，S2 补一条测试锁定。

## 5. 测试策略

沿用 S0 的约束（原生模块 ABI 使真库测试不可行；风险逻辑做纯函数）：

1. **作用域推断纯函数**：`scopes.ts` 的 body/end/非法结构判定，用图夹具直测，含嵌套、多 loop 争用同一 end、真环、体外入边。
2. **逐项执行**：`loop → code-exec → loop-end`，断言 code-exec 每个 item 各执行一次、`iterations` 长度等于 count、`{{item}}` 在体内解析为当前项。
3. **作用域覆盖**：体内节点输出被下一轮覆盖（第二轮看到第二项）。
4. **嵌套循环**：外层 2 项 × 内层 3 项 = 内层体执行 6 次。
5. **loop 的 done 分支**：循环后节点只执行一次，拿到 `results` 汇总。
6. **旧式 loop 兼容**：仅配 `template` 的循环仍产出逐轮字符串数组（回归）。
7. **取消传播**：循环体执行中取消，立即终止且不继续后续 item。
8. **子工作流流式**：mock LLM 下断言子流程内的 `node:stream` 事件出现在父事件流中。

## 6. 验收判据

1. 上述 8 类测试通过，S0/S1 的 90 项测试零回归。
2. 画布上可搭出「数组 → 每项调一次 LLM → 汇总」并真实跑通（mock 下由测试证明，实盘由用户确认）。
3. 循环体节点在界面逐轮亮起，历史详情能看到逐轮结果。
4. 非法循环结构（缺 loop-end、争用、成环）在点运行时给出含节点 id 的中文错误。
5. typecheck / lint(--max-warnings=0) / CI 全绿。

## 7. 风险

| 风险 | 缓解 |
| --- | --- |
| `loop` 的 `sourceHandles` 由 `true/false` 改为 `body/done`，老项目里 loop 出边的 `sourceHandle` 值会变成未声明句柄 | S0 校验器会把它报成"出口句柄不存在"。需一条数据迁移把 loop 出边的句柄归一化为 `body`/清空，作为迁移 #3 |
| 每轮覆盖 body 结果，用户若期望"拿到第一轮"会困惑 | 在 README 与节点说明中写明逐轮语义；`iterations` 提供逐轮留档 |
| 作用域推断与现有分层调度耦合，可能引入难查的执行顺序问题 | 先把 `scopes.ts` 写成独立纯函数并充分单测，再接入引擎；保持 loop 与 sub-workflow 同级的特殊分支，不改公共调度路径 |


## 8. 实现期发现（写设计与写代码不是一回事）

1. **子工作流的「输入数据」字段没有消费方**。catalog 里声明了 `input`，help 也写着
   「子流程内可用 {{global.sub_input}} 引用」，但引擎只把**上游输出**塞进 `sub_input`，
   用户照着提示填的东西被整个丢弃。现在 `config.input` 参与插值后优先注入，未填才退回上游聚合。
   这条是 L4 的真实形态：不是"魔法字符串不好"，而是"字段是摆设"。
2. **`workflowJson` 必须标 `nodeRefInterpolation: false`**。它是嵌在配置里的一整段程序，
   其中的 `{{b1.text}}` 属于子图命名空间；按父图校验会报"引用了不存在的节点"，
   按父图插值更会把子流程占位符在父层就解析掉。
3. **循环体成员要对 done 下游可见**。引擎把末轮体内结果并回父层，所以
   `体内节点 → … → loop → done → 汇总节点引用体内输出` 是合法的。校验器原先只算图上的
   祖先闭包，会把这条合法引用判成"不是上游"。修法：loop 成为祖先时并入其 `scopeNodeIds`。
4. **嵌套循环要传递闭包**。归属只记直接 owner 时，构造轮次子图会把内层循环的体与终点丢掉，
   表现为内层永远 0 次迭代且不报错。`scopeNodeIds` 因此包含内层 body 与 end。
5. **旧式 `template` 字段不能删**。删掉后执行器不再认识它是"模板正文"，`{{item}}`
   被当作节点引用 → 未解析 → 直接报错，把只想做字符串拼接的存量工作流全打断。
   最终形态：字段保留、改名标注"旧式，无循环体时生效"。
6. **结构非法要拒绝启动而非拒绝单个 loop**。`analyzeLoopScopes` 一次返回所有问题，
   引擎入口把全部问题拼进一条异常，避免"修一个报一个"的往返。
7. **内层轮次的终态会外泄**。`executeLoop` 把父 `onEvent` 直接交给内层 `runWorkflow`，
   于是每轮结束都往父事件流里塞一条 `workflow:complete` / `workflow:error`，
   运行面板表现为「先失败后成功」。子工作流从一开始就过滤掉非 `node:*` 事件，循环体照此办理。
8. **体内 `stop` 失败原先被循环吞掉**。内层运行带着 error 收尾后，循环照常进入下一轮，
   最终循环节点报告 success。现在按轮检查结果：只有策略为 `stop`（含未配置时的默认）
   的失败节点才算中止 —— `skip` 已降级为 skipped、`error-branch` 本就指望失败继续走分支，两者都不该掐断循环。
