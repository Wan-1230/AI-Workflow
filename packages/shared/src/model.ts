// ===== 模型配置类型（模型库） =====

/** 模型提供商（内置预设，均走 OpenAI 兼容接口） */
export type ModelProvider = 'openai' | 'deepseek' | 'qwen' | 'moonshot' | 'custom'

export interface ModelProviderPreset {
  id: ModelProvider
  name: string
  /** 默认 API Base URL */
  baseUrl: string
  /** 默认模型名 */
  defaultModel: string
  /** 是否支持自定义 baseUrl */
  customBaseUrl: boolean
}

/** 模型配置（API Key 加密存储于主进程，前端不持有明文） */
export interface ModelConfig {
  id: string
  name: string
  provider: ModelProvider
  baseUrl: string
  /** API Key 占位：前端仅展示是否有值 */
  hasApiKey: boolean
  /** 加密后的 Key（仅主进程使用，绝不回传渲染进程） */
  apiKeyEncrypted?: string
  model: string
  temperature: number
  maxTokens: number
  /** 是否为默认模型 */
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

/** 创建/更新模型参数（渲染进程提交，Key 由主进程加密） */
export interface ModelConfigInput {
  id?: string
  name: string
  provider: ModelProvider
  baseUrl: string
  apiKey?: string
  model: string
  temperature: number
  maxTokens: number
  isDefault?: boolean
}

/** 连通性测试结果 */
export interface ModelTestResult {
  success: boolean
  message: string
  /** 测试耗时 ms */
  latency?: number
  /** 返回的模型名 */
  respondedModel?: string
}
