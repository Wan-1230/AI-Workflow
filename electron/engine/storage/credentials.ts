import { safeStorage } from 'electron'
import Database from 'better-sqlite3'
import { openStore } from './connection'
import { join } from 'path'
import { app } from 'electron'

export interface CredentialEntry {
  key: string
  displayName: string
  createdAt: string
  updatedAt: string
}

/**
 * 凭证管理器
 * 使用 Electron safeStorage API 加密存储 API Key 等敏感信息
 * 节点配置中通过 {{credentials.KEY_NAME}} 引用
 */
export class CredentialManager {
  private db: Database.Database

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || join(app.getPath('userData'), 'credentials.db')
    this.db = openStore('credentials', resolvedPath)
    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS credentials (
        key TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        encrypted_value BLOB NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }

  /**
   * 存储凭证（加密）
   */
  set(key: string, value: string, displayName?: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统不支持安全存储加密')
    }

    const encrypted = safeStorage.encryptString(value)
    const now = new Date().toISOString()

    const existing = this.db.prepare('SELECT key FROM credentials WHERE key = ?').get(key)

    if (existing) {
      this.db.prepare(`
        UPDATE credentials SET encrypted_value = ?, display_name = ?, updated_at = ? WHERE key = ?
      `).run(encrypted, displayName || key, now, key)
    } else {
      this.db.prepare(`
        INSERT INTO credentials (key, display_name, encrypted_value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(key, displayName || key, encrypted, now, now)
    }
  }

  /**
   * 获取凭证（解密）
   */
  get(key: string): string | null {
    const row = this.db.prepare('SELECT encrypted_value FROM credentials WHERE key = ?').get(key) as
      | { encrypted_value: Buffer }
      | undefined
    if (!row) return null

    try {
      return safeStorage.decryptString(row.encrypted_value)
    } catch {
      return null
    }
  }

  /**
   * 批量获取所有凭证（解密后的 key-value 对）
   * 用于注入到执行上下文的 secrets 中
   */
  getAll(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, encrypted_value FROM credentials').all() as Array<{ key: string; encrypted_value: Buffer }>
    const result: Record<string, string> = {}

    for (const row of rows) {
      try {
        result[row.key] = safeStorage.decryptString(row.encrypted_value)
      } catch {
        // 解密失败的凭证跳过
      }
    }

    return result
  }

  /**
   * 列出所有凭证（不返回值）
   */
  list(): CredentialEntry[] {
    const rows = this.db.prepare(
      'SELECT key, display_name, created_at, updated_at FROM credentials ORDER BY updated_at DESC'
    ).all() as Array<{ key: string; display_name: string; created_at: string; updated_at: string }>

    return rows.map(row => ({
      key: row.key,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  /**
   * 删除凭证
   */
  delete(key: string): boolean {
    const result = this.db.prepare('DELETE FROM credentials WHERE key = ?').run(key)
    return result.changes > 0
  }

  close(): void {
    this.db.close()
  }
}
