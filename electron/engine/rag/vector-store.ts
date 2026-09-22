/* =====================================================================
   轻量向量存储：TF-IDF + 可选真实 embedding，带内容去重与落盘

   适用于本地 RAG 与中小规模文档（千级 chunk 暴力扫描足够）。
   刻意不引入向量库依赖：那会带来原生模块，而这台机器上的教训是
   "原生模块 + Electron ABI" 足以让整个构建链失稳。

   两处设计取舍值得说明：
   1) 存的是原始词频而非算好的 TF-IDF。IDF 依赖全库统计，增删文档就会
      让历史向量过期；把 IDF 推到检索时算，索引永不需要重算。
   2) scheme 不一致时直接报错而不是回退。混排 embedding 与词频分数会让
      "最相关的片段"变成随机数，那种错法比不检索更糟。
   ===================================================================== */

import { createHash } from 'crypto'

export interface ChunkOptions {
  /** 每块字符数 */
  chunkSize?: number
  /** 相邻块重叠字符数 */
  overlap?: number
}

import type { AddResult, SearchResult, StoreStats, VectorScheme } from '@shared/rag'

export type { AddResult, SearchResult, StoreStats, VectorScheme } from '@shared/rag'

export interface VectorDocument {
  /** `${hash}#${chunkIndex}` */
  id: string
  /** 整篇文档内容的哈希，用于去重与重建 */
  hash: string
  text: string
  metadata: Record<string, unknown>
  /** tfidf：词 → 原始词频；embed：稠密向量 */
  terms?: Map<string, number>
  embedding?: number[]
  /** 预计算的 L2 模长（tfidf 用原始词频模长，idf 权重在检索时套） */
  norm: number
}

/** 持久化注入点：测试用内存实现，主进程用文件实现 */
export interface IndexIo {
  load(): Promise<string | null>
  save(content: string): Promise<void>
}

export const INDEX_FORMAT_VERSION = 1

/** 文本切分：按段落/句子边界优先，兼顾 chunkSize */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 500
  const overlap = options.overlap ?? 80
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return []

  const paragraphs = clean.split(/\n+/).filter(p => p.trim().length > 0)
  const chunks: string[] = []
  let current = ''

  const pushChunk = (content: string): void => {
    const trimmed = content.trim()
    if (trimmed) chunks.push(trimmed)
  }

  for (const para of paragraphs) {
    if ((current + '\n' + para).length > chunkSize && current) {
      pushChunk(current)
      // 重叠只能来自上一块的结尾。取下一段的开头会把同一段文字重复塞进新块，
      // 表现为「块间重复远超 overlap 设定」，切得越碎重复越多。
      current = overlap > 0 ? current.slice(-overlap) : ''
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
      const step = Math.max(1, chunkSize - overlap)
      for (let i = 0; i < chunk.length; i += step) {
        result.push(chunk.slice(i, i + chunkSize))
        if (i + chunkSize >= chunk.length) break
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

/**
 * 分词：英文按词，中文按字符二元组，另外保留整段中的英文/数字混合 token。
 *
 * 旧实现对中文只发 bigram，导致「向量数据库」与「数据库向量」这类
 * 跨边界语义全靠运气；这里同时保留单字以兜住短查询。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  const lower = text.toLowerCase()

  for (const m of lower.matchAll(/[a-z0-9_][a-z0-9_.+-]{1,}/g)) tokens.push(m[0])

  // 中文串按 bigram + 单字，兼顾召回与区分度
  const runs = lower.match(/[\u4e00-\u9fff]+/g) || []
  for (const run of runs) {
    if (run.length === 1) {
      if (!STOP_WORDS.has(run)) tokens.push(run)
      continue
    }
    for (let i = 0; i < run.length - 1; i++) {
      const bigram = run.slice(i, i + 2)
      if (!STOP_WORDS.has(bigram)) tokens.push(bigram)
    }
  }

  return tokens
}

/** 原始词频（不做 idf 加权） */
function termFrequencies(text: string): Map<string, number> {
  const vec = new Map<string, number>()
  for (const token of tokenize(text)) vec.set(token, (vec.get(token) || 0) + 1)
  return vec
}

function l2norm(values: Iterable<number>): number {
  let sum = 0
  for (const v of values) sum += v * v
  return Math.sqrt(sum)
}

/** 文档内容哈希：去重与"入库幂等"的地基 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex').slice(0, 16)
}

export class SchemeMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemeMismatchError'
  }
}

export class VectorStore {
  private docs = new Map<string, VectorDocument>()
  /** 文档内容哈希 → 该文档首个 chunk key 前缀（docId） */
  private byHash = new Map<string, string>()
  /** 词 → 出现该词的 chunk 数 */
  private df = new Map<string, number>()
  private scheme: VectorScheme | null = null
  private io: IndexIo | null
  /** 首次访问时懒加载；加载失败只当空库，但会喊出来 */
  private loaded = false
  private normCache = new Map<string, number>()

  constructor(io: IndexIo | null = null) {
    this.io = io
  }

  get size(): number {
    return this.docs.size
  }

  get currentScheme(): VectorScheme | null {
    return this.scheme
  }

  stats(): StoreStats {
    return {
      documents: this.byHash.size,
      chunks: this.docs.size,
      vocabulary: this.df.size,
      scheme: this.scheme
    }
  }

  list(): { id: string; text: string; metadata: Record<string, unknown> }[] {
    return [...this.docs.values()].map(d => ({ id: d.id, text: d.text, metadata: d.metadata }))
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    if (!this.io) return
    let raw: string | null = null
    try {
      raw = await this.io.load()
    } catch (err: unknown) {
      console.warn(`[rag] 索引读取失败，按空库继续：${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (!raw) return
    const parsed = deserialize(raw)
    if ('error' in parsed) {
      console.warn(`[rag] 索引不可用（${parsed.error}），已忽略旧文件；请重新入库`)
      return
    }
    this.scheme = parsed.scheme
    for (const doc of parsed.docs) this.docs.set(doc.id, doc)
    this.rebuildStatistics()
    this.scheme = parsed.scheme // rebuild 会因空库清掉，这里以文件里记录的为准
  }

  /**
   * 添加一篇文档（切分后的多个 chunk）。
   *
   * 内容哈希命中已有文档时不再重复写入 —— 过去每次跑都换个 docId，
   * 同一个问题会被同一篇文档的 N 份拷贝塞满 Top-K。
   */
  async add(
    docId: string,
    texts: string[],
    metadata: Record<string, unknown> = {},
    embedding?: { vectors: number[][]; model: string } | null
  ): Promise<AddResult> {
    await this.ensureLoaded()

    const joined = texts.join('\n')
    const hash = contentHash(joined)
    const known = this.byHash.get(hash)
    if (known) {
      return { deduped: true, docId: known, chunkCount: this.countChunksOf(known) }
    }

    const scheme: VectorScheme = embedding
      ? { kind: 'embed', model: embedding.model, dim: embedding.vectors[0]?.length ?? 0 }
      : { kind: 'tfidf' }
    this.assertScheme(scheme)

    if (embedding) {
      if (embedding.vectors.length !== texts.length) {
        throw new Error(`向量条数 ${embedding.vectors.length} 与文本块数 ${texts.length} 不一致`)
      }
      const dim = embedding.vectors[0]?.length ?? 0
      if (dim === 0) throw new Error('embedding 返回了空向量')
      for (const v of embedding.vectors) {
        if (v.length !== dim) {
          throw new Error(`embedding 维度不一致（${v.length} vs ${dim}），模型可能换过，需要清空索引重建`)
        }
      }
    }

    texts.forEach((text, i) => {
      const terms = embedding ? undefined : termFrequencies(text)
      const vector = embedding?.vectors[i]
      const doc: VectorDocument = {
        id: `${hash}#${i}`,
        hash,
        text,
        metadata: { ...metadata, docId, chunkIndex: i },
        terms,
        embedding: vector,
        norm: terms ? l2norm(terms.values()) : (vector ? l2norm(vector) : 0)
      }
      this.ingest(doc, true)
    })

    if (!this.byHash.has(hash)) this.byHash.set(hash, docId)
    await this.flush()
    return { deduped: false, docId, chunkCount: texts.length }
  }

  /** 按 docId（或内容哈希）删除整篇文档 */
  async remove(docIdOrHash: string): Promise<number> {
    await this.ensureLoaded()
    let removed = 0
    const byDocId = (d: VectorDocument): boolean =>
      String(d.metadata.docId ?? '') === docIdOrHash || d.hash === docIdOrHash
    for (const [key, doc] of [...this.docs.entries()]) {
      if (!byDocId(doc)) continue
      this.docs.delete(key)
      removed += 1
    }
    if (removed) {
      this.rebuildStatistics()
      await this.flush()
    }
    return removed
  }

  async clear(): Promise<void> {
    this.docs.clear()
    this.byHash.clear()
    this.df.clear()
    this.normCache.clear()
    this.scheme = null
    this.loaded = true
    await this.flush()
  }

  async search(query: string, topK = 5, minScore = 0.05): Promise<SearchResult[]> {
    await this.ensureLoaded()
    if (this.docs.size === 0) return []

    const scheme: VectorScheme = this.scheme ?? { kind: 'tfidf' }
    if (scheme.kind === 'embed') {
      throw new SchemeMismatchError(
        `当前索引是 embedding 模型「${scheme.model}」建立的，词频查询无法与之比较。` +
        `请在检索节点里选择同一个向量模型，或清空索引后重新入库。`
      )
    }

    const qTerms = termFrequencies(query)
    if (qTerms.size === 0) return []
    const total = this.docs.size
    const idf = (term: string): number => Math.log(1 + total / (1 + (this.df.get(term) ?? 0)))

    const qWeighted = [...qTerms.entries()].map(([t, tf]) => tf * idf(t))
    const qNorm = l2norm(qWeighted)
    if (qNorm === 0) return []
    const qScored = new Map<string, number>(
      [...qTerms.entries()].map(([t, tf]) => [t, tf * idf(t)] as const)
    )

    const scored: SearchResult[] = []
    for (const doc of this.docs.values()) {
      if (!doc.terms) continue
      const dNorm = this.idfWeightedNorm(doc, idf)
      if (dNorm === 0) continue

      let dot = 0
      const [small, large] = doc.terms.size <= qScored.size ? [doc.terms, qScored] : [qScored, doc.terms]
      for (const [term, weight] of small) {
        const other = large.get(term)
        if (other !== undefined) dot += weight * other
      }
      const score = dot / (qNorm * dNorm)
      if (score >= minScore) {
        scored.push({ id: doc.id, text: doc.text, metadata: doc.metadata, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, Math.max(1, topK))
  }

  /** embedding 检索：查询向量由调用方准备好，这里只比距离 */
  async searchByEmbedding(queryVector: number[], topK = 5, minScore = 0.05): Promise<SearchResult[]> {
    await this.ensureLoaded()
    const scheme = this.scheme
    if (!scheme || scheme.kind !== 'embed') {
      throw new SchemeMismatchError(
        '当前索引是词频（TF-IDF）建立的，没有可比对的 embedding 向量。' +
        '请在入库节点选择向量模型并重新入库。'
      )
    }
    if (queryVector.length !== scheme.dim) {
      throw new SchemeMismatchError(
        `查询向量维度 ${queryVector.length} 与索引维度 ${scheme.dim}（模型 ${scheme.model}）不符，` +
        `说明两边用的不是同一个 embedding 模型。`
      )
    }

    const qNorm = l2norm(queryVector)
    if (qNorm === 0) return []
    const scored: SearchResult[] = []
    for (const doc of this.docs.values()) {
      if (!doc.embedding) continue
      let dot = 0
      for (let i = 0; i < queryVector.length; i++) dot += queryVector[i] * (doc.embedding[i] ?? 0)
      const score = doc.norm === 0 ? 0 : dot / (qNorm * doc.norm)
      if (score >= minScore) {
        scored.push({ id: doc.id, text: doc.text, metadata: doc.metadata, score })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, Math.max(1, topK))
  }

  /** 供入库前判断是否要走 embedding：库里已有异构数据时报错 */
  async assertAccepts(scheme: VectorScheme): Promise<void> {
    await this.ensureLoaded()
    this.assertScheme(scheme)
  }

  // ===== 内部 =====

  private countChunksOf(docId: string): number {
    let n = 0
    for (const doc of this.docs.values()) if (String(doc.metadata.docId ?? '') === docId) n += 1
    return n
  }

  private assertScheme(next: VectorScheme): void {
    if (!this.scheme || this.docs.size === 0) {
      this.scheme = next
      return
    }
    const cur = this.scheme
    const same = cur.kind === next.kind &&
      (cur.kind === 'tfidf' || (next.kind === 'embed' && cur.model === next.model && cur.dim === next.dim))
    if (!same) {
      const describe = (s: VectorScheme): string =>
        s.kind === 'tfidf' ? '词频（TF-IDF）' : `embedding 模型 ${s.model}（${s.dim} 维）`
      throw new SchemeMismatchError(
        `索引已由 ${describe(cur)} 建立，本次要用 ${describe(next)}。` +
        `两种分数不可比较，请清空索引后重新入库，或两边选同一套配置。`
      )
    }
  }

  private ingest(doc: VectorDocument, countDf: boolean): void {
    this.docs.set(doc.id, doc)
    if (doc.terms) {
      for (const term of doc.terms.keys()) {
        this.df.set(term, (this.df.get(term) ?? 0) + (countDf ? 1 : 0))
      }
    }
  }

  private rebuildStatistics(): void {
    this.df.clear()
    this.byHash.clear()
    this.normCache.clear()
    for (const doc of this.docs.values()) {
      if (doc.terms) {
        for (const term of doc.terms.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1)
      }
      const docId = String(doc.metadata.docId ?? '')
      if (docId && !this.byHash.has(doc.hash)) this.byHash.set(doc.hash, docId)
    }
    if (this.docs.size === 0) this.scheme = null
  }

  private idfWeightedNorm(doc: VectorDocument, idf: (term: string) => number): number {
    const cached = this.normCache.get(doc.id)
    if (cached !== undefined) return cached
    const norm = doc.terms ? l2norm([...doc.terms.entries()].map(([t, tf]) => tf * idf(t))) : 0
    this.normCache.set(doc.id, norm)
    return norm
  }

  private async flush(): Promise<void> {
    if (!this.io) return
    try {
      await this.io.save(serialize(this.scheme, this.docs.values()))
    } catch (err: unknown) {
      console.warn(`[rag] 索引写入失败（本次结果仍在内存中）：${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

interface SerializedDoc {
  id: string
  hash: string
  text: string
  meta: Record<string, unknown>
  terms?: [string, number][]
  embedding?: number[]
}

export function serialize(
  scheme: VectorScheme | null,
  docs: Iterable<VectorDocument>
): string {
  const out: SerializedDoc[] = []
  for (const d of docs) {
    out.push({
      id: d.id,
      hash: d.hash,
      text: d.text,
      meta: d.metadata,
      ...(d.terms ? { terms: [...d.terms.entries()] } : {}),
      ...(d.embedding ? { embedding: d.embedding } : {})
    })
  }
  return JSON.stringify({ version: INDEX_FORMAT_VERSION, scheme, docs: out })
}

export type DeserializeResult =
  | { scheme: VectorScheme | null; docs: VectorDocument[] }
  | { error: string }

export function deserialize(raw: string): DeserializeResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: '文件不是合法 JSON' }
  }
  const box = parsed as { version?: number; scheme?: VectorScheme; docs?: SerializedDoc[] }
  if (!box || typeof box !== 'object') return { error: '结构不是索引对象' }
  if (box.version !== INDEX_FORMAT_VERSION) {
    return { error: `索引版本 ${String(box.version)} 与当前 ${INDEX_FORMAT_VERSION} 不匹配` }
  }
  if (!Array.isArray(box.docs)) return { error: '缺少 docs 数组' }

  const docs: VectorDocument[] = []
  for (const d of box.docs) {
    if (!d || typeof d.text !== 'string' || typeof d.id !== 'string') continue
    docs.push({
      id: d.id,
      hash: typeof d.hash === 'string' ? d.hash : contentHash(d.text),
      text: d.text,
      metadata: d.meta && typeof d.meta === 'object' ? d.meta : {},
      terms: Array.isArray(d.terms) ? new Map(d.terms) : undefined,
      embedding: Array.isArray(d.embedding) ? d.embedding : undefined,
      norm: Array.isArray(d.terms)
        ? l2norm(d.terms.map(([, v]) => v))
        : (Array.isArray(d.embedding) ? l2norm(d.embedding) : 0)
    })
  }
  return { scheme: box.scheme ?? null, docs }
}
