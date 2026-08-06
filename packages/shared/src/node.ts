import type { StreamChunk } from './workflow'

// ===== 节点系统类型 =====

export type NodeCategory = 'trigger' | 'action' | 'logic' | 'ai' | 'agent' | 'rag'

/** 模型运行时信息（由主进程注入，不经过渲染进程） */
export interface LlmModelInfo {
  id: string
  baseUrl: string
  model: string
  apiKey: string
  temperature?: number
  maxTokens?: number
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
  /** 全局变量（key-value） */
  variables: Record<string, string>
  /** 模型库运行时信息（LLM 节点取 Key 用） */
  models?: LlmModelInfo[]
  signal?: AbortSignal
  logger: (msg: string) => void
  /** 流式输出回调（LLM 节点推送增量） */
  stream?: (chunk: StreamChunk) => void
}

export type NodeExecuteFn = (ctx: NodeContext) => Promise<Record<string, unknown>>

export interface RegisteredNode {
  definition: NodeDefinition
  execute: NodeExecuteFn
}
