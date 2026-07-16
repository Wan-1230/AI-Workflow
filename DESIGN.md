# AI工作流自动化工具 — 整体规划文档

> 生成时间：2025-07-15
> 参考项目：[n8n](https://github.com/n8n-io/n8n)

---

## 一、设计决策汇总

| # | 维度 | 决策 |
|---|------|------|
| Q1 | 目标用户 | **技术爱好者 / 个人开发者** |
| Q2 | 核心场景 | **通用型**（日常自动化、内容生产、数据分析、多Agent协作全覆盖） |
| Q3 | 编排方式 | **混合模式**（可视化画布 + YAML配置 + 自然语言生成） |
| Q4 | 技术栈 | **由规划推荐**（见下文） |
| Q5 | 部署方式 | **本地桌面应用**（Electron 打包） |
| Q6 | 参考项目 | **n8n** |
| Q7 | AI深度 | **分层递进**（LLM节点 → 单Agent → 多Agent协作） |

---

## 二、项目定位

```
一个运行在本地的 AI 工作流自动化桌面工具。
像 n8n 一样可视化编排，但更聚焦 Agent 能力；
像 AutoGPT 一样自主执行，但有可视化画布掌控全局；
像 ComfyUI 一样节点连线，但面向通用自动化而非仅 AI 推理。
```

**核心差异化：**
- n8n 强在集成（1500+ connectors），我们强在 **Agent 自主决策链**
- Coze/Dify 强在 chatbot 搭建，我们强在 **通用工作流 + Agent 编排**
- LangFlow 强在 LangChain 可视化，我们强在 **全生命周期管理**（构建→调试→运行→监控）

---

## 三、技术栈推荐

### 3.1 总览

```
┌──────────────────────────────────────────────────┐
│                   Electron 桌面壳                   │
│  ┌────────────────────────────────────────────┐  │
│  │            React 18 + TypeScript             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │React Flow│ │ Monaco   │ │  shadcn/ui  │  │  │
│  │  │ 工作流画布 │ │ 代码编辑器│ │  UI 组件库  │  │  │
│  │  └──────────┘ └──────────┘ └────────────┘  │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │           Node.js 工作流引擎 (主进程)         │  │
│  │  ┌────────┐ ┌────────┐ ┌────────────────┐  │  │
│  │  │调度器   │ │节点执行│ │  Agent 运行时   │  │  │
│  │  └────────┘ └────────┘ └────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │          SQLite (better-sqlite3)             │  │
│  │      工作流定义 · 执行历史 · 凭证管理         │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 3.2 选型理由

| 层次 | 技术 | 理由 |
|------|------|------|
| **桌面壳** | Electron | TypeScript 统一技术栈；生态最成熟；可直接复用 Node.js 引擎 |
| **前端框架** | React 18 | React Flow（最成熟的工作流可视化库）；Vercel AI SDK 天然适配；社区最大 |
| **工作流画布** | React Flow | 节点拖拽、连线、自定义节点渲染、撤销/重做内置支持 |
| **代码编辑器** | Monaco Editor | VS Code 同款内核，YAML/JSON/Python/JS 语法高亮+智能提示 |
| **UI 组件** | shadcn/ui + Tailwind CSS | 设计质量高、可定制、暗色模式内置 |
| **状态管理** | Zustand | 轻量、TypeScript 友好、无 boilerplate |
| **工作流引擎** | 自研 (Node.js) | 参考 n8n 架构但更轻量，单进程内调度，零网络开销 |
| **Agent 框架** | Vercel AI SDK + LangChain.js | AI SDK 做流式推理，LangChain 做工具链和复杂 Agent |
| **本地存储** | SQLite (better-sqlite3) | 零配置、单文件、足够快、与 Electron 完美配合 |
| **构建工具** | Vite + electron-vite | 极速 HMR、一键打包 |
| **包管理** | pnpm (monorepo) | 参考 n8n，workspace 管理多包 |

### 3.3 为什么不是 Vue？（参考 n8n 但不照搬）

n8n 用 Vue 2 + Vue Flow，我们选 React + React Flow：
- React Flow 比 Vue Flow 成熟 2-3 年，节点编辑器生态更丰富
- Vercel AI SDK 原生 React 支持，做 AI 功能事半功倍
- shadcn/ui + Tailwind 的设计质量远超市面上 Vue 组件库
- 团队/社区招人 React 远多于 Vue

---

## 四、整体架构

### 4.1 分层架构

```
┌───────────────────────────────────────────────────────┐
│  表示层 (Presentation)                                  │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐             │
│  │ 工作流编辑器│ │ 仪表盘    │ │ 日志/调试  │    React    │
│  │ (React    │ │ (概览统计) │ │ (执行追踪) │   组件      │
│  │  Flow)    │ │           │ │           │             │
│  └──────────┘ └───────────┘ └───────────┘             │
├───────────────────────────────────────────────────────┤
│  应用层 (Application)                                   │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐             │
│  │ 工作流 CRUD│ │ 模板市场   │ │ 插件系统   │   IPC      │
│  │ (本地文件) │ │ (社区模板) │ │ (扩展节点) │   Bridge   │
│  └──────────┘ └───────────┘ └───────────┘             │
├───────────────────────────────────────────────────────┤
│  引擎层 (Engine) — 核心                                  │
│  ┌──────────────────────────────────────────────┐      │
│  │             工作流执行引擎                     │      │
│  │  ┌──────┐ ┌──────┐ ┌───────┐ ┌─────────┐   │      │
│  │  │解析器│ │调度器│ │执行器 │ │事件总线 │   │ Node │
│  │  │ YAML │ │ DAG  │ │Node运行│ │ pub/sub │   │ .js  │
│  │  │ →AST │ │拓扑排│ │沙箱   │ │         │   │      │
│  │  └──────┘ └──────┘ └───────┘ └─────────┘   │      │
│  └──────────────────────────────────────────────┘      │
│  ┌──────────────────────────────────────────────┐      │
│  │             Agent 运行时                       │      │
│  │  ┌──────┐ ┌──────┐ ┌───────┐ ┌─────────┐   │      │
│  │  │LLM   │ │Tool  │ │Memory │ │Multi-   │   │      │
│  │  │Router│ │Registry│ │Store │ │Agent    │   │      │
│  │  │      │ │      │ │       │ │Orch.    │   │      │
│  │  └──────┘ └──────┘ └───────┘ └─────────┘   │      │
│  └──────────────────────────────────────────────┘      │
├───────────────────────────────────────────────────────┤
│  基础设施层 (Infrastructure)                            │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐             │
│  │ SQLite   │ │ 文件系统   │ │ 密钥管理   │             │
│  │ (状态持久)│ │ (工作流文件)│ │ (API Key) │             │
│  └──────────┘ └───────────┘ └───────────┘             │
└───────────────────────────────────────────────────────┘
```

### 4.2 数据流

```
用户交互 (React UI)
    │
    ├── 编辑工作流 ──→ React Flow 画布 ──→ 序列化为 YAML/JSON
    │                                       │
    │                              ┌────────▼────────┐
    │                              │   本地文件存储     │
    │                              │ ~/workflows/*.yml│
    │                              └────────┬────────┘
    │                                       │
    ├── 执行工作流 ──→ IPC Bridge ──→ 工作流引擎 (主进程)
    │                                       │
    │                              ┌────────▼────────┐
    │                              │   YAML → AST    │
    │                              │   解析工作流定义   │
    │                              └────────┬────────┘
    │                                       │
    │                              ┌────────▼────────┐
    │                              │   DAG 拓扑排序    │
    │                              │   确定执行顺序     │
    │                              └────────┬────────┘
    │                                       │
    │                              ┌────────▼────────┐
    │                              │   逐节点执行       │
    │                              │  每个节点是独立    │
    │                              │  的 async 函数    │
    │                              └────────┬────────┘
    │                                       │
    │                    ┌──────────────────┼──────────────────┐
    │                    │                  │                  │
    │              ┌─────▼─────┐    ┌──────▼──────┐   ┌──────▼──────┐
    │              │ 普通节点    │    │  LLM 节点    │   │  Agent 节点 │
    │              │ HTTP/代码  │    │ 调用AI API   │   │ 自主决策循环 │
    │              └───────────┘    └─────────────┘   └─────────────┘
    │                                       │
    │                              执行结果通过 IPC
    │                              实时推送到渲染进程
    │                                       │
    └── 查看结果 ◄── Zustand Store ◄── 日志/输出面板
```

---

## 五、节点系统设计

### 5.1 节点分类

```
节点类型体系
│
├── 🔵 触发器 (Trigger)
│   ├── 手动触发      — 点击按钮执行
│   ├── 定时触发      — Cron 表达式
│   ├── 文件监听      — 监听文件夹变化
│   ├── Webhook      — 本地 HTTP 端点
│   └── 剪贴板监听    — 监听剪贴板内容
│
├── 🟢 动作 (Action)
│   ├── HTTP 请求     — REST / GraphQL
│   ├── 代码执行      — Python / JavaScript (沙箱)
│   ├── 文件操作      — 读写/移动/压缩
│   ├── 数据库查询    — SQLite / MySQL / PG
│   ├── 邮件发送      — SMTP
│   ├── 消息推送      — 飞书 / 钉钉 / 微信 / Telegram
│   └── 浏览器操作    — Playwright 自动化
│
├── 🟡 逻辑 (Logic)
│   ├── 条件分支      — if/else
│   ├── 循环          — for/while/forEach
│   ├── 并行          — 多分支同时执行
│   ├── 合并          — 等待所有分支完成
│   ├── 变量操作      — 设置/获取变量
│   └── 子工作流调用  — 调用另一个工作流
│
├── 🟣 AI 节点 (AI)
│   ├── LLM 调用      — 单次对话/补全
│   ├── 文本处理      — 总结/翻译/提取
│   ├── 图像生成      — DALL·E / Stable Diffusion
│   ├── 向量检索      — 知识库 RAG
│   └── 语音处理      — TTS / STT
│
└── 🔴 Agent 节点 (Agent)
    ├── 单 Agent      — 自主规划+执行
    ├── 多 Agent 协作  — Planner/Executor/Reviewer
    ├── 人工审批      — 暂停等待用户确认
    └── 工具调用      — 注册自定义工具给 Agent
```

### 5.2 节点定义格式 (YAML)

```yaml
# 示例：一个"GitHub Trending 监控 → AI 总结 → 推送飞书"工作流
name: "GitHub 日报"
trigger:
  type: cron
  cron: "0 9 * * *"   # 每天早上9点

nodes:
  - id: fetch_trending
    type: http
    config:
      url: "https://api.github.com/trending"
      method: GET

  - id: ai_summary
    type: llm
    depends_on: [fetch_trending]
    config:
      model: gpt-4o
      prompt: "总结以下 GitHub Trending 项目，用中文列出 Top 5"
      input: "{{fetch_trending.output}}"

  - id: notify
    type: feishu
    depends_on: [ai_summary]
    config:
      webhook: "{{secrets.FEISHU_WEBHOOK}}"
      message: "{{ai_summary.output}}"
```

### 5.3 节点扩展机制

```typescript
// 节点接口定义
interface NodeDefinition {
  id: string;
  type: 'trigger' | 'action' | 'logic' | 'ai' | 'agent';
  displayName: string;
  icon: string;
  inputs: NodeInput[];
  outputs: NodeOutput[];
  execute(context: NodeContext): Promise<NodeResult>;
}

// 插件式注册
workflowEngine.registerNode({
  id: 'my-custom-node',
  type: 'action',
  displayName: '我的自定义节点',
  async execute(ctx) {
    // 自定义逻辑
    return { output: 'done' };
  }
});
```

---

## 六、Agent 系统设计

### 6.1 三层递进模型

```
Layer 3: 多 Agent 协作 ──── 规划Agent + 执行Agent + 审查Agent
    ▲                      支持自定义角色和协作拓扑
    │
Layer 2: 单 Agent 自主执行 ─ 给定目标 → 自主规划步骤 → 调用工具 → 迭代
    ▲                      类似 AutoGPT 的 ReAct 循环
    │
Layer 1: LLM 节点 ──────── 工作流中插入 AI 调用节点
                           输入文本 → 输出文本，无自主决策
```

### 6.2 ReAct 循环 (Layer 2 核心)

```
        ┌──────────────────────────────────┐
        │            Agent 循环             │
        │                                   │
        │   ┌─────────┐                     │
        │   │  用户目标 │                     │
        │   └────┬────┘                     │
        │        │                          │
        │   ┌────▼────┐    ┌──────────┐     │
        │   │ 思考    │───→│ 需要工具？ │     │
        │   │ (LLM)  │    └────┬─────┘     │
        │   └────────┘         │           │
        │        ▲        Yes  │  No       │
        │        │         ┌───▼──┐    ┌──▼──┐
        │        │         │调用工具│    │输出结果│
        │        │         └───┬──┘    └─────┘
        │        │             │              │
        │        └─────────────┘              │
        │           (观察结果)                 │
        └──────────────────────────────────┘
```

### 6.3 多 Agent 协作拓扑 (Layer 3)

```
场景：自动研究报告生成

    ┌─────────┐
    │ Planner  │  ← 接收用户目标，拆分任务
    │  Agent   │
    └────┬─────┘
         │ 分配任务
    ┌────▼────────────────────┐
    │                         │
┌───▼──────┐    ┌─────────▼──┐
│ Searcher  │    │  Analyst    │
│ 搜索资料   │    │ 分析数据    │
└───┬──────┘    └─────┬──────┘
    │                 │
    └────┬────────────┘
         │ 汇总
    ┌────▼─────┐
    │  Writer   │  ← 撰写最终报告
    │  Agent    │
    └────┬─────┘
         │
    ┌────▼─────┐
    │ Reviewer  │  ← 审查质量，可能打回修改
    │  Agent    │
    └────┬─────┘
         │
    ┌────▼─────┐
    │  最终输出  │
    └──────────┘
```

多 Agent 协作本质上也是一个特殊的工作流，可以用同款画布编辑器来编排 Agent 之间的协作关系。

---

## 七、项目目录结构

```
ai-workflow/
├── electron/                  # Electron 主进程
│   ├── main.ts               # 窗口管理、IPC
│   ├── preload.ts            # 安全暴露 API
│   └── engine/               # 工作流引擎（主进程内运行）
│       ├── index.ts
│       ├── parser/           # YAML/JSON 解析
│       ├── scheduler/        # DAG 拓扑排序调度
│       ├── executor/         # 节点执行器
│       ├── nodes/            # 内置节点库
│       │   ├── triggers/
│       │   ├── actions/
│       │   ├── logic/
│       │   ├── ai/
│       │   └── agent/
│       ├── agent/            # Agent 运行时
│       │   ├── single-agent.ts
│       │   ├── multi-agent.ts
│       │   ├── tool-registry.ts
│       │   └── memory.ts
│       └── event-bus.ts
│
├── src/                       # React 前端（渲染进程）
│   ├── App.tsx
│   ├── components/
│   │   ├── canvas/           # React Flow 画布
│   │   │   ├── WorkflowCanvas.tsx
│   │   │   ├── nodes/        # 自定义节点渲染
│   │   │   └── edges/        # 自定义连线
│   │   ├── panels/           # 侧面板
│   │   │   ├── NodeConfig.tsx      # 节点配置
│   │   │   ├── NodePalette.tsx     # 节点面板
│   │   │   └── ExecutionLog.tsx    # 执行日志
│   │   ├── editor/           # Monaco 编辑器
│   │   │   └── YamlEditor.tsx
│   │   └── agent/            # Agent 对话面板
│   │       └── AgentChat.tsx
│   ├── stores/               # Zustand 状态
│   │   ├── workflow-store.ts
│   │   ├── execution-store.ts
│   │   └── settings-store.ts
│   ├── hooks/                # 自定义 hooks
│   └── lib/                  # 工具函数
│
├── packages/                  # pnpm workspace 共享包
│   ├── shared/               # 共享类型定义
│   │   └── src/
│   │       ├── workflow.ts   # 工作流类型
│   │       ├── node.ts       # 节点类型
│   │       └── agent.ts      # Agent 类型
│   └── nodes-community/      # 社区节点扩展（未来）
│
├── resources/                 # 图标、模板等静态资源
├── electron-builder.yml       # Electron 打包配置
├── vite.config.ts
├── package.json
├── tsconfig.json
└── pnpm-workspace.yaml
```

---

## 八、开发路线图

### Phase 1: 核心骨架 (MVP) — 预计 4-6 周

**目标：能可视化编排并执行一个简单工作流**

```
✅ Electron 壳 + React 前端跑通
✅ React Flow 画布：拖拽节点、连线、删除
✅ 5 个基础节点：手动触发、HTTP请求、条件分支、代码执行、通知
✅ YAML 序列化/反序列化：画布 ↔ YAML 双向转换
✅ 基础引擎：解析 YAML → DAG 排序 → 顺序执行
✅ 执行日志面板：实时看到每个节点的执行状态
```

### Phase 2: AI 集成 — 预计 2-3 周

**目标：工作流中能调用 LLM**

```
✅ LLM 节点：支持 OpenAI / Claude API
✅ 流式输出：画布上实时看到 AI 生成的文字
✅ Prompt 模板：支持变量插值 {{node.output}}
✅ API Key 管理：本地加密存储
```

### Phase 3: 单 Agent — 预计 3-4 周

**目标：Agent 能自主规划并执行任务**

```
✅ Agent 节点：输入目标，自主循环执行
✅ 工具注册：HTTP / 文件操作 / 代码执行 作为 Agent 工具
✅ Tool Use：Agent 自主选择调用哪个工具
✅ ReAct 循环：Think → Act → Observe → Think...
✅ 执行追踪：可视化 Agent 的每一步思考过程
```

### Phase 4: 增强 & 多 Agent — 预计 4-6 周

**目标：丰富节点生态 + 多 Agent 协作**

```
✅ 更多节点：定时触发器、文件监听、数据库、飞书/微信推送
✅ 子工作流：一个工作流可以调用另一个
✅ 人工审批节点：暂停等待用户确认
✅ 多 Agent 工作流：Planner + Executor + Reviewer 协作拓扑
✅ 自然语言生成工作流：描述需求 → LLM 生成 YAML → 渲染到画布
```

### Phase 5: 打磨 & 发布 — 预计 2-3 周

```
✅ Monaco YAML 编辑器：双模式切换（画布 ↔ 代码）
✅ 模板市场：预置常用工作流模板
✅ 错误处理 & 重试机制
✅ 暗色主题 & 国际化
✅ Electron 打包 & 自动更新
```

---

## 九、关键设计原则

1. **本地优先** — 所有数据本地存储，无需注册账号，不上传数据
2. **渐进复杂度** — 新手用自然语言 → 熟手拖拽画布 → 高手写 YAML
3. **可扩展** — 节点插件化，社区可以贡献自定义节点
4. **可见即可控** — Agent 每一步思考都可视化，不黑箱
5. **离线可用** — 除了调用 AI API，其余功能完全离线

---

## 十、风险 & 缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| React Flow 性能（大量节点） | 画布卡顿 | 虚拟化渲染、节点分组折叠 |
| Agent 循环失控 | Token 耗尽 | 最大步数限制、费用预警 |
| 代码沙箱安全性 | 任意代码执行 | vm2/isolated-vm 沙箱隔离 |
| Electron 体积大 | 下载慢 | 按需加载、Tauri 作为 Plan B |
| AI API 不稳定 | 工作流失败 | 自动重试、降级策略 |
