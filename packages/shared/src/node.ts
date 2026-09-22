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

/** 端口类型：含数组形态，与配置面板的变量提示保持一致 */
export type NodePortType =
  | 'string' | 'number' | 'boolean' | 'object' | 'any'
  | 'string[]' | 'object[]' | 'any[]'

/** 配置面板字段 schema（由渲染层消费，引擎忽略） */
export interface NodeFieldSchema {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'json'
  help?: string
  placeholder?: string
  rows?: number
  /** 静态选项；与 dataSource 不同时使用 */
  options?: { value: string; label: string }[]
  /** 动态选项来源；取代此前 NodeConfig 内对 modelId 键名的隐式约定 */
  dataSource?: 'models' | 'credentials'
  /**
   * 该字段内的 {{...}} 是否按「上游节点输出引用」解析（默认 true）。
   * 置 false 用于模板正文类字段：其占位符由节点自身语义定义
   * （如提示词模板的用户变量名、循环的 {{item}}/{{index}}），不应被当作节点引用校验。
   */
  nodeRefInterpolation?: boolean
}

export interface NodeDefinition {
  id: string
  category: NodeCategory
  displayName: string
  description: string
  icon: string
  color: string
  outputs: NodePort[]
  defaultConfig: Record<string, unknown>
  fields: NodeFieldSchema[]
  /**
   * 多出口节点的 sourceHandle 标识（如条件分支的 true/false）。
   * 未声明时视为单一匿名出口 —— 引擎按 `edge.sourceHandle || 'true'` 路由。
   */
  sourceHandles?: string[]
  /** 该类型的执行时间上限建议；执行器据此放宽默认超时 */
  executionLimits?: { timeoutMs?: number }
}

export interface NodePort {
  name: string
  label: string
  type: NodePortType
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
  /**
   * 循环体作用域：仅当节点位于某个 loop 的循环体内、且正处于某一轮迭代时存在。
   * 让体内任意节点（不只是模板类节点）都能取到当前项。
   */
  scope?: { item?: unknown; index?: number; count?: number; loopId?: string }
  /** RAG 索引（入库/检索节点用）；缺省时节点应报错而不是静默建一个内存库 */
  rag?: import('./rag').RagIndex
}

export type NodeExecuteFn = (ctx: NodeContext) => Promise<Record<string, unknown>>

export interface RegisteredNode {
  definition: NodeDefinition
  execute: NodeExecuteFn
}
