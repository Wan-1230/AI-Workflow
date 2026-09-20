# S0 设计：主链路做实（节点可执行 + 密钥不落地 + 可验证）

- 状态：待评审
- 日期：2026-09-21
- 阶段：全链路优化程序的第 1 个 spec（后续 S1 引擎可靠性 / S2 循环与子工作流 / S3 RAG 与 Agent / S4 数据层与前端硬化）
- 定位锚点：自用日常主力 → 开源项目 → 对外分发（本 spec 服务第一锚点，工程化部分同时服务第二锚点）

## 1. 问题陈述

这个软件当前**无法执行任何 AI 工作流**。不是体验问题，是主链路断裂。

`electron/engine/validator.ts:6-8` 的白名单只登记了 5 种节点类型：

```
'manual-trigger', 'http-request', 'code-exec', 'condition', 'notification'
```

而 `electron/engine/nodes/index.ts` 注册了 16 种（已逐行核对，16 个 `nodeRegistry.set`）。`electron/main.ts:133-136` 对校验失败直接硬拒绝：

```ts
const validation = validateWorkflow(wf)
if (!validation.valid) {
  return { success: false, error: `工作流校验失败: ${validation.errors.join('; ')}` }
}
```

因此任何含 `llm-call` / `prompt-template` / `loop` / `rag-*` / `tool-call` / `agent-delegate` 等工作流，点击「运行」只会返回「节点类型无效」。README 宣传的四个内置模板（LLM 对话 / RAG 问答 / 文本流水线）全部不可运行。

### 已核实的缺陷清单

| # | 缺陷 | 证据（已亲自核对） |
| --- | --- | --- |
| E1 | 校验器白名单 5 种 vs 注册表 16 种，硬阻断执行 | `validator.ts:6-8`、`nodes/index.ts`（16 个 set）、`main.ts:133-136` |
| E2 | 两套节点目录已漂移：颜色、`defaultConfig` 键集不一致 | `llm-call` 引擎 `#8b5cf6`（`nodes/ai/llm-call.ts:10`）vs UI `#165DFF`（`node-definitions.ts`）；引擎 `defaultConfig` 含 `baseUrl`/`apiKeyRef`/`model`，UI 副本无 |
| E3 | `apiKeyRef` 被当作字面量密钥使用，明文入库、写盘、回传渲染进程 | `nodes/ai/llm-call.ts:56-59`；`main.ts:198-206` 明文导出；`storage/projects.ts:113` 随 `workflow_json` 入库 |
| E4 | 模型库选择器靠魔法键名，schema 未声明 | `NodeConfig.tsx:11`「modelId 字段动态加载模型库选项」，而字段 schema 是无 options 的 `type: 'select'` |
| E5 | 30 秒超时写死，前端永不设置 | `executor/index.ts:5` `DEFAULT_TIMEOUT = 30000`；`executor/index.ts:27` 读 `node.executionConfig`；全仓 `executionConfig` 仅出现在类型定义 `packages/shared/src/workflow.ts:29`，前端零使用 |
| E6 | MCP 进程 error 事件回调内 `throw` → 未捕获异常终止主进程 | `mcp/client.ts:93-95` |
| E7 | 末组被中断的节点不回写状态，UI 停留 running | `engine/index.ts:98-99` 仅在组间边界调用 `emitCancelled`；最后一组 `Promise.allSettled` 后循环即结束，`executeSingleNode` 在 `:154`/`:209` 静默 `return` 不写结果，这些节点永不获得 `node:cancelled` |
| E7b | 被取消的执行在历史库中被记为「已完成」 | `emitCancelled`（`index.ts:367-377`）只 `onEvent`，不写入 `nodeResults`；`main.ts:165-166` 用 `[...result.values()].some(r => r.status === 'cancelled')` 推导状态，结果图无 cancelled → 恒为 false |
| E8 | 执行历史每条耗时均为伪造值 | `main.ts:173` `startedAt: Date.now() - 1, // 近似值`；`engine/index.ts:212-218` 错误结果 `duration: 0` 硬编码 |
| E9 | 历史保留策略死代码，设置项无效果 | `storage/index.ts:158` 定义 `pruneHistory()`，全仓 grep 仅此一处命中（无调用点）；`main.ts:167` 未检查 `saveHistory` 设置 |
| E10 | 渲染层小缺陷 | `theme-store.ts:52` `matchMedia` 监听器未移除；`HomePage.tsx:341` `disabled={!name.trim() && loading}` 逻辑取反，永不禁用 |
| E11 | 死代码：旧版主进程/预加载/入口副本 | `src/main/index.ts`(255) `src/preload/index.ts`(51) `src/renderer/*` `src/hooks/`(空)；真实入口为 `electron/main.ts`、`electron/preload.ts`、根 `index.html`→`/src/main.tsx`（已核对 `vite.config.ts` 与 `index.html:20`） |
| E12 | 工程化基线为零 | 无任何 `*.test.*`/`*.spec.*`，`package.json` 无 `test` 脚本，无 `.github/`，`pnpm lint` 以 29 error / 39 warning 退出码 1 |

## 2. 目标与非目标

### 目标

G1 全部 16 类节点可端到端执行，并由测试证明。
G2 API Key 不再以明文形态进入 `workflow_json`、磁盘导出文件或渲染进程；存量数据被清洗。
G3 节点元数据单一事实来源，使 E1/E2 类缺陷在结构上不可能复发。
G4 建立版本化迁移骨架，为 S4 的数据层合并预留落地路径。
G5 测试骨架 + CI 绿灯基线，使后续每个 spec 的改动可证明。

### 非目标（明确排除，后续 spec 处理）

- 循环的真实逐项执行语义、子工作流上下文隔离 → **S2**
- 真 embedding 模型、向量持久化与重启重建 → **S3**
- 超时中止贯穿底层任务、per-node 错误分支、`executionId` 并发隔离、事件驱动调度、类型化变量解析 → **S1**（本 spec 仅做 E5 的最小兜底，见 §3.6）
- 6 库合一、外键/事务全面化、前端 Zustand 窄选择器、日志虚拟化 → **S4**
- 安装包签名、自动更新、崩溃上报 → S5/S6

理由：E5 若完全不处理，S0 交付的是「能跑但一跑长文本就挂」的版本，不具备自用价值，因此把超时兜底最小程度地前伸；但完整的中止与错误分支属于引擎语义改造，前伸会让本 spec 失控。

## 3. 架构设计

### 3.1 节点目录单一事实来源

新增 `packages/shared/src/node-catalog.ts`，成为 16 个节点**唯一**的元数据定义处。

扩展 `packages/shared/src/node.ts` 的类型契约：

```ts
/** 配置面板字段 schema（由 UI 消费，引擎忽略） */
export interface NodeFieldSchema {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'json'
  help?: string
  placeholder?: string
  rows?: number
  /** 静态选项；与 dataSource 互斥 */
  options?: { value: string; label: string }[]
  /** 动态选项来源，取代 NodeConfig 内的 modelId 魔法键名（E4） */
  dataSource?: 'models' | 'credentials'
}

export interface NodeDefinition {
  id: string
  category: NodeCategory
  displayName: string
  description: string
  icon: string
  color: string
  inputs: NodePort[]
  outputs: NodePort[]
  defaultConfig: Record<string, unknown>
  fields: NodeFieldSchema[]   // 新增，必填
  /** 该类型的执行下限建议；执行器取 max(节点声明, 此值, 全局默认) —— 见 §3.6 */
  executionLimits?: { timeoutMs?: number }
}
```

`node-catalog.ts` 导出：

```ts
export const nodeCatalog: Record<string, NodeDefinition>
export const nodeCategories: { category: NodeCategory; label: string; color: string }[]
export const catalogNodeTypes: string[]        // Object.keys(nodeCatalog)
```

装配与消费关系：

- 引擎 `electron/engine/nodes/*.ts`：**保留**各文件的 `execute` 导出，**删除**各文件的 `definition` 导出（元数据移交 catalog）。`nodes/index.ts` 改为从 catalog 遍历装配：`nodeRegistry.set(def.id, { definition: def, execute: execMap[def.id] })`，`execMap` 是唯一需要维护的映射。
- 渲染进程：`src/stores/node-definitions.ts` **整个删除**（483 行）；`NodePalette` / `BaseNode` / `NodeConfig` / `workflow-store` 改为 `import { nodeCatalog } from '@shared/node-catalog'`。渲染进程在构建期直接内联 shared 常量，**不引入 IPC 往返**（避免启动期异步取目录带来的空面板态）。
- `NodeConfig` 移除 `models` 魔法分支，改为按 `field.dataSource` 分派数据源。

结构后果：catalog 是唯一源 → 颜色与 `defaultConfig` 不可能再漂移（消除 E2）；新增节点 = catalog 一条 + execute 一个文件（现为三处）。

### 3.2 校验器

`validator.ts` 的 `VALID_NODE_TYPES` 改为 `new Set(catalogNodeTypes)`，不再手工维护。

在同一文件补三条静态检查，它们都指向已知的静默失败模式：

1. **端口存在性**：`edge.sourceHandle` / `targetHandle` 若指定，必须命中该节点 catalog `outputs`/`inputs` 中声明的名字。
2. **引用可达性**：扫描节点 `config` 字符串中的 `{{nodeId.field}}`，要求 `nodeId` 存在于工作流、且沿 `edges` 反向可达当前节点（即为祖先）。引用不存在的节点直接拒绝执行 —— 这是为了阻止 `executor/index.ts:179-229` 未解析时返回原文、条件节点拿字面量比较却报成功的错误类别（该类别的完整修复在 S1，本 spec 只在入口拦住最常见的笔误形态）。
3. **未知配置键**：`config` 中出现 catalog 未声明的键 → 记为 warning，不阻断（保证向前兼容旧项目文件）。

校验结果结构扩展，使错误可定位：

```ts
export interface ValidationResult {
  valid: boolean
  errors: { nodeId?: string; field?: string; message: string }[]
  warnings: { nodeId?: string; message: string }[]
}
```

`main.ts:133-136` 的错误文案改为拼接 `errors.map(e => e.nodeId ? \`[${e.nodeId}] ${e.message}\` : e.message)`。

### 3.3 密钥链路

**语义钉死**：节点配置中不存在任何可容纳明文密钥的字段。

- `llm-call.defaultConfig` 删除 `apiKeyRef`，改为 `credentialName: ''`。`resolveModel` 的重写顺序：
  1. `modelId` 命中模型库 → 使用其 baseUrl/model/apiKey（`main.ts:147-154` 的注入路径本身是干净的，密钥仅存主进程，保持不变）；
  2. 未命中但 `credentialName` 非空 → `ctx.secrets[credentialName]` 取密钥，并要求同时提供 `baseUrl` + `model`；
  3. 两者皆空且模型库非空 → 回退默认模型（保持现行为）；
  4. 无法解析 → 抛出指向性的中文错误（保留 `llm-call.ts:63-70` 的提示风格）。
- 删除 `String(config.apiKeyRef || '')` 直用分支与 `ctx.secrets[String(config.apiKey || '')]` 分支（`llm-call.ts:56-59`）。
- catalog 中 `credentialName` 字段标 `dataSource: 'credentials'`，用户在 UI 里只能**选择**已存在的凭证名，无法粘贴明文。

**边界拦截器**：新增 `electron/engine/secrets-guard.ts`

```ts
export function looksLikeSecret(v: string): boolean      // sk- 前缀、≥32 位高熵字符集等启发式
export function findSecretPaths(obj: unknown, maxDepth = 6): string[]   // 返回命中路径，如 "nodes[3].config.apiKeyRef"
export function redactSecrets<T>(obj: T): T              // 对命中路径的值替换为 "[REDACTED]"
```

应用于三处：
- `workflow:execute` 与 `projects:saveWorkflow` 入口 → 命中即拒绝并回传具体路径（把问题挡在写库之前）；
- `projects:get` 与 `workflow:save`（磁盘导出）→ 脱敏后返回；
- 迁移 #1（见 §3.4）。

`packages/shared` 的 `ModelConfig` 已只暴露 `hasApiKey`（`storage/models.ts:58`），此项保持，测试中加断言防回归。

### 3.4 迁移骨架（从 S4 提前）

新增 `electron/engine/db/`：

```
db/
  index.ts        // openAppDb()、MigrationRunner、连接登记表
  migrations/
    001-purge-plaintext-keys.ts
  backup.ts       // VACUUM INTO 时间戳备份
```

`app.db` 承载两张表：

```sql
CREATE TABLE IF NOT EXISTS migration_history (
  name        TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL,
  backup_path TEXT
);
```

版本以 `PRAGMA user_version` 为权威整数，`migration_history` 提供人类可读审计与备份位置。

**最小侵入原则**：S0 不把 6 个库并入 `app.db`。迁移执行器在 `app.whenReady()` 内、**各 Store 构造之前**运行，自行以路径打开遗留库连接，跑完立即关闭，随后现有 Store 照常各自开库。因此 S0 完全不改动数据层结构，S4 再把遗留库并入并接管。

迁移签名：

```ts
export interface Migration {
  name: string
  version: number
  /** 需要写作的遗留库；app 为迁移框架自身的库 */
  databases: Array<'projects' | 'models' | 'prompts' | 'settings' | 'history' | 'credentials'>
  destructive: boolean
  up(ctx: MigrationContext): Promise<void>   // 已在事务内
}
```

**迁移 #1（`001-purge-plaintext-keys`，destructive=true）**：
遍历 `projects.workflow_json`，对每条用 `findSecretPaths` 扫描；命中时——
1. 将明文密钥经 `CredentialManager.set()` 升格为凭证（键名由所属节点 id 与字段名派生，例如 `purged_<nodeId>`，`displayName` 标注来源项目名）；
2. 配置值改写为该凭证名，写回 `workflow_json`；
3. 记录到迁移报告。

选择「升格而非抹除」是为了保住项目仍可运行。整体包在 `db.transaction()` 中，执行前对 `projects.db` 做 `VACUUM INTO`。迁移报告经 `dialog.showMessageBox` 展示受影响项目数量与名称（不含任何密钥内容），并写入日志文件。

**写凭证的前置条件**：`MigrationContext` 提供一个绑定到遗留 `credentials.db` 路径的 `CredentialManager` 实例（迁移在 `app.whenReady()` 内、各 Store 构造之前运行，此时 `safeStorage` 已可用）。若 `safeStorage.isEncryptionAvailable()` 返回 false，迁移 #1 **不得**以明文暂存密钥，而是中止启动并提示「系统密钥环不可用，请恢复后重试；备份位于 …」。宁可拒绝启动，也不产生第二次泄露。

**失败即中止**：任一迁移抛错 → 回滚该事务 → `dialog.showMessageBox` 报错（含备份路径）→ `app.quit()`。禁止半迁移状态继续启动。

### 3.5 崩溃与失真修复

| 缺陷 | 处理 |
| --- | --- |
| E6 `proc.on('error', () => throw)` | 改为调用已有的 `this.rejectAll(...)` 使挂起请求 reject，置 `this.dead = true`，后续 `callTool` 立即抛「客户端已失效」。error 回调内绝不 throw。 |
| E7 末组中断节点无状态 | `emitCancelled` 改为在循环结束后无条件补发一次（或令 `executeSingleNode` 在 abort 分支写 `status:'cancelled'` 结果），二选一但必须同时覆盖末组 |
| E7b 取消记为已完成 | `emitCancelled` 在发事件的同时向 `nodeResults` 写入 `{ nodeId, status:'cancelled', output:{}, duration }`；`main.ts:165-166` 改为优先信任引擎返回的终态而非结果图推导。集成测试必须覆盖「运行中取消 → 历史状态为 cancelled」 |
| E8 伪造耗时 | `engine.execute` 记录真实 `startedAt`，`main.ts:168-177` 使用引擎返回值而非 `Date.now()-1`；错误结果 `duration` 填实际耗时而非 `0` |
| E9 保留策略失效 | 启动时与每次 `saveExecution` 后调用 `pruneHistory(settings.historyLimit ?? 100)`；`saveHistory === false` 时跳过写入 |
| E10 | `theme-store` 保存并移除 `matchMedia` 监听；`HomePage.tsx:341` 修正为 `disabled={!name.trim() \|\| loading}` |

### 3.6 超时下限兜底

`executor/index.ts:5` 的 `DEFAULT_TIMEOUT` 由 `30000` 改为 `120000`；并在 catalog 为 `llm-call`、`rag-upload`、`tool-call`、`agent-delegate`、`sub-workflow` 增加 `executionLimits: { timeoutMs: 600000 }`，执行器优先采用节点声明值。

**本项不做中止**（超时仍只是 `Promise.race`，底层任务不被 cancel）——中止属于 S1 的引擎语义改造。这里只消除「长回复必失败」。

## 4. 工程化

### 4.1 测试（Vitest）

引入 `vitest` + `@vitest/coverage-v8`，`pnpm test`。不引入 Playwright（E2E 成本高，留待后续）。

三层，均运行于 node 环境（渲染层组件测试不在 S0 范围）：

1. **契约与自洽（防复发，最关键）**
   - `catalogNodeTypes` 与 `nodeRegistry.keys()` 集合相等；
   - catalog 每个 `fields[].key` 均出现在该节点 `defaultConfig`；
   - catalog 每个 `outputs[].name` 均出现在 `execute()` 返回对象键中（用 mock ctx 实际调用）；
   - catalog 无 `looksLikeSecret` 命中的默认值。
2. **单元**：`validator`（含 E1 的 16 类全部放行、引用不可达被拒、端口校验）、`secrets-guard`（探测器召回率与误报边界）、`executor` 变量解析既有行为不回归。
3. **集成**：16 个节点各 1 条端到端，`fetch`/`child_process`/`electron` 以 mock 替身注入，SQLite 走系统临时目录。断言 `node:complete` 事件顺序与最终 `NodeResult.status`。
   - 另加「LLM 对话」与「文本流水线」两个内置模板的完整跑通测试——模板是用户的第一次真实体验，必须绿。

### 4.2 CI

`.github/workflows/ci.yml`：push（main）与 PR 触发，矩阵仅 windows-latest（原生模块 better-sqlite3 与打包链路均在 Windows 验证），步骤为 `pnpm install --frozen-lockfile` → typecheck → lint → test → build。

### 4.3 仓库清理

- 删除 E11 全部死文件与空目录；
- 修完 E12 的 29 个 lint error（`prefer-const`、`no-unused-expressions`、`no-require-imports` 等），warning 中的未使用导入一并清理；`no-explicit-any` 剩余项以类型修正处理，确有必要处用 `unknown` 收窄。

## 5. 错误处理策略

- **迁移失败**：中止启动 + 对话框 + 备份路径（见 §3.4）。这是唯一允许阻断启动的路径。
- **Store 打开失败**：现状是 `main.ts:566-598` 之后各处 `store?.x() || []` 静默降级，会把「数据库损坏」显示成「你没有项目」，诱导用户重建并覆盖。改为：启动期任一 Store 构造抛错 → 记录日志 + 对话框（含 userData 路径与备份指引）+ `app.quit()`。运行期 IPC handler 的 catch 必须区分「无数据」与「读取失败」，后者返回 `{ success: false, error }` 且不得返回空数组。
- **凭证解密失败**：现状 `credentials.ts:74,90` 静默 `return null` / `catch {}`。改为在 `getAll()` 聚合失败项，若本次执行引用的凭证解密失败，节点以明确错误终止：「密钥环不可用，请在设置中重新录入凭证」。
- **节点执行错误**：维持现有 `node:error` 语义（错误分支属于 S1），但结果需带 `nodeType`、`attempt`、真实 `duration`，不含堆栈以外的敏感上下文。

## 6. 验收判据

全部可自动或明确验证，任一不满足即视为未完成：

1. `pnpm test` 全绿，且包含 16/16 节点集成测试与 2 个模板端到端测试。
2. 在应用内新建含 `llm-call` 的工作流并运行 → 实际收到模型回复（人工确认一次；同时由测试覆盖）。
3. `grep -rE "VALID_NODE_TYPES\s*=\s*new Set\(\[" electron/` 无硬编码类型列表。
4. `nodeCatalog` 为唯一节点元数据源；`src/stores/node-definitions.ts` 不存在。
5. 对 `projects.db` 全文扫描：无匹配 `looksLikeSecret` 的值残留；导出 JSON 与 `projects:get` 返回值中密钥位置为 `[REDACTED]` 或凭证名。
6. 启动日志显示迁移执行记录与 `user_version`；人为注入一条失败迁移后，应用中止启动并弹出含备份路径的错误。
7. 关闭含 MCP 节点的工作流期间 kill 掉 MCP 子进程 → 主进程不退出，节点以 error 结束。
8. 运行中点「停止」→ 所有节点状态在 1 秒内落到终态，无节点停留 running（含最后一组并行节点）；且该次执行在历史库中的状态为 `cancelled` 而非 `completed`（E7/E7b）。
9. 执行历史中每条 `duration_ms` 为真实值（与日志时间差一致）。
10. `pnpm lint` 与 `pnpm typecheck` 退出码 0；CI 在远端首次跑绿。
11. 删除死代码后 `pnpm build` 产物体积不增，`out/main` 入口唯一。

## 7. 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| 迁移改写 `workflow_json` 造成项目不可用 | `destructive` 迁移前 `VACUUM INTO` 全量备份；备份路径写入 `migration_history` 并在对话框展示；§6.5/§6.6 强制验证 |
| catalog 合并遗漏前端隐式约定（如 E4 魔法键名） | `NodeConfig` 改为纯 schema 驱动，`dataSource` 显式声明；§6.2 模板测试覆盖 UI 消费路径 |
| 超时放宽到 120s/600s 后，卡死节点占用时间变长 | 中止能力缺席是 S1 事项，本 spec 明确记录该取舍；运行面板已有「停止」入口可人工终止 |
| Windows 专属 CI 掩盖跨平台问题 | 记录为已知限制；项目当前只发 Windows 产物 |
| 一次改动面覆盖 §1–§4 | 按 §3.1 → §3.2 → §3.3 → §3.4 → §3.5 → §4 顺序分批提交，每批保持 typecheck+build 绿，符合仓库既有「小步提交」约定 |

## 8. 交付顺序建议（供实现计划展开）

1. 仓库清理 + Vitest/CI 脚手架（先让绿灯成为可能）
2. §3.1 catalog 单一事实来源（最大改动面，且被后续所有项依赖）
3. §3.2 校验器
4. §3.6 超时下限（让节点真的能跑完）
5. §3.5 E6/E7/E8/E9/E10
6. §3.3 密钥链路 + §3.4 迁移骨架与迁移 #1
7. §4.1 补齐 16 节点与模板测试，§5 错误处理策略
8. §6 验收逐条核对

其中 2 与 3 完成后即可解锁「节点能跑」的验证，可提前人工试用一次再进入 5/6。
