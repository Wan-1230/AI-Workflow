import Database from 'better-sqlite3'
import { openStore } from './connection'
import { join } from 'path'
import { app } from 'electron'
import type { NodeResult } from '@shared/workflow'

export interface ExecutionRecord {
  id: string
  workflowId: string
  workflowName: string
  status: 'completed' | 'error' | 'cancelled'
  startedAt: string
  finishedAt: string
  duration: number
  nodeCount: number
  resultsJson: string
}

/**
 * executions 表的行形状（列名即 SQL 中的名字）。
 * 读取处曾三处重复 `as any` + 手工映射，统一由此派生。
 */
interface ExecutionRow {
  id: string
  workflow_id: string
  workflow_name: string
  status: 'completed' | 'error' | 'cancelled'
  started_at: string
  finished_at: string
  duration_ms: number
  node_count: number
  results_json: string
  error_message: string | null
}

function rowToRecord(row: ExecutionRow): ExecutionRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    duration: row.duration_ms,
    nodeCount: row.node_count,
    resultsJson: row.results_json
  }
}
/**
 * 执行历史存储
 * 使用 SQLite 持久化工作流执行记录
 */
export class ExecutionStorage {
  private db: Database.Database

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || join(app.getPath('userData'), 'executions.db')
    this.db = openStore('executions', resolvedPath)

    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        workflow_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('completed', 'error', 'cancelled')),
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        node_count INTEGER NOT NULL DEFAULT 0,
        results_json TEXT NOT NULL DEFAULT '{}',
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_executions_workflow
        ON executions(workflow_id);

      CREATE INDEX IF NOT EXISTS idx_executions_time
        ON executions(started_at DESC);
    `)
  }

  /**
   * 记录一次执行
   */
  saveExecution(record: {
    id: string
    workflowId: string
    workflowName: string
    status: 'completed' | 'error' | 'cancelled'
    startedAt: number
    finishedAt: number
    nodeResults: Map<string, NodeResult>
  }): void {
    const resultsObj: Record<string, unknown> = {}
    for (const [key, value] of record.nodeResults) {
      resultsObj[key] = value
    }

    const duration = record.finishedAt - record.startedAt
    const errorMessage = this.extractError(record.nodeResults)

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO executions
        (id, workflow_id, workflow_name, status, started_at, finished_at, duration_ms, node_count, results_json, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      record.id,
      record.workflowId,
      record.workflowName,
      record.status,
      new Date(record.startedAt).toISOString(),
      new Date(record.finishedAt).toISOString(),
      duration,
      record.nodeResults.size,
      JSON.stringify(resultsObj),
      errorMessage
    )
  }

  /**
   * 查询执行历史（分页）
   */
  getHistory(options?: {
    workflowId?: string
    limit?: number
    offset?: number
  }): ExecutionRecord[] {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    let sql = 'SELECT * FROM executions'
    const params: unknown[] = []

    if (options?.workflowId) {
      sql += ' WHERE workflow_id = ?'
      params.push(options.workflowId)
    }

    sql += ' ORDER BY started_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const rows = this.db.prepare(sql).all(...params) as unknown as ExecutionRow[]

    return rows.map(rowToRecord)
  }

  /**
   * 获取单次执行详情
   */
  getExecution(id: string): ExecutionRecord | null {
    const row = this.db.prepare('SELECT * FROM executions WHERE id = ?').get(id) as unknown as ExecutionRow | undefined
    if (!row) return null

    return rowToRecord(row)
  }

  /**
   * 清理历史记录（保留最近 N 条）
   */
  pruneHistory(keepCount: number = 100): number {
    const result = this.db.prepare(`
      DELETE FROM executions WHERE id NOT IN (
        SELECT id FROM executions ORDER BY started_at DESC LIMIT ?
      )
    `).run(keepCount)

    return result.changes
  }

  /**
   * 获取统计信息
   */
  /**
   * 删项目时清掉它的执行历史。

   * 跨文件做不了外键级联，所以顺序上先删子（历史）再删父（项目）：
   * 中途失败只剩「历史已清、项目还在」，用户重试即可；反过来就会留下永久孤儿。
   */
  purgeWorkflow(workflowId: string): number {
    return this.db.prepare('DELETE FROM executions WHERE workflow_id = ?').run(workflowId).changes
  }

  /** 启动清理：以前删项目不连带删记录，那些行会永远挂在日志页且打不开 */
  purgeOrphans(existingWorkflowIds: Iterable<string>): number {
    const keep = [...existingWorkflowIds]
    if (keep.length === 0) {
      return this.db.prepare('DELETE FROM executions').run().changes
    }
    const marks = keep.map(() => '?').join(', ')
    return this.db
      .prepare(`DELETE FROM executions WHERE workflow_id NOT IN (${marks})`)
      .run(...keep).changes
  }
  getStats(): { total: number; completed: number; error: number; avgDuration: number } {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
        AVG(duration_ms) as avg_duration
      FROM executions
    `).get() as unknown as { total: number | null; completed: number | null; error: number | null; avg_duration: number | null }

    return {
      total: row.total || 0,
      completed: row.completed || 0,
      error: row.error || 0,
      avgDuration: Math.round(row.avg_duration || 0)
    }
  }

  private extractError(nodeResults: Map<string, NodeResult>): string | null {
    for (const [, result] of nodeResults) {
      if (result.status === 'error' && result.error) {
        return `[${result.nodeId}] ${result.error}`
      }
    }
    return null
  }

  close(): void {
    this.db.close()
  }
}
