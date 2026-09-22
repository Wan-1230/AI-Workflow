// ===== 工作流定义类型 =====

/** 全局变量（可在画布外配置，节点中通过 {{global.NAME}} 引用） */
export interface GlobalVariable {
  key: string
  value: string
  description?: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  trigger?: TriggerConfig
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  /** 全局变量表 */
  variables?: GlobalVariable[]
  createdAt: string
  updatedAt: string
}

export interface WorkflowNode {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  dependsOn?: string[]
  executionConfig?: NodeExecutionConfig
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface TriggerConfig {
  type: 'manual' | 'cron' | 'file_watch' | 'webhook' | 'clipboard'
  config: Record<string, unknown>
}

// ===== 执行相关类型 =====

import type { LlmModelInfo } from './node'

/** 流式输出增量块（LLM 节点逐字推送） */
export interface StreamChunk {
  nodeId: string
  /** 增量文本 */
  delta: string
  /** 已累计完整文本 */
  full: string
  /** 是否结束（LLM 完成时推送，data 附带完整结果） */
  done?: boolean
  timestamp: number
}

export interface ExecutionContext {
  workflow: WorkflowDefinition
  nodeResults: Map<string, NodeResult>
  secrets: Record<string, string>
  /** 全局变量（已解析为 key-value） */
  variables: Record<string, string>
  /** 模型库运行时信息（由主进程注入，LLM 节点取 Key） */
  models?: LlmModelInfo[]
  signal: AbortSignal
  logger: (nodeId: string, msg: string) => void
  /** 流式输出回调（LLM 节点调用） */
  stream?: (chunk: StreamChunk) => void
  /** 循环体作用域（仅循环体内节点的执行上下文携带） */
  scope?: { item?: unknown; index?: number; count?: number; loopId?: string }
  /** RAG 索引；由引擎注入，节点不自己 new 一个内存库（那样重启即失效） */
  rag?: import('./rag').RagIndex
}

export interface NodeResult {
  nodeId: string
  status: 'success' | 'error' | 'cancelled' | 'skipped'
  output: Record<string, unknown>
  error?: string
  duration: number
  /** 循环节点：每次迭代的子节点结果 */
  iterations?: NodeResult[][]
}

export type ExecutionEventType =
  | 'node:start'
  | 'node:complete'
  | 'node:error'
  | 'node:log'
  | 'node:stream'
  | 'node:cancelled'
  | 'node:skipped'
  | 'workflow:complete'
  | 'workflow:cancelled'
  /** 因节点失败而终止（区别于用户主动取消的 workflow:cancelled） */
  | 'workflow:error'

export interface ExecutionEvent {
  type: ExecutionEventType
  nodeId?: string
  data?: Record<string, unknown>
  timestamp: number
}

/** 工作流执行结果汇总（渲染进程展示用） */
export interface WorkflowExecutionSummary {
  executionId: string
  status: 'completed' | 'error' | 'cancelled'
  totalDuration: number
  nodeCount: number
  results: Record<string, NodeResult>
}

// ===== 节点重试/超时配置 =====

export interface RetryConfig {
  maxRetries: number
  interval: number  // ms
}

export type NodeErrorStrategy =
  /** 失败即中断整个工作流（默认，与历史行为一致） */
  | 'stop'
  /** 记为 skipped 并继续其余分支 */
  | 'skip'
  /** 先按 retry 配置重试，耗尽后按 skip 处理 */
  | 'retry-then-skip'
  /** 不中断，仅激活 errorHandle 出口上的下游（正常出口下游记 skipped） */
  | 'error-branch'

export interface NodeExecutionConfig {
  /** 单节点超时（ms）。缺省取 max(全局设置, 节点目录声明的上限) */
  timeout?: number
  retry?: RetryConfig
  /** 失败处置策略，缺省 'stop' */
  onError?: NodeErrorStrategy
  /** onError='error-branch' 时使用的出口句柄 id，缺省 'error' */
  errorHandle?: string
}
