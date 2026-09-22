import type { NodeContext, NodeExecuteFn } from '@shared/node'
import { createEmbeddings, resolveEmbeddingTarget } from '../../llm/embeddings'
import type { SearchResult } from '@shared/rag'

/**
 * 向量检索：Top-K 片段 + 合并上下文，供下游 LLM 引用。
 *
 * 配了 embedding 模型就走真语义检索；没配则退回 TF-IDF。
 * 两者分数不可比，所以索引 scheme 与本次查询方式不一致时直接报错，
 * 而不是悄悄退回词频 —— 那会让用户以为自己花钱建的 embedding 生效了。
 */
export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const rag = ctx.rag
  if (!rag) throw new Error('RAG 索引未注入，无法检索：请从应用内运行工作流')

  const config = ctx.config
  const query = String(config.query || '').trim()
  if (!query) throw new Error('检索问题为空，请填写 query')

  const topK = Number(config.topK ?? 5)
  const minScore = Number(config.minScore ?? 0.05)

  await rag.ensureLoaded()

  const target = resolveEmbeddingTarget(config, ctx)
  let results: SearchResult[]
  let mode: string

  if (target) {
    const [vector] = await createEmbeddings({
      baseUrl: target.baseUrl,
      apiKey: target.apiKey,
      model: target.model,
      input: [query],
      signal: ctx.signal
    })
    results = await rag.searchByEmbedding(vector, topK, minScore)
    mode = `embedding/${target.model}`
  } else {
    results = await rag.search(query, topK, minScore)
    mode = 'TF-IDF'
  }

  if (results.length === 0) {
    ctx.logger(`未检索到相关内容（${mode}，可先执行「文档入库」节点或调低 minScore）`)
    return { results: [], topText: '', combined: '', count: 0, mode, query }
  }

  const combined = results
    .map((r, i) => `【片段 ${i + 1} 相关度 ${r.score.toFixed(3)}】\n${r.text}`)
    .join('\n\n')

  ctx.logger(`检索到 ${results.length} 条相关片段（${mode}），最高相关度 ${results[0].score.toFixed(3)}`)

  return {
    results,
    topText: results[0].text,
    combined,
    count: results.length,
    mode,
    query
  }
}
