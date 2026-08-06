# AI 工作流 Agent — 完整迭代重构方案

> 目标：对标 Flowise / LangFlow / AutoGen-Studio / Dify 等成熟开源 AI 工作流产品，
> 达到商用级产品体验。前端全部重构 + 功能全数完善，输出可本地运行、可持续迭代的工程代码。

---

## 一、现状目录梳理

```
AI工作流自动化工具/
├── electron/                    # 主进程（Electron）
│   ├── main.ts                  # IPC 注册 / 窗口管理 / 引擎初始化
│   ├── preload.ts               # contextBridge 暴露 window.api
│   └── engine/                  # 工作流执行引擎
│       ├── index.ts             # WorkflowEngine（DAG 调度 / 条件分支 / 取消）
│       ├── scheduler/           # 拓扑排序（Kahn）+ 并行分组
│       ├── executor/            # 变量插值 / 超时 / 重试
│       ├── parser/              # 工作流 JSON 校验解析
│       ├── nodes/               # 节点注册表（现有 5 类）
│       │   ├── triggers/manual-trigger
│       │   ├── actions/{http-request, code-exec, notification}
│       │   └── logic/condition
│       └── storage/             # better-sqlite3（执行历史 + safeStorage 凭证）
├── packages/shared/src/         # 前后端共享类型（workflow/node/agent）
├── src/                         # 渲染进程（React 19）
│   ├── App.tsx                  # 顶部 Toolbar + 三栏布局（无底部 Tab）
│   ├── components/canvas/       # ReactFlow 画布 + 节点渲染
│   ├── components/panels/       # NodePalette/NodeConfig/Toolbar/ExecutionLog/History
│   ├── stores/                  # Zustand（workflow-store / node-definitions）
│   └── lib/                     # electron.d.ts / yaml-converter
├── tailwind.config.js           # ⚠️ 存在两个 export default（构建阻塞 bug）
└── vite.config.ts               # electron-vite（main/preload/renderer 三端 alias）
```

### 现有能力盘点
- **引擎**：DAG 拓扑调度、同层并行、AbortController 取消、条件分支路由、变量插值
  `{{nodeId.field}}` / `{{credentials.KEY}}` / `{{env.VAR}}` + 内置函数、超时与重试。
- **节点**：manual-trigger / http-request / code-exec / condition / notification（仅 5 类）。
- **存储**：executions.db（执行历史）、credentials.db（safeStorage 加密 API Key）。
- **前端**：ReactFlow 画布、Zustand 状态、节点拖拽连线、基础执行日志。

### 距目标的核心差距
| 维度 | 现状 | 目标 |
|------|------|------|
| AI 节点 | 无 LLM / 提示词 / RAG / Agent | 全链路 AI 节点 |
| 流程控制 | 条件 + 并行 | + 循环、子工作流嵌套 |
| 变量系统 | 插值模板 | 全局变量 + 节点输出变量跨节点传递 |
| 多项目 | 单文件存取 | 项目库 CRUD（新建/复制/重命名/删除） |
| 前端导航 | 单画布 + 顶栏 | 底部 Tab 多视图（项目/模型/提示词/日志/设置） |
| 主题 | 无深色模式 | 深浅色 + 本地持久化 |
| 交互 | 基础 | 撤销重做/复制粘贴/框选/快捷键/自动布局 |

---

## 二、风险点与应对

1. **tailwind.config.js 双 `export default`（阻塞构建）**
   - 风险：`electron-vite build` / `tsc` 直接报错，任何 UI 工作都无法推进。
   - 应对：**最先修复**，合并为单一设计系统配置。

2. **Electron + better-sqlite3 原生模块兼容**
   - 风险：`postinstall: electron-builder install-app-deps` 重建原生模块，版本不匹配会崩溃。
   - 应对：保持 better-sqlite3 版本稳定，避免引入额外原生依赖；向量存储用**纯 JS 余弦相似度**实现（不引重型向量库）。

3. **LLM 调用在主进程阻塞 / 流式**
   - 风险：同步 fetch 阻塞主进程；流式输出需要事件推送到渲染进程。
   - 应对：主进程用 `fetch` + `AbortController`，通过 `webContents.send` 推送流式增量事件；全部异步 Promise 化。

4. **MCP 协议接入复杂度高**
   - 风险：完整 MCP SDK 依赖重、stdio 子进程管理复杂。
   - 应对：实现轻量 MCP **客户端骨架**（stdio / SSE transport + tools/list + tools/call），保证可扩展但不阻塞主流程。

5. **前后端类型漂移**
   - 风险：节点配置、执行事件在 main/renderer 两端各写一套导致不一致。
   - 应对：所有类型收敛到 `packages/shared`，renderer 通过 alias `@shared` 引用，单一事实来源。

6. **重构期间保证可构建**
   - 风险：大范围改动中途构建失败难以回退。
   - 应对：**每完成一个模块即跑 `tsc --noEmit` + `electron-vite build`**，小步提交。

---

## 三、设计系统（统一规范）

- **Token 化**：颜色/圆角/阴影/间距全部 CSS 变量 + Tailwind 引用，深浅色一键切换。
- **配色**：浅色冷灰 slate + indigo 强调；深色 slate-900 系；节点功能色（蓝/绿/琥珀/紫/红）区分类型。
- **圆角**：统一 8px 基准（sm 6 / md 10 / lg 12 / xl 16）。
- **字体**：Inter（正文）/ JetBrains Mono（代码）。
- **持久化**：主题、窗口偏好写入 localStorage + 主进程 settings 存储。
- **组件**：Button / Input / Select / Modal / Toast / Tabs / Tooltip / EmptyState / Spinner 统一封装。

---

## 四、分阶段任务（交付顺序）

### Phase 1 — 方案文档 ✅（本文档）

### Phase 2 — 基建与修复
- 修复 tailwind 双 export bug
- 设计系统 CSS 变量 + 深浅色 + 主题持久化
- UI 基元组件库

### Phase 3 — 前端外壳与导航
- 应用外壳：顶栏 + 底部 Tab 药丸导航（对比色高亮 + 滑块动效）+ 视图路由 + 全局 Toast

### Phase 4 — 前端功能页
- 项目列表页（CRUD + 模板 + 空状态）
- 画布编辑器增强（撤销重做/复制粘贴/框选/快捷键/自动布局/导入导出/快照）
- 节点配置面板（schema 驱动 / 双击打开侧边面板）+ 运行面板
- 模型配置页（多 Key / 加密 / 连通性测试）
- 提示词模板库页（CRUD / 分类 / 收藏 / 搜索）
- 运行日志页（级别 / 输入输出展开 / 耗时）+ 设置页

### Phase 5 — 后端能力
- 共享类型扩展（变量 / 流式 / MCP / 模型 / 项目）
- LLM 客户端（OpenAI 兼容）+ 轻量向量存储
- 新增节点：llm-call / prompt-template / text-process / file-io / variable-set /
  loop / sub-workflow / tool-call(MCP) / rag-retrieve / agent-delegate
- 引擎升级：循环执行、全局变量、流式事件、运行时节点高亮

### Phase 6 — 存储与 IPC
- 项目库 / 模型库 / 提示词库持久化（SQLite）
- IPC handlers + preload API 扩展

### Phase 7 — 验证与文档
- `tsc --noEmit` + `electron-vite build` 全量通过
- README（启动/构建/功能清单）+ 使用说明文档

---

## 五、禁止行为自检
- [ ] 不写大量 `any`，严格类型
- [ ] 每个节点具备真实可运行逻辑，非静态 Demo
- [ ] 所有异步操作有 loading / 错误提示 / 重试
- [ ] 深色 + 浅色主题完整，配置持久化
