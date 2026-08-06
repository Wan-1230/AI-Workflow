import type { StreamChunk } from '@shared/workflow'

/* =====================================================================
   LLM 客户端 — OpenAI 兼容接口
   支持 DeepSeek / 千问 / Moonshot / 自定义网关等所有 OpenAI 兼容服务
   ===================================================================== */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  /** 流式输出回调（逐增量） */
  onStream?: (chunk: StreamChunk) => void
  signal?: AbortSignal
  timeoutMs?: number
}

export interface ChatCompletionResult {
  content: string
  model: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  duration: number
}

/** 解析 OpenAI 兼容接口的 SSE 数据块 */
function parseSSEChunk(raw: string): { delta?: string; done: boolean } {
  const lines = raw.split('\n')
  let delta: string | undefined
  let done = false
  for (const line of lines) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (data === '[DONE]') {
      done = true
      continue
    }
    try {
      const json = JSON.parse(data) as {
        choices?: { delta?: { content?: string }; text?: string }[]
        error?: { message?: string }
      }
      if (json.error?.message) {
        throw new Error(`上游错误: ${json.error.message}`)
      }
      const choice = json.choices?.[0]
      const content = choice?.delta?.content ?? choice?.text
      if (content) delta = content
    } catch {
      // 忽略非 JSON 行
    }
  }
  return { delta, done }
}

export class LlmError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LlmError'
    this.status = status
  }
}

/** 归一化 baseUrl：去掉尾部斜杠 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

/**
 * 调用 OpenAI 兼容 Chat Completions 接口
 * - stream=false：一次性返回
 * - stream=true：通过 onStream 逐增量推送（触发 node:stream 事件）
 */
export async function chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const { baseUrl, apiKey, model, messages, temperature = 0.7, maxTokens = 2048, onStream, signal, timeoutMs = 60000 } = options

  const startedAt = Date.now()
  const useStream = Boolean(onStream)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // 外部取消信号联动
  if (signal) {
    if (signal.aborted) controller.abort()
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: useStream
      }),
      signal: controller.signal
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const detail = text.slice(0, 300)
      throw new LlmError(
        `LLM 请求失败 (HTTP ${res.status})${detail ? `: ${detail}` : ''}`,
        res.status
      )
    }

    // ===== 流式模式 =====
    if (useStream && res.body) {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE 按空行分隔事件
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const evt of events) {
          const parsed = parseSSEChunk(evt)
          if (parsed.delta) {
            full += parsed.delta
            onStream?.({
              nodeId: '',
              delta: parsed.delta,
              full,
              timestamp: Date.now()
            })
          }
        }
      }
      // 处理残留
      if (buffer.trim()) {
        const parsed = parseSSEChunk(buffer)
        if (parsed.delta) full += parsed.delta
      }

      if (signal?.aborted) {
        throw new LlmError('请求已取消')
      }

      return {
        content: full,
        model,
        duration: Date.now() - startedAt
      }
    }

    // ===== 非流式模式 =====
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      model?: string
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
      error?: { message?: string }
    }

    if (data.error?.message) {
      throw new LlmError(data.error.message)
    }

    const content = data.choices?.[0]?.message?.content ?? ''
    return {
      content,
      model: data.model || model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0
          }
        : undefined,
      duration: Date.now() - startedAt
    }
  } catch (err: unknown) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new LlmError(`请求超时（${timeoutMs}ms）`)
    }
    if (err instanceof LlmError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LlmError('请求已取消')
    }
    const message = err instanceof Error ? err.message : String(err)
    throw new LlmError(`网络请求失败: ${message}`)
  } finally {
    clearTimeout(timer)
  }
}
