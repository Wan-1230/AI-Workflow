import type { NodeContext, NodeExecuteFn } from '@shared/node'
import { chunkText, contentHash } from '../../rag/vector-store'
import { createEmbeddings, resolveEmbeddingTarget } from '../../llm/embeddings'
import { readFile } from 'fs/promises'
import { basename } from 'path'

/**
 * 文档入库：切分 → （可选）向量化 → 写入索引。
 *
 * 索引来自 ctx.rag（引擎注入），不再由本文件 new 一个内存单例 ——
 * 那意味着每次重启都要重新入库，而界面上完全看不出这一点。
 */
export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const rag = ctx.rag
  if (!rag) throw new Error('RAG 索引未注入，无法入库：请从应用内运行工作流')

  const config = ctx.config
  const source = String(config.source || 'text')

  let rawText = ''
  let fileName = ''

  if (source === 'file') {
    const filePath = String(config.filePath || '')
    if (!filePath) throw new Error('文件路径为空（source=file 时需填写 filePath）')
    try {
      rawText = await readFile(filePath, 'utf-8')
      fileName = basename(filePath)
    } catch (err: unknown) {
      throw new Error(`读取文件失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    rawText = String(config.text || '')
    fileName = String(config.docId || 'inline-doc')
  }

  if (!rawText.trim()) {
    throw new Error('文本内容为空，请填写 text 或 filePath')
  }

  const chunkSize = Number(config.chunkSize ?? 500)
  const overlap = Number(config.overlap ?? 80)
  // 默认用内容哈希当 id：同一段文字重复跑不再制造 N 份拷贝
  const hash = contentHash(rawText)
  const docId = String(config.docId || `doc_${hash}`)

  const chunks = chunkText(rawText, { chunkSize, overlap })
  if (chunks.length === 0) throw new Error('文本切分结果为空')

  await rag.ensureLoaded()
  if (config.rebuild === true) {
    await rag.clear()
    ctx.logger('按配置清空索引后重建')
  }

  const target = resolveEmbeddingTarget(config, ctx)
  let vectors: number[][] | null = null
  if (target) {
    ctx.logger(`向量化 ${chunks.length} 个分块（模型 ${target.model}）`)
    vectors = await createEmbeddings({
      baseUrl: target.baseUrl,
      apiKey: target.apiKey,
      model: target.model,
      input: chunks,
      signal: ctx.signal
    })
  }

  const added = await rag.add(
    docId,
    chunks,
    { source: fileName, size: rawText.length },
    target && vectors ? { vectors, model: target.model } : null
  )

  if (added.deduped) {
    ctx.logger(`文档「${fileName}」内容未变（哈希 ${hash}），跳过入库；索引现有 ${rag.size} 个分块`)
  } else {
    ctx.logger(
      `文档「${fileName}」入库完成：${added.chunkCount} 个分块 (${rawText.length} 字符)，` +
      `方式 ${target ? `embedding/${target.model}` : 'TF-IDF'}`
    )
  }

  return {
    docId: added.docId,
    deduped: added.deduped,
    hash,
    chunkCount: added.chunkCount,
    chunks,
    totalSize: rag.size,
    stats: rag.stats(),
    preview: chunks[0]?.slice(0, 200) ?? ''
  }
}
