import { resolveModel, type ModelResolveContext } from './resolve-model'

/* =====================================================================
   OpenAI 兼容 /embeddings 客户端

   RAG 想从"词频重合"升级到真正的语义检索，只有这一条路：
   词频找不到"退款流程"与"钱怎么退回来"之间的关系。
   ===================================================================== */

export const EMBEDDING_BATCH_SIZE = 64

export interface EmbeddingOptions {
  baseUrl: string
  apiKey: string
  model: string
  input: string[]
  signal?: AbortSignal
  timeoutMs?: number
}

export class EmbeddingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'EmbeddingError'
  }
}

function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  if (/\/chat\/completions$/i.test(url)) url = url.replace(/\/chat\/completions$/i, '')
  return url
}

/** 批量取 embedding；顺序与入参一致，调用方据此对齐 chunk */
export async function createEmbeddings(opts: EmbeddingOptions): Promise<number[][]> {
  // 不按空与否过滤：过滤会让返回向量与 chunk 的序号错位，
  // 那种错位表现为"检索结果看着相关其实配错了段落"
  const texts = opts.input.map(t => t.trim())
  if (texts.length === 0 || texts.every(t => !t)) throw new EmbeddingError('没有可向量化的文本')
  if (!opts.apiKey) throw new EmbeddingError('缺少 API Key：向量化需要在「模型配置」里选一个提供 Key 的模型')
  if (!opts.model) throw new EmbeddingError('缺少 embedding 模型名：如 text-embedding-3-small / bge-m3')

  const url = `${normalizeBaseUrl(opts.baseUrl).replace(/\/embeddings$/i, '')}/embeddings`
  const out: number[][] = []

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120000)
    const onParentAbort = (): void => controller.abort()
    opts.signal?.addEventListener('abort', onParentAbort)
    if (opts.signal?.aborted) controller.abort()

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({ model: opts.model, input: batch }),
        signal: controller.signal
      })
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300)
        throw new EmbeddingError(
          `向量化请求失败 (HTTP ${res.status})${detail ? `: ${detail}` : ''}`,
          res.status
        )
      }
      const json = (await res.json()) as { data?: Array<{ index: number; embedding: number[] }> }
      const rows = json.data
      if (!Array.isArray(rows) || rows.length !== batch.length) {
        throw new EmbeddingError(
          `向量化返回条数异常：期望 ${batch.length}，实际 ${Array.isArray(rows) ? rows.length : '无 data 字段'}`
        )
      }
      // 服务方不保证按顺序返回，按 index 归位而不是照抄返回顺序
      const placed: Array<number[] | undefined> = new Array(batch.length).fill(undefined)
      for (const row of rows) {
        if (!Array.isArray(row.embedding) || row.embedding.length === 0) {
          throw new EmbeddingError('向量化返回了空向量')
        }
        const at = Number.isInteger(row.index) ? row.index : -1
        if (at < 0 || at >= batch.length) {
          throw new EmbeddingError(`向量化返回的 index ${String(row.index)} 超出批次范围 0..${batch.length - 1}`)
        }
        if (placed[at]) throw new EmbeddingError(`向量化返回的 index ${at} 重复，无法判定对应文本`)
        placed[at] = row.embedding
      }
      if (placed.some(v => v === undefined)) {
        throw new EmbeddingError('向量化返回的 index 不连续，无法与文本对齐')
      }
      out.push(...(placed as number[][]))
    } catch (err: unknown) {
      if (err instanceof EmbeddingError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        throw new EmbeddingError(opts.signal?.aborted ? '向量化已取消' : `向量化请求超时 (${opts.timeoutMs ?? 120000}ms)`)
      }
      throw new EmbeddingError(`向量化请求失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onParentAbort)
    }
  }

  return out
}

/**
 * 从节点配置解析 embedding 出口。
 *
 * 模型库里的 model 字段是聊天模型名，直接拿去 /embeddings 通常 404，
 * 因此 embedding 模型名单独填；baseUrl 与 Key 可以复用已登记的模型。
 */
export function resolveEmbeddingTarget(
  config: Record<string, unknown>,
  ctx: ModelResolveContext
): { model: string; baseUrl: string; apiKey: string } | null {
  const model = String(config.embeddingModel || '').trim()
  if (!model) return null

  const providerId = String(config.embeddingProviderId || '').trim()
  const provider = providerId
    ? (ctx.models || []).find(m => m.id === providerId)
    : (ctx.models || []).find(m => m.id === model) ?? ctx.models?.[0]

  if (provider) {
    return { model, baseUrl: provider.baseUrl, apiKey: provider.apiKey }
  }

  const credentialName = String(config.credentialName || '').trim()
  const apiKey = credentialName ? (ctx.secrets[credentialName] ?? '') : ''
  const baseUrl = String(config.baseUrl || '')
  if (!apiKey || !baseUrl) {
    throw new EmbeddingError(
      `已填写 embedding 模型名「${model}」，但没有可用的 Base URL 与 Key：` +
      '请在「向量模型」处选择模型库里的提供方，或同时填写备用凭证与 Base URL'
    )
  }
  return { model, baseUrl, apiKey }
}

export { resolveModel }
