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
  logger: (nodeId: string, msg: string) => void
}

export interface NodeResult {
  nodeId: string
  status: 'success' | 'error'
  output: Record<string, unknown>
  error?: string
  duration: number
}

export interface ExecutionEvent {
  type: 'node:start' | 'node:complete' | 'node:error' | 'workflow:complete'
  nodeId?: string
  data?: Record<string, unknown>
  timestamp: number
}
