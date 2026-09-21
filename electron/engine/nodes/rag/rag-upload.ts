import type { NodeContext, NodeExecuteFn } from '@shared/node'
import { chunkText, VectorStore } from '../../rag/vector-store'
import { readFile } from 'fs/promises'
import { basename } from 'path'

/** 全局共享向量存储（所有 RAG 节点共用） */
export const vectorStore = new VectorStore()


export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
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
  const docId = String(config.docId || `doc_${Date.now()}`)

  const chunks = chunkText(rawText, { chunkSize, overlap })
  if (chunks.length === 0) {
    throw new Error('文本切分结果为空')
  }

  vectorStore.add(docId, chunks, { source: fileName, size: rawText.length })
  ctx.logger(`文档「${fileName}」入库完成：${chunks.length} 个分块 (${rawText.length} 字符)`)

  return {
    docId,
    chunkCount: chunks.length,
    chunks,
    totalSize: vectorStore.size,
    preview: chunks[0]?.slice(0, 200) ?? ''
  }
}
