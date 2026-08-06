import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import type { WorkflowDefinition } from '@shared/workflow'
import type { ProjectSummary, ProjectRecord, CreateProjectInput } from '@shared/project'

interface ProjectRow {
  id: string
  name: string
  description: string
  template: string | null
  workflow_json: string
  created_at: string
  updated_at: string
}

/**
 * 项目库存储（多项目管理）
 * 每个项目包含完整工作流 JSON，持久化于 SQLite
 */
export class ProjectStore {
  private db: Database.Database

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || join(app.getPath('userData'), 'projects.db')
    this.db = new Database(resolvedPath)
    this.db.pragma('journal_mode = WAL')
    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        template TEXT,
        workflow_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);
    `)
  }

  private rowToSummary(row: ProjectRow): ProjectSummary {
    let workflow: WorkflowDefinition | null = null
    try {
      workflow = JSON.parse(row.workflow_json) as WorkflowDefinition
    } catch { /* 数据损坏时按空处理 */ }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      template: row.template || undefined,
      nodeCount: workflow?.nodes?.length ?? 0,
      edgeCount: workflow?.edges?.length ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /** 创建项目 */
  create(input: CreateProjectInput, workflow: WorkflowDefinition): ProjectSummary {
    const now = new Date().toISOString()
    const template = input.templateId || null
    this.db.prepare(`
      INSERT INTO projects (id, name, description, template, workflow_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      workflow.id,
      input.name,
      input.description || '',
      template,
      JSON.stringify(workflow),
      now,
      now
    )
    return {
      id: workflow.id,
      name: input.name,
      description: input.description || '',
      template: template || undefined,
      nodeCount: workflow.nodes?.length ?? 0,
      edgeCount: workflow.edges?.length ?? 0,
      createdAt: now,
      updatedAt: now
    }
  }

  /** 更新项目（名称/描述） */
  updateMeta(id: string, meta: { name?: string; description?: string }): boolean {
    const existing = this.get(id)
    if (!existing) return false
    const now = new Date().toISOString()
    this.db.prepare(`
      UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?
    `).run(
      meta.name ?? existing.summary.name,
      meta.description ?? existing.summary.description,
      now,
      id
    )
    return true
  }

  /** 保存工作流内容（自动更新名称与节点统计） */
  saveWorkflow(id: string, workflow: WorkflowDefinition): boolean {
    const existing = this.get(id)
    if (!existing) return false
    this.db.prepare(`
      UPDATE projects SET name = ?, workflow_json = ?, updated_at = ? WHERE id = ?
    `).run(workflow.name, JSON.stringify(workflow), new Date().toISOString(), id)
    return true
  }

  /** 复制项目（生成新 id 与时间戳） */
  duplicate(sourceId: string, newName: string): ProjectSummary | null {
    const source = this.get(sourceId)
    if (!source) return null
    const now = new Date().toISOString()
    const newId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const workflow: WorkflowDefinition = {
      ...source.workflow,
      id: newId,
      name: newName,
      updatedAt: now
    }
    this.db.prepare(`
      INSERT INTO projects (id, name, description, template, workflow_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      newName,
      `${source.summary.name} 的副本`,
      source.summary.template || null,
      JSON.stringify(workflow),
      now,
      now
    )
    return this.getSummary(newId)
  }

  /** 项目列表（按更新时间倒序） */
  list(): ProjectSummary[] {
    const rows = this.db.prepare(
      'SELECT * FROM projects ORDER BY updated_at DESC'
    ).all() as unknown as ProjectRow[]
    return rows.map(r => this.rowToSummary(r))
  }

  /** 项目摘要 */
  getSummary(id: string): ProjectSummary | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as ProjectRow | undefined
    return row ? this.rowToSummary(row) : null
  }

  /** 项目完整数据（含工作流） */
  get(id: string): ProjectRecord | null {
    const summary = this.getSummary(id)
    if (!summary) return null
    const row = this.db.prepare('SELECT workflow_json FROM projects WHERE id = ?').get(id) as unknown as { workflow_json: string }
    try {
      const workflow = JSON.parse(row.workflow_json) as WorkflowDefinition
      return { summary, workflow }
    } catch {
      return null
    }
  }

  /** 删除项目 */
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return result.changes > 0
  }

  close(): void {
    this.db.close()
  }
}
