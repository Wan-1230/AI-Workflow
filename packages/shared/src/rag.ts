/**
 * RAG 索引的运行时契约。
 *
 * 放在 shared 而不是 engine 里，是为了让 NodeContext 能引用它：
 * shared 不能反向 import engine（那条依赖曾把循环作用域分析逼成两份实现）。
 * 类型在此声明，engine 的 VectorStore 按结构实现，不需要 implements。
 */

export type VectorScheme =
  | { kind: 'tfidf' }
  | { kind: 'embed'; model: string; dim: number }

export interface SearchResult {
  id: string
  text: string
  metadata: Record<string, unknown>
  score: number
}

export interface StoreStats {
  documents: number
  chunks: number
  vocabulary: number
  scheme: VectorScheme | null
}

export interface AddResult {
  deduped: boolean
  docId: string
  chunkCount: number
}

export interface RagIndex {
  readonly size: number
  readonly currentScheme: VectorScheme | null
  /** embedding 为 null 时按词频（TF-IDF）写入 */
  add(
    docId: string,
    texts: string[],
    metadata?: Record<string, unknown>,
    embedding?: { vectors: number[][]; model: string } | null
  ): Promise<AddResult>
  search(query: string, topK?: number, minScore?: number): Promise<SearchResult[]>
  searchByEmbedding(queryVector: number[], topK?: number, minScore?: number): Promise<SearchResult[]>
  remove(docIdOrHash: string): Promise<number>
  clear(): Promise<void>
  list(): { id: string; text: string; metadata: Record<string, unknown> }[]
  stats(): StoreStats
  ensureLoaded(): Promise<void>
}
