import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'
import { vectorStore } from './rag-upload'

export const definition: NodeDefinition = {
  id: 'rag-retrieve',
  category: 'rag',
  displayName: '向量检索',
  description: '基于语义相似度从向量库检索相关内容（RAG）',
  icon: '🎯',
  color: '#06b6d4',
  inputs: [
    { name: 'query', label: '检索问题', type: 'string' }
  ],
  outputs: [
    { name: 'results', label: '检索结果', type: 'object' },
    { name: 'topText', label: '最佳命中文本', type: 'string' },
    { name: 'combined', label: '拼接上下文', type: 'string' },
    { name: 'count', label: '命中数', type: 'number' }
  ],
  defaultConfig: {
    query: '',
    topK: 5,
    minScore: 0.05
  }
}

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config
  const query = String(config.query || '').trim()
  if (!query) throw new Error('检索问题为空，请填写 query')

  const topK = Number(config.topK ?? 5)
  const minScore = Number(config.minScore ?? 0.05)

  ctx.logger(`检索: "${query.slice(0, 50)}" (Top-${topK})`)

  const results = vectorStore.search(query, topK, minScore)

  if (results.length === 0) {
    ctx.logger('未检索到相关内容（可先执行「文档入库」节点）')
    return { results: [], topText: '', combined: '', count: 0 }
  }

  const combined = results
    .map((r, i) => `【片段 ${i + 1} 相似度 ${r.score.toFixed(3)}】\n${r.text}`)
    .join('\n\n')

  ctx.logger(`检索到 ${results.length} 条相关片段，最高相似度 ${results[0].score.toFixed(3)}`)

  return {
    results,
    topText: results[0].text,
    combined,
    count: results.length
  }
}
