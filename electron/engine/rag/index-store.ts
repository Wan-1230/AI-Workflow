import { readFile, writeFile, rename, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import type { IndexIo } from './vector-store'

/* =====================================================================
   索引落盘

   为什么是文件而不是第 7 个 SQLite 库：向量是派生物，不是用户数据 ——
   它应当能一眼看懂、能删、能备份，而且不该给"6 库合一"再添一个合并对象。

   写盘走 tmp + rename：进程在写一半时被杀，下次读到的是旧索引而不是半截 JSON。
   ===================================================================== */

export class FileIndexIo implements IndexIo {
  private file: string

  constructor(filePath: string) {
    this.file = filePath
  }

  async load(): Promise<string | null> {
    try {
      return await readFile(this.file, 'utf-8')
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return null
      throw err
    }
  }

  async save(content: string): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = join(dirname(this.file), `.rag-index.${process.pid}.${Date.now()}.tmp`)
    await writeFile(tmp, content, 'utf-8')
    await rename(tmp, this.file)
  }
}

/** 测试与"不落盘"场景用；调用 snapshot 可查看写出去过什么 */
export class MemoryIndexIo implements IndexIo {
  private store: string | null = null
  writes = 0

  constructor(initial?: string) {
    this.store = initial ?? null
  }

  async load(): Promise<string | null> {
    return this.store
  }

  async save(content: string): Promise<void> {
    this.writes += 1
    this.store = content
  }

  snapshot(): string | null {
    return this.store
  }
}

export const RAG_INDEX_FILE = 'rag-index.json'
