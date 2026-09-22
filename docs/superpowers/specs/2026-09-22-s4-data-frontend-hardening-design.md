# S4 设计：数据层合一与渲染进程硬化

- 状态：待实现
- 日期：2026-09-22
- 前置：S0-S3 已完成（212 项测试）
- 范围决定：数据层与前端两件事一起做，但分两次提交 —— 前端是日常体感，数据迁移是爆炸半径最大的动作，放最后单独一次，便于回退

## 1. 问题陈述

逐条经代码核对（行号为核对时点）。

### 渲染进程

| # | 缺陷 | 证据 |
| --- | --- | --- |
| F1 | 一次运行把整棵画布反复重渲染 | `BaseNode.tsx:26` 无选择器地 `useWorkflowStore()`；zustand v5 下"任何 set 都重渲染"。一个 `node:start` 触发两次 set（`setNodeStatus` + `addLog`），画布上 N 个节点就各渲染 2N 次。`React.memo`（`BaseNode.tsx:174`）被这个 hook 自己废掉 |
| F2 | 流式输出逐 token 写 store | `workflow-store.ts:488-493` 每个 chunk 一次 `setStreamChunk`，且 `streamTexts` 整个对象重建；长回答即高频重渲染 |
| F3 | 运行日志无上限、无虚拟化 | `workflow-store.ts:569` `logs: [...logs, ...]` 无界增长；`node:complete` 还把**整个节点输出对象**挂在每条日志上（`:480`）；`ExecutionLog.tsx:114` 全量 `.map` 渲染，无虚拟列表 |
| F4 | undo 存全量快照，且配置编辑不进 undo | `pushHistory` `:240-243` 每次 `structuredClone` 全部节点与边，`:246` 再 `JSON.stringify` 整个快照做去重；`updateNodeData`（`:201-207`）压根不 push，所以在右侧面板改提示词是不可撤销的 |
| F5 | 导入的工作流不做校验 | `Toolbar.tsx:57` 只查 `Array.isArray(nodes)`；`loadWorkflow:393-433` 把未知类型兜底成通用节点、连线端点是否存在都不看。真正的 `validateWorkflow` 只在 `workflow:execute` 时调用 |
| F6 | 死 IPC 面 | `workflow:save/load/list` 三条通道在渲染侧零调用（`preload` 有，UI 无），是安全审计里的多余入口 |

### 可访问性

| # | 缺陷 | 证据 |
| --- | --- | --- |
| A1 | 菜单没有键盘操作 | `TitleBar.tsx:143-178` 与 `BaseNode.tsx:130-147` 都是裸 `<button>`，没有 `role="menu"`、没有方向键、没有 `aria-expanded`；`grep onKeyDown src/components` 零命中 |
| A2 | 弹层不困焦点、不还原焦点 | `Modal.tsx:36-43` 只有 Escape；无焦点陷阱、无进入时聚焦、关闭后不还原；`HelpTutorial.tsx` 按钮写着「关闭 (Esc)」但根本没挂 keydown |
| A3 | 节点面板只能拖拽/双击添加 | `NodePalette.tsx:8-35` 是 `<div draggable>`，无 `tabIndex`、无键盘等价操作 |

### 数据层

| # | 缺陷 | 证据 |
| --- | --- | --- |
| D1 | 六个库、六条连接，无跨库外键与事务 | `storage/{index,projects,models,prompts,settings,credentials}.ts` 各自 `new Database(...)`，只有 `journal_mode = WAL`；`executions.workflow_id` 有索引却没有参照完整性 |
| D2 | 删项目留下孤儿执行历史 | `projects:delete`（`src/main/index.ts:495`）只删 projects 行；历史页继续列着打不开的运行 |
| D3 | 多语句写不加事务 | `models.ts:156-162` 设默认模型是两条 UPDATE，中途失败会出现 0 个或 2 个默认 |
| D4 | 没有 `busy_timeout` | 六处都没设；WAL 下写冲突直接抛 SQLITE_BUSY |
| D5 | 未知列变动只靠"启动时炸"发现 | S0 已建版本轨，但六库各自 `CREATE TABLE IF NOT EXISTS`，真正的列变更仍未纳入版本 |

## 2. 目标

- G1 运行期不再全盘重渲染：节点状态走窄订阅，一个事件最多一次 set，流式合并到帧。
- G2 日志有上限、有虚拟滚动、不再把整块输出留在内存里。
- G3 配置编辑可撤销；连续输入按字段合并成一条历史。（原计划改补丁式，实现前评估后放弃，理由见 §8）
- G4 导入即校验：结构问题在落到画布前就报出来，而不是运行时报。
- G5 菜单/弹层/节点面板达到可用键盘操作的最低标准（role、方向键、Escape、焦点困入与还原）。
- G6 六库合一到 `app.db`，带外键与级联、事务、`busy_timeout`，并有可回退的迁移（破坏性前置备份 + 失败拒绝启动，S0 已有骨架）。
- G7 删项目时其执行历史一并清掉（D2），且这一步与删除本身在同一事务里。

## 3. 非目标

- 不上 React Query / redux 等新的状态库；不引入虚拟化第三方依赖（自己写一个够用的定高虚拟列表）。
- 不做多窗口协同编辑，因此不做跨进程 store 同步。
- 不迁移历史执行记录的 JSON 结构（`results_json` 原样搬表）。
- 不做 a11y 的全面 WCAG 审计（那是 S5 之后独立一轮），这一轮只补"键盘能不能做完同样的事"。

## 4. 设计

### 4.1 状态订阅与事件通道

- 引入 `useShallow`（`zustand/shallow`，v5 内置）替换全部无选择器调用；`BaseNode` 只订阅自己那一个节点的状态：
  `useWorkflowStore(s => s.execution.nodeStatuses[id])` —— 选择器返回原始值，天然按值比较，不需要的节点根本不重渲染。
- 事件处理合并：`execution:update` 到达时不立即 set，先把变更压进一个模块级草稿，`queueMicrotask`/下一个微任务统一提交一次 set。取消、结束等终态事件直接提交（不能让终态排队）。
- 流式：`streamTexts` 累积到 rAF 回调里一次性提交，避免逐 token set。

### 4.2 日志

- `MAX_LOG_LINES = 2000`，超出后丢最旧并保留一条"已截断 N 条"的系统行。
- `node:complete` 不再把 `data` 整块塞进日志行：只存 `outputPreview`（截断到 2KB 的字符串）与一个 `hasOutput` 标记；要看完整输出走详情页已有的 `nodeResults`。
- 定高虚拟列表自研：容器 `onScroll` + 计算可视区间（行高固定 24px，展开行单独渲染在列表外的明细区）。为什么自研：全仓零虚拟依赖，且这轮的列表本来就是定高的。

### 4.3 undo 与配置编辑

```
type Patch =
  | { kind: 'addNode'; node } | { kind: 'removeNode'; node; edges }
  | { kind: 'moveNode'; id; from; to } | { kind: 'updateConfig'; id; from; to }
  | { kind: 'addEdge'; edge } | { kind: 'removeEdge'; edge }
  | { kind: 'relayout'; from; to }        // 自动排版这种整体动作仍存前后快照
```
- `applyPatch(reverse)` 实现 redo；历史存补丁，去重不再需要 `JSON.stringify` 全图（补丁本身就是差量）。
- 配置编辑接入：`updateNodeData` 产生 `updateConfig` 补丁；连续输入按 (节点, 字段) 在 600ms 窗口内合并成一条，避免"打十个字撤销十次"。
- 快照与补丁共存：整体动作（autoLayout、loadWorkflow）落 `relayout` 型快照补丁。

### 4.4 导入校验

- `loadWorkflow(definition, { validate })`：主进程与渲染进程共用 `@shared/validator`。渲染侧在 `Toolbar.handleImport` 里先 `validateWorkflow`，有 error 就弹出"哪个节点哪个字段"的清单（`formatValidationIssues` 已存在）并拒绝落地；只有 warning 时允许导入并提示。
- 兜底行为改掉：未知节点类型不再伪装成通用节点 —— 保留类型字符串、标红、并在导入报告里点名。理由是运行必然失败，伪装只是把失败推迟。

### 4.5 a11y 最低标准

- `Menu`：`role="menu"` / `role="menuitem"`、`aria-expanded`/`aria-haspopup`、上下键移动、Home/End、Escape 关闭并把焦点还给触发器。
- `Modal`：打开时聚焦面板内第一个可聚焦元素，Tab 循环困在面板内，关闭时还原触发器焦点，`aria-labelledby` 指向标题。`HelpTutorial` 改用 `Modal`，不再手搓。
- `NodePalette`：条目改 `<button>`，Enter/双击均可添加到画布中心；搜索框加 `<label>`。
- `Tabs`：补 `aria-controls` 与对应 `role="tabpanel"`。

### 4.6 六库合一

- 迁移 `version = 3`：`ATTACH` 各遗留库 → 在 app.db 内建
  `projects / workflows?（不新增层级）/ models / prompts / settings / credentials / executions`，
  `executions.workflow_id TEXT REFERENCES projects(id) ON DELETE CASCADE`，`PRAGMA foreign_keys = ON`，
  逐表 `INSERT ... SELECT`，行数校验后写 `migration_history`。
- 遗留文件改名 `*.db.migrated-<ts>` 保留一轮版本，不删。
- 失败路径沿用 `abortStartup`：备份 → 迁移 → 行数不符即回滚并拒绝启动。
- 六个 Store 类改为接受同一个 `Database` 句柄（构造参数从 `path` 改为 `db`），`close()` 上收到唯一的连接管理器；
  `busy_timeout = 3000`、`synchronous = NORMAL`、外键开启统一在一处设置，避免六份漂移。
- 已知限制照实写进 README：合一后单点故障面变大，靠 `backups/` 与改名保留期兜底。

## 5. 测试策略

前端逻辑同样下沉为纯函数，避免为 DOM 测试引入 jsdom/Testing Library 依赖：

1. `patches.ts`：每种补丁 `apply` / `invert` 往返一致；连续配置输入按窗口合并；`relayout` 快照补丁可用。
2. `log-buffer.ts`：超上限丢最旧并留截断行；输出预览截断到 2KB；终态不被丢弃。
3. `virtual-range.ts`：给定 scrollTop/视口高/总数，区间计算正确且首尾各多渲染一行缓冲。
4. `event-batch.ts`：多个 set 合并成一次提交；终态事件立即提交。
5. 导入校验：`validateWorkflow` 已有 17 项测试，这里补"渲染侧拒绝落地"的分支（把校验结果映射到 toast 的纯函数）。
6. 迁移：`migrations.ts` 的表映射与行数比对写成纯函数，注入假 `Database` 句柄（S0 已确立的桩法）。
7. Store 窄订阅：断言 `selectNodeStatus(store, id)` 这类选择器在无关变化下返回值同一（不需要 React 测试也能锁住主要回归）。

## 6. 验收判据

1. 上述测试通过，S0-S3 的 212 项零回归。
2. 一次 20 节点、含长流式回答的运行：日志行数不再无界增长；画布节点不因无关事件重渲染（以计数器或 React DevTools 人工验证一次）。
3. 改提示词后 Ctrl+Z 能撤销；连续输入只产生一条历史。
4. 导入一个坏 JSON（未知类型、悬空连线、重复 id）时给出带节点 id 的中文清单且画布不变。
5. 只用键盘：打开主菜单→方向键选择→Enter 执行；Modal 内 Tab 不逃出弹层、关闭后焦点回触发器；节点面板可键盘添加。
6. 老用户数据升级后项目、模型、提示词、设置、凭证、历史全在；删项目后其历史同批消失；`*.db.migrated-*` 留在原地。
7. typecheck / lint(--max-warnings=0) / build / CI 全绿。

## 7. 风险

- **迁移是唯一不可完全自动验证的一环**（原生 ABI 挡住真库测试）。缓解：破坏性前置备份、行数比对、失败拒绝启动、遗留文件改名保留而非删除。
- **补丁式 undo 会漏掉某些整体动作**，导致 undo 后状态与预期不符。缓解：整体动作一律走快照型补丁；无法识别的变化（ReactFlow 内部）不产生补丁。
- **虚拟列表改动滚动语义**，可能破坏"自动滚到最新一条"。缓解：贴底时才自动滚动，用户上翻即停止跟随。
- **外键级联**是行为变更：以前删项目留历史，现在不留。写进 README 变更说明。
