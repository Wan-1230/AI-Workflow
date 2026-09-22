import type { NodeContext, NodeExecuteFn, LlmModelInfo } from '@shared/node'
import { chatCompletion, normalizeBaseUrl } from '../../llm/client'
import { resolveModel } from '../../llm/resolve-model'


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
