import type { LlmModelInfo } from '@shared/node'

/**
 * 模型解析的唯一入口：LLM 调用与 embedding 调用共用。
 * 两份实现迟早会漂移成"聊天能用、向量化拿不到 key"，那种问题只在运行期暴露。
 */

/** 解析模型参数所需的最小上下文（模型库 + 凭证表） */
export interface ModelResolveContext {
  models?: LlmModelInfo[]
  secrets: Record<string, string>
}

/** 从配置与注入的模型库信息中解析调用参数 */
export function resolveModel(
  config: Record<string, unknown>,
  ctx: ModelResolveContext
): { baseUrl: string; apiKey: string; model: string } {
  const modelId = String(config.modelId || '')
  const models = ctx.models || []
  const matched = modelId ? models.find(m => m.id === modelId) : undefined

  // 1. 指定了模型库配置
  if (matched) {
    return { baseUrl: matched.baseUrl, apiKey: matched.apiKey, model: matched.model }
  }

  // 1.5 未指定模型：回退到模型库默认模型（注入时默认排在最前）
  if (!modelId && models.length > 0) {
    const fallback = models[0]
    return { baseUrl: fallback.baseUrl, apiKey: fallback.apiKey, model: fallback.model }
  }

  // 2. 手动路径：credentialName 只作凭证表中的键名，绝不接受密钥明文。
  //    曾直接把 config.apiKeyRef 当作 API Key 使用，使明文随 workflow_json 落库、
  //    被导出到磁盘并回传渲染进程。
  const credentialName = String(config.credentialName || '').trim()
  const apiKey = credentialName ? (ctx.secrets[credentialName] ?? '') : ''
  const baseUrl = String(config.baseUrl || '')
  const model = String(config.model || '')

  if (!apiKey) {
    throw new Error(
      credentialName
        ? `凭证 "${credentialName}" 不存在或无法解密：请在「设置 → 安全凭证」中确认，或改用「模型配置」页已登记的模型`
        : '未找到可用的 API Key：请在「模型配置」页添加模型，或选择凭证并填写 baseUrl 与 model'
    )
  }
  if (!baseUrl) {
    throw new Error('缺少 API Base URL：请在节点配置中填写，或在模型配置页添加模型')
  }
  if (!model) {
    throw new Error('缺少模型名称：请在节点配置中填写 model')
  }
  return { baseUrl, apiKey, model }
}
