# S1 设计：引擎可靠性（可中止、可容错、可并发、引用可失败）

- 状态：待实现
- 日期：2026-09-21
- 前置：S0 已完成（见 `2026-09-21-s0-core-path-hardening-design.md`）
- 阶段定位：全链路优化程序的第 2 个 spec

## 1. 问题陈述

S0 让 16 类节点真正进入了产物并能执行，但一次真实失败就能把整条工作流打死，且失败细节不足以定位问题。

| # | 缺陷 | 证据 |
| --- | --- | --- |
| F1 | 超时只是"放弃等待"，底层任务继续跑 | `executor/index.ts` 用 `Promise.race`，`executeFn` 未被取消；在飞的 fetch / Worker / MCP 子进程成为孤儿 |
| F2 | 单个节点失败即中断整个工作流 | `engine/index.ts:115-121`：任一无错误分支的节点报错就 `break` |
| F3 | `skipped` 状态形同虚设 | `NodeResult.status` 含 `'skipped'`（`shared/workflow.ts:77`），但全仓无任何写入点 |
| F4 | 无 `workflow:error` 终态事件 | `ExecutionEventType` 只有 complete/cancelled（`shared/workflow.ts:87-95`），异常终止与正常完成在事件层不可区分 |
| F5 | 重试与 per-node 超时完全不可达 | 重试逻辑存在于 `executeWithRetry`，但渲染层从不写 `node.executionConfig`（S0 已确认全仓 `executionConfig` 仅出现在类型定义） |
| F6 | 并发执行互相踩踏 | `src/main/index.ts` 用模块级 `currentExecutionId`，两次 `workflow:execute` 会互相覆盖，`workflow:cancel` 因此可能取消错误的运行 |
| F7 | 未解析的引用静默变成字面量文本 | `executor/index.ts:179-229` 解析失败时 `return \`{{${trimmed}}}\``，下游（尤其条件节点）拿字面量比较并报告成功 |
| F8 | 每次重试/每层调用累积 abort 监听器 | `executor/index.ts:118-122`、`142-145` 每次 attempt 都 `signal.addEventListener('abort', …)`；`http-request.ts`、`llm/client.ts` 把监听器挂在长生命周期 signal 上且不释放 |

## 2. 目标与非目标

### 目标

- G1 超时能真正中止底层工作（fetch / Worker / MCP 请求），且中止后可区分「超时」与「用户取消」。
- G2 节点级错误策略 `onError: stop | skip | retry-then-skip | error-branch`，默认 `stop` 保持现有行为。
- G3 `skipped` 成为真实终态；工作流有 `workflow:error` 终态事件。
- G4 重试与超时在 UI 上可配置（此前有代码无入口）。
- G5 并发执行互不干扰，取消按 executionId 精确命中。
- G6 未解析引用变为显式错误，不再静默降级为字面量。
- G7 消除 abort 监听器与定时器的累积。

### 非目标

- 循环逐项执行下游、子工作流上下文隔离 → S2。
- 真 embedding 与向量持久化 → S3。
- 数据库合并、前端选择器化 → S4。
- **不改动**现有工作流 JSON 格式的兼容性：`executionConfig` 仍为可选字段，缺省行为与今天一致（30s→现为 120s 的超时、失败即中断）。

## 3. 设计

### 3.1 执行上下文与取消传播（G1、G8）

`ExecutionContext` 增加 `signal: AbortSignal`（已有）之外，为**每次 attempt** 派生独立控制器：

```ts
// executor.executeWithTimeout
const attempt = new AbortController()
const onParentAbort = () => attempt.abort(new Error('执行已取消'))
context.signal.addEventListener('abort', onParentAbort, { once: true })

const timer = setTimeout(
  () => attempt.abort(new DOMException(`节点执行超时 (${timeout}ms)`, 'TimeoutError')),
  timeout
)
try {
  return await executeFn({ ...nodeContext, signal: attempt.signal })
} finally {
  clearTimeout(timer)
  context.signal.removeEventListener('abort', onParentAbort)   // 关键：F8 的泄漏点
}
```

要点：

- 超时通过 `attempt.abort()` 传导，节点实现只需诚实使用 `ctx.signal`（`http-request` 已透传 `signal` 给 fetch；`llm/client` 需检查；`code-exec` 已有 abort→terminate 路径）。
- `Promise.race` 之后不再遗留竞争：唯一的 promise 就是 `executeFn`，由 signal 负责终止。
- 超时错误用 `TimeoutError` 名字标记，供 3.2 区分是否值得重试。
- 节点内部若在 abort 后仍 resolve（未协作实现），结果被丢弃并记 error —— 引擎不假装它能取消别人的代码；不协作的实现（MCP 未接 signal）在 S3 处理，本阶段先保证已协作的被真正中止。

### 3.2 错误策略（G2、G3、G4）

扩展共享类型：

```ts
export type NodeErrorStrategy = 'stop' | 'skip' | 'retry-then-skip' | 'error-branch'

export interface NodeExecutionConfig {
  timeout?: number
  retry?: RetryConfig
  /** 失败处置，缺省 'stop'（与历史行为一致） */
  onError?: NodeErrorStrategy
  /** onError='error-branch' 时使用的出口句柄 id，缺省 'error' */
  errorHandle?: string
}
```

引擎侧语义：

| 策略 | 行为 |
| --- | --- |
| `stop` | 现状：标记 error，终止工作流，发 `workflow:error` |
| `skip` | 该节点记 `skipped`（保留已产生的部分输出为空对象），继续其余分支 |
| `retry-then-skip` | 先按 `retry` 配置重试；耗尽后按 `skip` 处理 |
| `error-branch` | 节点记 `error`，但**不**终止；仅激活 `errorHandle` 出口上的下游，正常出口下游记 `skipped` |

配套改动：

- `activeNodes` 的分支停用逻辑从「仅 condition」推广为通用的 `deactivateBranch(nodeId, keepHandle)`，条件分支与错误分支复用同一条路径。
- `skipped` 节点必须写入 `nodeResults` 并发 `node:skipped` 事件（新增到 `ExecutionEventType`），否则 UI 会像 S0 修掉的 E7 那样永久转圈。
- 超时不重试（`TimeoutError` 直接按策略处置），避免对不可恢复的慢调用做放大；网络/HTTP 5xx 等常规错误可重试。

UI 入口（G4）：`NodeConfig` 增加折叠区「执行策略」，字段为 schema 驱动之外唯一需要通用化的部分，因为它对所有节点同构：

- 超时(ms) 数字
- 重试次数 / 间隔(ms) 数字
- 失败处置 下拉（4 值）
- 错误出口句柄 文本（仅 error-branch 时显示）

写入 `node.executionConfig`，保存链路已存在（`workflow-store.updateNodeExecutionConfig` 新增，`toWorkflowJSON` 透传）。

### 3.3 并发执行隔离（G6）

- 主进程去掉模块级 `currentExecutionId`，改为 `const activeRuns = new Map<string, { startedAt: number }>()`。
- `workflow:execute` 生成并返回 `executionId`；渲染层保存本次 id。
- `workflow:cancel(executionId)` 按 id 取消（preload 与 `electron.d.ts` 同步签名）。
- 引擎 `execute()` 已按 runId 持有 AbortController，无需改动其内部结构。
- 历史落库使用各自 run 的真实起止时间，不再共享变量。

渲染层 `workflow-store` 相应记录 `currentExecutionId`，使「停止」按钮只作用于自己启动的那次运行。

### 3.4 类型化引用解析（G7）

`resolveString` 的解析失败从「返回原文」改为「抛错」，并给出可定位信息：

```ts
throw new Error(`无法解析引用 {{${trimmed}}}：${原因}（节点 ${nodeId} 字段 ${key}）`)
```

分层处理，避免把「配置里引用了尚未执行的节点」这类结构问题误判为运行期错误：

- S0 的 `validateWorkflow` 已在执行前拦住「引用不存在的节点 / 非上游 / 自依赖」，因此运行期仍解析不到，属于真实异常，应当失败而非静默。
- 保留 `{{credentials.KEY}}`、`{{env.VAR}}` 的宽松语义：凭证缺失时报错（这是配置问题，需要用户知道），但 `env` 未定义时按空串处理并告警 —— 环境变量本就允许缺省。
- 数组/对象插值到字符串模板时维持 JSON 序列化，但新增 `{{nodeId.field}}` 的目标类型与 catalog 声明端口类型不一致时记告警（不做硬失败，避免误伤动态结构）。

⚠️ 这是本 spec 中**唯一会改变既有工作流行为**的项：以前"能跑但结果错"的工作流，之后会明确报错。这正是目的，但需要在 README 的变更说明中写明。

### 3.5 资源与监听器清理（G8）

- executor：per-attempt 监听器在 finally 中移除（3.1 已含）。
- `delay()`：复用同一模式，取消时移除监听。
- `http-request.ts` / `llm/client.ts`：给长生命周期 signal 注册的监听器加 `{ once: true }` 并在响应体读完后移除。
- MCP 请求定时器已在 S0 修复。

## 4. 测试策略

沿用 S0 的约束：`better-sqlite3` 只有 Electron ABI，测试不依赖真实数据库；风险逻辑做成纯函数。

1. **中止真传导**：以 mock fetch 断言超时后 `signal.aborted === true` 且请求被取消（AbortSignal 传入 fetch init）。
2. **四种错误策略**：构造必然失败节点，分别断言 `stop` 终止、`skip` 继续且记 skipped、`retry-then-skip` 重试次数正确、`error-branch` 只激活错误出口且正常出口下游为 skipped。
3. **重试不再对超时生效**：超时错误下断言只尝试一次。
4. **并发隔离**：同时启动两个 execution，取消其中一个，断言另一个正常完成且历史状态各自正确。
5. **未解析引用报错**：绕过 validator 直接 execute，断言节点 error 且错误信息含字段定位。
6. **监听器不累积**：以 AbortSignal 的 listener 计数在多次 attempt 后不增长（`signal.listenerCount`）。
7. **回归**：S0 的 71 项测试全部保持通过，特别是「16 类节点全部放行」与取消→cancelled 两条。

## 5. 验收判据

1. `pnpm test` 全绿，含上述 7 类新测试；S0 测试零回归。
2. 人为让某 HTTP 节点指向不可达地址并配 `onError: skip`：工作流继续执行完毕，该节点显示 skipped 而非永远 running。
3. 配置 `timeout: 2000` 的 LLM 节点在超时后，进程内不再有任何在飞的该请求（以 mock fetch 的 abort 断言证明）。
4. 同一项目连续快速点击两次运行，取消第二次不影响第一次完成。
5. 写错的引用（绕过 UI 直接改 JSON）在运行时报出含节点与字段名的错误，不再产出带 `{{` 字面量的结果。
6. 类型检查、lint（`--max-warnings=0`）、CI 全绿。

## 6. 风险

| 风险 | 缓解 |
| --- | --- |
| G7 行为变更让历史"静默出错"的工作流变为显式失败，用户可能感知为"变坏了" | README 变更说明明确写出；错误信息带定位与修复建议 |
| 节点实现不协作中止（MCP、部分 fs 调用）导致中止不彻底 | 本阶段只保证已透传 signal 的路径生效，未覆盖的在 S3 逐个补，并在 §3.1 明示这一边界 |
| 错误分支推广改动 `deactivateBranch`，可能影响条件路由正确性 | S0 已有条件分支路由测试作为回归锁，先补测试再改 |
