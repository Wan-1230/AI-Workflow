# AI Workflow — AI 工作流自动化桌面工具

可视化编排 + Agent 自主决策的本地优先工作流引擎。拖拽节点、连线、运行，即可构建 LLM 应用、RAG 问答、自动化流水线。

![Electron](https://img.shields.io/badge/Electron-33-47848f) ![React](https://img.shields.io/badge/React-19-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6) ![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003b57)

## ✨ 功能特性

### 工作流编排（对标 Flowise / LangFlow）
- **16 种节点**：触发器、动作、逻辑、AI、Agent、RAG 六大类，全部真实可运行
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
| 逻辑 | 🔁 循环 | 对数组逐项渲染模板（`{{item}}`/`{{index}}`） |
| 逻辑 | 📌 变量设置 | 写入全局变量，`{{global.KEY}}` 引用 |
| 逻辑 | 📂 子工作流 | 嵌套执行内嵌工作流 JSON，`{{global.sub_input}}` 传参 |
| AI | 🤖 LLM 调用 | OpenAI 兼容接口，支持流式输出、系统/用户提示词 |
| AI | 📝 提示词模板 | `{{varName}}` 占位符渲染，缺失变量提示 |
| Agent | 🛠️ 工具调用 | 内置工具（HTTP/时间/数学/UUID）或 MCP 服务器工具 |
| Agent | 🧠 子 Agent 委派 | 以角色提示词委派 LLM 完成子任务 |
| RAG | 📚 文档入库 | 文本/文件切分（可配重叠）后建索引；当前为进程内词频向量，重启即失效 |
| RAG | 🎯 向量检索 | 词频余弦相似度检索，输出合并上下文供 LLM 引用（非语义 embedding） |

## 🔧 变量与插值语法

节点配置中的文本字段（提示词、URL、路径等）支持：

| 语法 | 含义 | 示例 |
| --- | --- | --- |
| `{{nodeId.field}}` | 引用上游节点输出 | `{{http1.data.items}}` |
| `{{nodeId}}` | 引用整个输出对象 | `{{llm1}}` |
| `{{global.KEY}}` | 全局变量（变量按钮配置） | `{{global.myVar}}` |
| `{{env.VAR}}` | 环境变量 | `{{env.USERPROFILE}}` |
| `{{credentials.KEY}}` | 安全凭证（主进程加密） | `{{credentials.github_token}}` |
| `{{input}}` | 当前节点上游输入 | 代码节点内 |
| `{{item}}` / `{{index}}` | 循环节点逐项上下文 | 循环模板内 |

内置函数：`{{json(obj)}}`、`{{now()}}`、`{{timestamp()}}`、`{{length(arr)}}`。

## 🏗️ 架构概览

```
├── electron/                 # Electron 主进程
│   ├── main.ts               # 窗口 + IPC + 各存储初始化 + 执行注入模型
│   ├── preload.ts            # 安全桥接（contextBridge 暴露 ~40 个 API）
│   └── engine/               # 工作流引擎
│       ├── index.ts          # 引擎：拓扑排序 / 并行分组 / 子工作流递归 / 流式事件
│       ├── executor/         # 执行器：变量解析 / 插值 / 超时 / 重试
│       ├── nodes/            # 节点注册表 + 16 个节点实现
│       ├── mcp/              # MCP 客户端（stdio / SSE）
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
| `app.db` | 数据库迁移版本与迁移记录（含每次破坏性迁移的备份路径） |
| `vector-store/` | RAG 索引目录（当前仅缓存分块文本，向量本体在内存，重启失效） |
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
- **RAG 是词频检索，不是语义检索**：索引为 TF 词频向量且只存内存，重启即失效。真正的 embedding 与向量持久化在计划中。
- **循环节点只渲染模板**：不会让下游节点逐项执行，`iterations` 也未落库。
- **无崩溃上报与匿名统计**：本地优先，因此出问题只能靠 `%APPDATA%/ai-workflow` 下的日志与 `backups/` 排查。
- **UI 层无自动化测试**：测试止于引擎与数据契约；界面正确性仍靠人工验证。

## 🔄 变更说明

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
