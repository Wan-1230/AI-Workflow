// ===== 提示词模板库类型 =====

export interface PromptTemplate {
  id: string
  name: string
  /** 模板内容，支持 {{varName}} 占位符 */
  content: string
  /** 分类（自由文本标签） */
  category: string
  /** 使用说明 */
  description?: string
  /** 收藏 */
  favorite: boolean
  /** 模板中的变量列表（自动从内容解析，或手动补充） */
  variables: string[]
  /** 使用次数 */
  usageCount: number
  createdAt: string
  updatedAt: string
}

export interface PromptTemplateInput {
  id?: string
  name: string
  content: string
  category: string
  description?: string
  favorite?: boolean
}

/** 模板渲染结果 */
export interface PromptRenderResult {
  rendered: string
  /** 渲染时发现缺失的变量 */
  missingVariables: string[]
}
