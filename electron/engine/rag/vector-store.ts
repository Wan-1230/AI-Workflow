/* =====================================================================
   轻量向量存储（纯 JS 实现，无外部依赖）
   - 文本切分（chunk）
   - 词袋 TF 向量 + 余弦相似度检索
   适用于本地 RAG 演示与中小规模文档；生产可替换为嵌入模型服务
   ===================================================================== */

export interface ChunkOptions {
  /** 每块字符数 */
  chunkSize?: number
  /** 相邻块重叠字符数 */
  overlap?: number
}

export interface VectorDocument {
  id: string
  text: string
  metadata: Record<string, unknown>
  /** 归一化后的 TF 向量 */
  vector: Map<string, number>
  /** 向量模长（预计算加速） */
  norm: number
}

/** 文本切分：按段落/句子边界优先，兼顾 chunkSize */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 500
  const overlap = options.overlap ?? 80
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return []

  // 按段落切分为基础单元
  const paragraphs = clean.split(/\n+/).filter(p => p.trim().length > 0)
  const chunks: string[] = []
  let current = ''

  const pushChunk = (content: string) => {
    const trimmed = content.trim()
    if (trimmed) chunks.push(trimmed)
  }

  for (const para of paragraphs) {
    if ((current + '\n' + para).length > chunkSize && current) {
      pushChunk(current)
      current = para.slice(-overlap) // 保留重叠尾部
    }
    current = current ? `${current}\n${para}` : para
  }
  if (current.trim()) pushChunk(current)

  // 超长段落二次切分
  const result: string[] = []
  for (const chunk of chunks) {
    if (chunk.length <= chunkSize) {
      result.push(chunk)
    } else {
      for (let i = 0; i < chunk.length; i += chunkSize - overlap) {
        result.push(chunk.slice(i, i + chunkSize))
      }
    }
  }
  return result
}

const STOP_WORDS = new Set([
  '的', '了', '和', '是', '在', '我', '有', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'and', 'or', 'for', 'with', 'that', 'this',
  'it', 'as', 'at', 'by', 'from', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
])

/** 中文分词（按字符二元组）+ 英文单词 */
function tokenize(text: string): string[] {
  const tokens: string[] = []
  // 英文/数字单词
  for (const m of text.toLowerCase().matchAll(/[a-z0-9_]{2,}/g)) {
    tokens.push(m[0])
  }
  // 中文：按字符二元组（bigram）保留语义
  const cjk = text.match(/[\u4e00-\u9fff]/g) || []
  for (let i = 0; i < cjk.length - 1; i++) {
    const bigram = cjk[i] + cjk[i + 1]
    if (!STOP_WORDS.has(bigram)) tokens.push(bigram)
  }
  return tokens.filter(t => !STOP_WORDS.has(t))
}

/** 词频向量（未归一化） */
function buildVector(text: string): Map<string, number> {
  const vec = new Map<string, number>()
  for (const token of tokenize(text)) {
    vec.set(token, (vec.get(token) || 0) + 1)
  }
  return vec
}

function vectorNorm(vec: Map<string, number>): number {
  let sum = 0
  for (const v of vec.values()) sum += v * v
  return Math.sqrt(sum)
}

/** 余弦相似度（两个归一化向量） */
function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const [key, value] of small) {
    const other = large.get(key)
    if (other !== undefined) dot += value * other
  }
  return dot
}

export interface SearchResult {
  id: string
  text: string
  metadata: Record<string, unknown>
  score: number
}

/**
 * 内存向量存储：add 构建索引，search 余弦相似度 Top-K
 */
export class VectorStore {
  private docs = new Map<string, VectorDocument>()

  /** 清空所有文档 */
  clear(): void {
    this.docs.clear()
  }

  get size(): number {
    return this.docs.size
  }

  list(): { id: string; text: string; metadata: Record<string, unknown> }[] {
    return [...this.docs.values()].map(d => ({ id: d.id, text: d.text, metadata: d.metadata }))
  }

  /** 添加（或替换）一条文档（可含多条分块文本） */
  add(id: string, texts: string[], metadata: Record<string, unknown> = {}): void {
    const existing = this.docs.get(id)
    if (existing) {
      // 替换：先移除旧向量再写入
      this.docs.delete(id)
    }
    texts.forEach((text, i) => {
      const vector = buildVector(text)
      const doc: VectorDocument = {
        id: `${id}#${i}`,
        text,
        metadata: { ...metadata, docId: id, chunkIndex: i },
        vector,
        norm: vectorNorm(vector)
      }
      this.docs.set(doc.id, doc)
    })
  }

  /** 按文档 id 删除 */
  remove(docId: string): void {
    for (const key of [...this.docs.keys()]) {
      if (key.startsWith(`${docId}#`)) this.docs.delete(key)
    }
  }

  /** 相似度检索 Top-K */
  search(query: string, topK = 5, minScore = 0.05): SearchResult[] {
    const queryVec = buildVector(query)
    const queryNorm = vectorNorm(queryVec)
    if (queryNorm === 0) return []

    const scored: SearchResult[] = []
    for (const doc of this.docs.values()) {
      const score = doc.norm === 0 ? 0 : cosine(queryVec, doc.vector) / (queryNorm * doc.norm)
      if (score >= minScore) {
        scored.push({ id: doc.id, text: doc.text, metadata: doc.metadata, score })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }
}
