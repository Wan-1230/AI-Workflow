import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import type { AppSettings, AppSettingsInput } from '@shared/settings'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'zh-CN',
  storagePath: '',
  debugMode: false,
  defaultTimeout: 120000,
  saveHistory: true,
}

/**
 * 应用设置存储（key-value，JSON 序列化）
 * storagePath 为空时使用 userData/workflows
 */
export class SettingsStore {
  private db: Database.Database

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || join(app.getPath('userData'), 'settings.db')
    this.db = new Database(resolvedPath)
    this.db.pragma('journal_mode = WAL')
    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  }

  /** 读取全部设置（与默认值合并） */
  getAll(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as unknown as { key: string; value: string }[]
    const stored: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        stored[row.key] = JSON.parse(row.value)
      } catch { /* 忽略损坏项 */ }
    }
    return { ...DEFAULT_SETTINGS, ...stored }
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.getAll()[key]
  }

  /** 更新部分设置 */
  update(input: AppSettingsInput): AppSettings {
    const current = this.getAll()
    const next = { ...current, ...input }
    const upsert = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    for (const [key, value] of Object.entries(input)) {
      upsert.run(key, JSON.stringify(value))
    }
    return next
  }

  /** 解析工作流存储目录（storagePath 为空时使用默认目录） */
  resolveWorkflowsDir(): string {
    const storagePath = this.get('storagePath')
    return storagePath || join(app.getPath('userData'), 'workflows')
  }

  close(): void {
    this.db.close()
  }
}
