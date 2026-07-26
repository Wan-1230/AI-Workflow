// ===== 工作流定义类型 =====

export interface WorkflowDefinition {
  id: string
  name: string
  trigger?: TriggerConfig
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
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

export interface ExecutionContext {
  workflow: WorkflowDefinition
  nodeResults: Map<string, NodeResult>
  secrets: Record<string, string>
  signal: AbortSignal
  logger: (nodeId: string, msg: string) => void
}

export interface NodeResult {
  nodeId: string
  status: 'success' | 'error' | 'cancelled' | 'skipped'
  output: Record<string, unknown>
  error?: string
  duration: number
}

export type ExecutionEventType =
  | 'node:start'
  | 'node:complete'
  | 'node:error'
  | 'node:log'
  | 'node:cancelled'
  | 'workflow:complete'
  | 'workflow:cancelled'

export interface ExecutionEvent {
  type: ExecutionEventType
  nodeId?: string
  data?: Record<string, unknown>
  timestamp: number
}

// ===== 节点重试/超时配置 =====

export interface RetryConfig {
  maxRetries: number
  interval: number  // ms
}

export interface NodeExecutionConfig {
  timeout?: number      // 单节点超时 ms，默认 30000
  retry?: RetryConfig   // 重试配置
}
