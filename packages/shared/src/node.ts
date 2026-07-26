// ===== 节点系统类型 =====

export type NodeCategory = 'trigger' | 'action' | 'logic' | 'ai' | 'agent'

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
}

export interface NodePort {
  name: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'any'
}

export interface NodeContext {
  config: Record<string, unknown>
  inputs: Record<string, unknown>
  secrets: Record<string, string>
  signal?: AbortSignal
  logger: (msg: string) => void
}

export type NodeExecuteFn = (ctx: NodeContext) => Promise<Record<string, unknown>>

export interface RegisteredNode {
  definition: NodeDefinition
  execute: NodeExecuteFn
}
