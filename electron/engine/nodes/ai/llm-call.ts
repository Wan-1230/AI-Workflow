import type { NodeContext, NodeExecuteFn, LlmModelInfo } from '@shared/node'
import { chatCompletion, normalizeBaseUrl } from '../../llm/client'


/** 从配置与注入的模型库信息中解析调用参数 */
function resolveModel(
  config: Record<string, unknown>,
  ctx: NodeContext
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

  // 2. 手动配置：baseUrl + apiKeyRef 或 credentials
  const apiKey =
    String(config.apiKeyRef || '') ||
    ctx.secrets[String(config.apiKey || '')] ||
    ''
  const baseUrl = String(config.baseUrl || '')
  const model = String(config.model || '')

  if (!apiKey) {
    throw new Error(
      '未找到可用的 API Key：请在「模型配置」页添加模型，或在节点中填写 apiKeyRef / baseUrl'
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

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config
  const { baseUrl, apiKey, model } = resolveModel(config, ctx)

  const systemPrompt = String(config.systemPrompt || '')
  const userPrompt = String(config.userPrompt || '')
  const temperature = Number(config.temperature ?? 0.7)
  const maxTokens = Number(config.maxTokens ?? 2048)
  const useStream = config.stream !== false

  if (!userPrompt.trim()) {
    throw new Error('用户提示词为空，请在节点配置中填写 userPrompt')
  }

  const messages = [
    ...(systemPrompt.trim() ? [{ role: 'system' as const, content: systemPrompt }] : []),
    { role: 'user' as const, content: userPrompt }
  ]

  ctx.logger(`调用模型 ${model} (${normalizeBaseUrl(baseUrl)})，流式: ${useStream}`)

  // 流式模式：逐增量推送 node:stream 事件
  const onStream = useStream
    ? (chunk: { delta: string; full: string; timestamp: number }) => {
        ctx.stream?.({
          nodeId: '',
          delta: chunk.delta,
          full: chunk.full,
          timestamp: chunk.timestamp
        })
      }
    : undefined

  const result = await chatCompletion({
    baseUrl,
    apiKey,
    model,
    messages,
    temperature,
    maxTokens,
    onStream,
    signal: ctx.signal
  })

  ctx.logger(`模型回复完成，耗时 ${result.duration}ms`)

  return {
    text: result.content,
    model: result.model,
    usage: result.usage
      ? {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens
        }
      : undefined,
    duration: result.duration
  }
}

/** 供 agent-delegate 等节点复用的便捷封装 */
export async function callLlm(ctx: NodeContext, config: Record<string, unknown>, prompt: string): Promise<string> {
  const merged: Record<string, unknown> = { ...config, userPrompt: prompt }
  const { baseUrl, apiKey, model } = resolveModel(merged, ctx)
  const result = await chatCompletion({
    baseUrl,
    apiKey,
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: Number(merged.temperature ?? 0.7),
    maxTokens: Number(merged.maxTokens ?? 2048),
    signal: ctx.signal
  })
  return result.content
}

/** 从 NodeContext 提取模型信息（类型守卫用） */
export function findModel(models: LlmModelInfo[] | undefined, id: string): LlmModelInfo | undefined {
  return models?.find(m => m.id === id)
}
