import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import type { PromptTemplate, PromptTemplateInput, PromptRenderResult } from '@shared/prompt'

interface PromptRow {
  id: string
  name: string
  content: string
  category: string
  description: string | null
  favorite: number
  variables_json: string
  usage_count: number
  created_at: string
  updated_at: string
}

/** 从模板内容中解析 {{varName}} 占位符 */
export function parseTemplateVariables(content: string): string[] {
  const matches = content.match(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g) || []
  const vars = new Set<string>()
  for (const m of matches) {
    const name = m.replace(/\{\{\s*|\s*\}\}/g, '')
    vars.add(name)
  }
  return [...vars]
}

/**
 * 提示词模板库存储
 * 支持分类 / 收藏 / 搜索 / 变量占位符解析与渲染
 */
export class PromptStore {
  private db: Database.Database

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || join(app.getPath('userData'), 'prompts.db')
    this.db = new Database(resolvedPath)
    this.db.pragma('journal_mode = WAL')
    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '通用',
        description TEXT,
        favorite INTEGER NOT NULL DEFAULT 0,
        variables_json TEXT NOT NULL DEFAULT '[]',
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
      CREATE INDEX IF NOT EXISTS idx_prompts_favorite ON prompts(favorite DESC);
    `)
  }

  private rowToTemplate(row: PromptRow): PromptTemplate {
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      category: row.category,
      description: row.description || undefined,
      favorite: row.favorite === 1,
      variables: JSON.parse(row.variables_json) as string[],
      usageCount: row.usage_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /** 新建/更新模板（id 存在则更新） */
  upsert(input: PromptTemplateInput): PromptTemplate {
    const now = new Date().toISOString()
    const id = input.id || `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const variables = JSON.stringify(parseTemplateVariables(input.content))

    const existing = this.db.prepare('SELECT id FROM prompts WHERE id = ?').get(id) as unknown as { id: string } | undefined
    if (existing) {
      this.db.prepare(`
        UPDATE prompts SET name = ?, content = ?, category = ?, description = ?, favorite = ?, variables_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.name, input.content, input.category || '通用', input.description ?? null,
        input.favorite ? 1 : 0, variables, now, id
      )
    } else {
      this.db.prepare(`
        INSERT INTO prompts (id, name, content, category, description, favorite, variables_json, usage_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        id, input.name, input.content, input.category || '通用', input.description ?? null,
        input.favorite ? 1 : 0, variables, now, now
      )
    }
    return this.get(id)!
  }

  get(id: string): PromptTemplate | null {
    const row = this.db.prepare('SELECT * FROM prompts WHERE id = ?').get(id) as unknown as PromptRow | undefined
    return row ? this.rowToTemplate(row) : null
  }

  /** 列表：支持关键词搜索 + 分类过滤 + 仅收藏 */
  list(options?: { keyword?: string; category?: string; favoriteOnly?: boolean }): PromptTemplate[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (options?.keyword) {
      conditions.push('(name LIKE ? OR content LIKE ? OR description LIKE ?)')
      const kw = `%${options.keyword}%`
      params.push(kw, kw, kw)
    }
    if (options?.category) {
      conditions.push('category = ?')
      params.push(options.category)
    }
    if (options?.favoriteOnly) {
      conditions.push('favorite = 1')
    }

    let sql = 'SELECT * FROM prompts'
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`
    sql += ' ORDER BY favorite DESC, updated_at DESC'

    const rows = this.db.prepare(sql).all(...params) as unknown as PromptRow[]
    return rows.map(r => this.rowToTemplate(r))
  }

  /** 全部分类（去重） */
  categories(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT category FROM prompts ORDER BY category').all() as unknown as { category: string }[]
    return rows.map(r => r.category)
  }

  /** 切换收藏 */
  toggleFavorite(id: string): boolean {
    const t = this.get(id)
    if (!t) return false
    this.db.prepare('UPDATE prompts SET favorite = ?, updated_at = ? WHERE id = ?')
      .run(t.favorite ? 0 : 1, new Date().toISOString(), id)
    return true
  }

  /** 记录使用次数 */
  recordUsage(id: string): void {
    this.db.prepare('UPDATE prompts SET usage_count = usage_count + 1 WHERE id = ?').run(id)
  }

  /** 渲染模板：替换 {{varName}} 占位符 */
  render(id: string, variables: Record<string, unknown>): PromptRenderResult {
    const t = this.get(id)
    if (!t) return { rendered: '', missingVariables: [] }
    this.recordUsage(id)

    const missingVariables: string[] = []
    let rendered = t.content
    for (const v of t.variables) {
      if (v in variables) {
        rendered = rendered.replaceAll(
          new RegExp(`\\{\\{\\s*${escapeRegExp(v)}\\s*\\}\\}`, 'g'),
          String(variables[v])
        )
      } else {
        missingVariables.push(v)
      }
    }
    return { rendered, missingVariables }
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM prompts WHERE id = ?').run(id)
    return result.changes > 0
  }

  close(): void {
    this.db.close()
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
