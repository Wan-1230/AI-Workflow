# AI Workflow — AI 工作流自动化桌面工具

可视化编排 + Agent 自主决策的本地优先工作流引擎。拖拽节点、连线、运行，即可构建 LLM 应用、RAG 问答、自动化流水线。

![Electron](https://img.shields.io/badge/Electron-33-47848f) ![React](https://img.shields.io/badge/React-19-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6) ![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003b57)

## ✨ 功能特性

### 工作流编排（对标 Flowise / LangFlow）
- **17 种节点**：触发器、动作、逻辑、AI、Agent、RAG 六大类，全部真实可运行
- **可视化画布**：拖拽放置、连线、框选、双击配置、缩放平移、迷你地图
- **编辑体验**：撤销/重做（60 步历史）、复制/粘贴、节点克隆、自动布局
- **导入导出**：工作流一键导出 / 导入 JSON，支持多项目管理与模板
- **多项目库**：新建（空白/示例模板）、复制、重命名、删除，本地持久化

### 运行执行
- **DAG 引擎**：拓扑排序 + 并行分组执行，条件分支（True/False 双出口）、循环、子工作流递归嵌套
- **LLM 流式输出**：运行面板实时显示模型回复（打字机效果），节点执行状态高亮
- **变量系统**：`{{nodeId.field}}` 跨节点引用、`{{global.KEY}}` 全局变量、`{{env.VAR}}` 环境变量、`{{credentials.KEY}}` 安全凭证，内置 `json()/now()/length()` 等函数
- **中断控制**：运行中可随时停止，取消联动传导到子工作流；取消按执行 id 精确命中，并发运行互不干扰
- **容错策略**：每个节点可配置超时、重试、失败处置（中断 / 跳过继续 / 重试后跳过 / 走错误分支）；超时真正中止底层请求
- **调试反馈**：节点级日志（时间/节点/消息/输出展开）、耗时统计、失败节点友好报错、历史执行详情回看

### 本地数据
- 项目库、模型库（API Key 使用系统安全存储加密）、提示词库、执行历史、设置全部存于本地 SQLite
- 深浅色主题（跟随系统/手动切换）持久化

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式（热更新）
pnpm dev

# 类型检查
pnpm typecheck

# 构建
pnpm build

# 打包安装包
pnpm package
```

> 前置要求：Node.js 18+、pnpm。首次安装会自动下载 Electron 二进制。

## 📖 快速上手

1. **配置模型**：底部导航 →「模型」→ 添加模型（OpenAI 兼容接口，如 DeepSeek / 通义千问），填入 API Key（加密存储），可点击「测试」验证连通性，并设为默认模型
2. **创建项目**：「首页」→「新建项目」，选择空白画布或示例模板（LLM 对话 / RAG 问答 / 文本流水线）
3. **编排节点**：从左侧面板拖拽节点到画布，从输出口连线到下游节点；点击节点在右侧面板配置参数
4. **运行调试**：点击「运行」执行，底部运行面板实时展示日志与流式输出，节点高亮显示状态

## 🧩 节点清单

| 类别 | 节点 | 说明 |
| --- | --- | --- |
| 触发器 | ⚡ 手动触发 | 点击运行启动工作流 |
| 动作 | 🌐 HTTP 请求 | GET/POST/PUT/DELETE，支持请求头与请求体 |
| 动作 | 💻 代码执行 | 运行 JavaScript，`input` 为上游数据；打包环境无独立 worker 文件时回退到 vm 白名单沙箱 |
| 动作 | 🔔 通知输出 | 向运行日志输出消息（info/warning/error） |
| 动作 | ✂️ 文本处理 | trim/replace/split/slice/join/正则 六种操作 |
| 动作 | 📄 文件读写 | 读取或写入本地文件（UTF-8/Base64） |
| 逻辑 | 🔀 条件分支 | 九种运算符，True/False 双出口路由 |
| 逻辑 | 🔁 循环 | 逐项执行画布上的循环体（`loop → … → loop-end`），无循环体时退化为逐项模板渲染 |
| 逻辑 | 🏁 循环结束 | 声明循环体到哪里为止；循环之后的续行接在循环节点的 `done` 出口上 |
| 逻辑 | 📌 变量设置 | 写入全局变量，`{{global.KEY}}` 引用 |
| 逻辑 | 📂 子工作流 | 嵌套执行内嵌工作流 JSON，「输入数据」字段（可插值）注入为 `{{global.sub_input}}` |
| AI | 🤖 LLM 调用 | OpenAI 兼容接口，支持流式输出、系统/用户提示词 |
| AI | 📝 提示词模板 | `{{varName}}` 占位符渲染，缺失变量提示 |
| Agent | 🛠️ 工具调用 | 内置工具（HTTP/时间/数学/UUID）或 MCP 服务器工具；HTTP 工具继承超时、取消与出网校验 |
| Agent | 🧠 子 Agent 委派 | 以角色提示词委派 LLM 完成子任务 |
| RAG | 📚 文档入库 | 切分入库，按内容哈希去重；填「向量模型名」后改用语义 embedding |
| RAG | 🎯 向量检索 | TF-IDF 或 embedding 余弦检索，索引落盘，重启后仍在 |

## 🔧 变量与插值语法

节点配置中的文本字段（提示词、URL、路径等）支持：

| 语法 | 含义 | 示例 |
| --- | --- | --- |
| `{{nodeId.field}}` | 引用上游节点输出 | `{{http1.data.items}}` |
| `{{nodeId}}` | 引用整个输出对象 | `{{llm1}}` |
| `{{global.KEY}}` | 全局变量（变量按钮配置） | `{{global.myVar}}` |
| `{{env.VAR}}` | 环境变量 | `{{env.USERPROFILE}}` |
| `{{credentials.KEY}}` | 安全凭证（主进程加密） | `{{credentials.github_token}}` |
| `{{input}}` | 当前节点上游输入聚合 | 任意节点，单上游时即该上游输出 |
| `{{item}}` / `{{index}}` / `{{count}}` | 循环体逐项上下文 | 循环体内的任意节点 |
| `{{<loopId>.item}}` | 指定循环的当前项（嵌套时用） | 内层循环体内 |

内置函数：`{{json(obj)}}`、`{{now()}}`、`{{timestamp()}}`、`{{length(arr)}}`。

## 🏗️ 架构概览

```
├── electron/                 # Electron 主进程
│   ├── main.ts               # 窗口 + IPC + 各存储初始化 + 执行注入模型
│   ├── preload.ts            # 安全桥接（contextBridge 暴露 ~40 个 API）
│   └── engine/               # 工作流引擎
│       ├── index.ts          # 引擎：拓扑排序 / 并行分组 / 子工作流递归 / 流式事件
│       ├── executor/         # 执行器：变量解析 / 插值 / 超时 / 重试
│       ├── nodes/            # 节点注册表 + 17 个节点实现
│       ├── mcp/              # MCP 客户端（stdio 子进程 / HTTP JSON-RPC）
│       ├── net/              # 出网安全：SSRF 判定与带超时/取消/体积上限的 fetch
│       ├── rag/              # 切分、TF-IDF 与 embedding 索引、落盘
│       ├── scheduler/        # 拓扑排序（Kahn）与并行分组
│       └── templates.ts      # 4 个工作流模板构建器
├── packages/shared/          # 前后端共享类型（workflow/project/model/prompt/settings）
└── src/                      # 渲染进程（React 19 + Zustand + ReactFlow）
    ├── stores/               # node-definitions（schema 驱动）/ workflow-store / app-store
    ├── components/ui/        # 设计系统基元（Button/Input/Modal/Tabs/Toast...）
    ├── components/canvas/    # 画布（WorkflowCanvas / BaseNode / edges）
    ├── components/panels/    # 节点面板 / 配置面板 / 运行面板 / 工具栏
    ├── components/shell/     # 顶栏 / 底部药丸导航
    └── pages/                # 首页 / 编辑器 / 模型 / 提示词 / 日志 / 设置
```

**引擎执行流程**：渲染进程提交 `WorkflowDefinition` → 主进程解析节点依赖（Kahn 拓扑排序）→ 无依赖节点并行分组执行 → 节点结果写入共享 Map → `{{nodeId.field}}` 插值解析 → 事件流（node:start/complete/error/stream）实时推送到前端 → 汇总 `WorkflowExecutionSummary` 持久化到历史库。

## 💾 数据存储

所有数据位于 Electron `userData` 目录（Windows: `%APPDATA%/ai-workflow`）：

| 文件 | 内容 |
| --- | --- |
| `projects.db` | 项目库（工作流 JSON） |
| `models.db` | 模型配置（API Key 经 safeStorage 加密） |
| `prompts.db` | 提示词模板库 |
| `executions.db` | 执行历史 |
| `settings.db` | 应用设置 |
| `credentials.db` | 安全凭证（值经系统密钥环加密；密钥环不可用时拒绝启动） |
| `app.db` | 数据库迁移版本与迁移记录（含每次破坏性迁移的备份路径） |
| `rag-index.json` | RAG 索引落盘（scheme + 分块 + 词频/embedding 向量），可删可备份 |
| `backups/` | 破坏性迁移前的 `VACUUM INTO` 全量备份 |

## 📦 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 开发模式（主进程/预加载热重启 + 渲染进程 HMR） |
| `pnpm typecheck` | TypeScript 严格类型检查 |
| `pnpm build` | 构建到 `out/` |
| `pnpm preview` | 以构建产物运行 |
| `pnpm package` | 构建 + electron-builder 打包安装程序 |
| `pnpm lint` / `pnpm format` | ESLint 修复 / Prettier 格式化 |
| `pnpm lint:check` | ESLint 校验（不改文件，CI 用） |
| `pnpm test` / `pnpm test:watch` | Vitest 单测与集成测试 / 监听模式 |
| `pnpm test:coverage` | 测试覆盖率 |

## ⚠️ 当前状态与已知限制

诚实清单，避免文档跑在实现前面：

- **仅 Windows 验证**：原生模块与打包链路都在 Windows 上跑通；Linux/macOS 未验证，CI 亦只跑 `windows-latest`。
- **RAG 默认仍是词法检索**：不填「向量模型名」时是 TF-IDF（含 IDF 与长度归一），不是语义检索；填了才调 `/embeddings`。两种分数不可比，切换需清空索引重建（节点里有「入库前清空索引」）。
- **SSRF 防护有已知边界**：按解析后的 IP 判定并逐跳复检重定向，但 Node 的 fetch 不支持注入 resolver，「校验后 DNS 重绑」这一类攻击面无法在本层关闭。所以 `allowPrivateNetwork` 只对你自己写的 URL 可信。
- **远程 MCP 是 HTTP JSON-RPC，不是 SSE**：只向 `${url}/messages` POST，没有 event-stream 订阅与会话 id。
- **循环串行、无 break/continue**：循环体逐轮串行执行，中途失败按该节点的执行策略处置（`stop` 会中止整个运行）。单次迭代项数上限 500。
- **无崩溃上报与匿名统计**：本地优先，因此出问题只能靠 `%APPDATA%/ai-workflow` 下的日志与 `backups/` 排查。
- **UI 无 DOM 级测试**：渲染层里可下沉的逻辑（日志缓冲、事件归约、虚拟列表区间、焦点/菜单键盘、导入判定）有纯函数测试，但组件渲染、拖拽与真实焦点行为仍靠人工验证。

## 🔄 变更说明

### 运行面板与画布不再随事件抖动（行为变更）

一次运行里，每个节点事件原先会连做两次 store 写入，而画布上每个节点都订阅整份
store —— 于是 20 个节点的运行会把整张图重渲染几十遍，日志还是无界增长、每行都挂着
完整输出对象。现在：

- 节点只订阅自己那一个状态；一个事件归约成一次写入；LLM 流式增量按帧合并（每个 token
  刷新一次会变成每字重渲染）。
- 日志上限 2000 行，超出丢最旧并在面板上明说"已丢弃更早的 N 条"；每行只保留截断到
  2048 字符的输出预览，点开在列表下方的固定区域看。
- 日志改用定高虚拟列表；用户往上翻看早期日志时不再被新日志拽回底部。

### 配置编辑现在可撤销

以前改提示词、改超时这类编辑根本不进撤销栈（只有增删节点和连线才算），
按错一下只能手动改回来。现在它们会入栈，并且同一字段的连续输入在 600ms 内合并成一条
历史 —— 打十个字不需要按十次 Ctrl+Z。

### 导入工作流现在会先校验

以前只检查"有没有 nodes 数组"，坏结构会一路走进画布：未知节点类型被兜底成通用节点、
悬空连线照单全收，等到运行时才炸。现在导入前先跑执行前用的同一套校验器，
有结构错误就给出带节点 id 的清单并**拒绝导入**；只有提醒（如引用了未声明的输出名）
时照常导入并提示。



### RAG：去重、落盘，以及可选的真语义检索（行为变更）

以前「文档入库」是往一个模块级内存单例里塞裸词频：重启即清空，而且同一段文本每跑一次
就多一份拷贝，Top-K 会被同一篇文档的 N 份重复片段塞满。现在：

- 索引按内容哈希去重，落在 `userData/rag-index.json`（tmp+rename 原子写），重启后仍在；
- 打分改成 TF-IDF，IDF 在检索时计算，所以增删文档不需要重算任何历史向量；
- 填了「向量模型名」才会去调 `/embeddings`，此时是真语义检索；留空仍走 TF-IDF。
  模型库里的 `model` 是聊天模型名，拿它请求 embeddings 通常 404，所以 embedding 模型名单独填，
  「向量模型来源」只负责提供 Base URL 与 Key；
- 索引会记住自己是用哪种方式建的（scheme）。方式不一致时直接报错并说明怎么重建，
  而不是悄悄退回词频 —— 那会让人以为花钱建的 embedding 生效了。

### 出网请求统一过闸（行为变更）

HTTP 节点与内置 `http-get` / `http-post` 工具此前各自裸调 `fetch`：工具那条既不判内网、
也不传 `signal`（取消之后请求还在飞）。现在都走同一层，超时/取消/10MB 上限/SSRF 一次到位。

SSRF 判定从"字符串匹配 `^127\.`"改成**按解析后的 IP**，并跟随重定向逐跳复检：
`http://2130706433/`、`http://127.1/`、`http://[::ffff:127.0.0.1]/`、以及"公共域名解析到回环"
过去都能过关，一条开放重定向更是可以直接把请求送进 `169.254.169.254`。

另外：`allowPrivateNetwork` 与 `timeoutMs` 过去在节点界面里根本没有开关（代码读得到，
catalog 没声明），于是本地工具默认连自己的本机服务都调不到。现在它们是真正的复选框与数字框，
而云元数据段（169.254.0.0/16、fe80::/10）即便打开开关也仍然拒绝。

### MCP 子进程不再泄漏

`connect()` 里只有"服务端返回 error"这一支会 `close()`，而最常见的失败形态是握手超时或
进程没输出 —— 那走 reject，异常抛出后没人管那个子进程，失败一次漏一个。现在握手的任何失败
路径都回收进程；Windows 上经 `taskkill /T /F` 连进程树一起收（只 `kill()` 会留下 npx 拉起的
node 孙进程）；应用退出时统一回收。


### 循环改为真实逐项执行（行为变更）

以前「循环」只在本节点内把数组逐项渲染成字符串，画布上它下游的节点**一次都不多跑**——
照着「每项都过一次模型」搭的链子，实际只调用了一次。

现在循环体是画布上的真实子图：

```
数组 → loop ──body──▶ 每项要跑的节点 … ──▶ 🏁 循环结束
                └────done───▶ 循环之后的汇总节点
```

- `loop` 有 `body` / `done` 两个出口，`body` 分支上的节点每项各执行一次，`done` 分支在全部轮次完成后走一次。
- 体内任意节点可用 `{{item}}` / `{{index}}` / `{{count}}`；嵌套循环用 `{{<loopId>.item}}` 区分内外层当前项。
- 每轮的节点结果留档在 `iterations` 里，循环自身输出 `results`（节点 id → 输出）供下游汇总。
- 结构非法（找不到 `loop-end`、体内成环、两个循环抢同一个终点、终点后还有连线）在**点运行时**报错并列出节点 id，不再静默少跑。
- 只想做字符串拼接的旧用法仍可用：不连 `body` 出口、只填「每项模板」时行为与以前一致。
- 单次迭代上限 500 项，超出直接报错，避免误配把几十万条数据灌进 LLM 调用。

### 未解析的变量引用改为报错（行为变更）

以前 `{{nodeId.field}}` 解析不到时会**原样把这段文本传给下游**，于是会出现"工作流跑成功、结果却是错的"——
典型症状是条件节点拿字符串 `"{{nope.field}}"` 去比较并报告通过。

现在这类情况直接失败，错误信息给出节点、字段与原因：

```
无法解析引用 {{a.nope}}（b.message）：节点 "a" 没有输出字段 "nope"，可用字段：sent/message
```

因此过去依赖这种静默行为的工作流会开始报错。这不是回退，是把错判暴露出来。
例外：`{{env.VAR}}` 缺省仍按空串处理（环境变量本就允许不存在），只写一条告警日志。

### 节点级执行策略

每个节点现在可配置超时、重试次数与间隔、以及失败处置（中断 / 跳过并继续 / 重试后跳过 / 走错误分支），
在节点配置面板底部「执行策略」中设置。缺省行为与之前一致：全局超时 + 失败即中断。
超时现在会真正中止底层请求，不再留下在飞的孤儿调用。

完整设计与阶段性规划见 `docs/superpowers/specs/`。

详细操作手册见 [docs/使用说明.md](docs/使用说明.md)。
