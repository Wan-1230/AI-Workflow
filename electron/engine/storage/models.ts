import Database from 'better-sqlite3'
import { openStore } from './connection'
import { join } from 'path'
import { app, safeStorage } from 'electron'
import type { ModelConfig, ModelConfigInput, ModelTestResult } from '@shared/model'

interface ModelRow {
  id: string
  name: string
  provider: string
  base_url: string
  api_key_encrypted: Buffer | null
  model: string
  temperature: number
  max_tokens: number
  is_default: number
  created_at: string
  updated_at: string
}

/**
 * 模型库存储
 * API Key 通过 Electron safeStorage 加密落盘，渲染进程只感知 hasApiKey
 */
export class ModelStore {
  private db: Database.Database

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || join(app.getPath('userData'), 'models.db')
    this.db = openStore('models', resolvedPath)
    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key_encrypted BLOB,
        model TEXT NOT NULL,
        temperature REAL NOT NULL DEFAULT 0.7,
        max_tokens INTEGER NOT NULL DEFAULT 2048,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }

  private rowToConfig(row: ModelRow): ModelConfig {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider as ModelConfig['provider'],
      baseUrl: row.base_url,
      hasApiKey: row.api_key_encrypted !== null,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /** 加密存储 API Key（safeStorage 不可用时抛错） */
  private encryptKey(value: string): Buffer {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统不支持安全存储加密，无法保存 API Key')
    }
    return safeStorage.encryptString(value)
  }

  /** 解密 API Key（供执行时调用，不经过 IPC 返回渲染进程） */
  getApiKey(id: string): string | null {
    const row = this.db.prepare('SELECT api_key_encrypted FROM models WHERE id = ?').get(id) as unknown as ModelRow | undefined
    if (!row?.api_key_encrypted) return null
    try {
      return safeStorage.decryptString(row.api_key_encrypted)
    } catch {
      return null
    }
  }

  /** 获取默认模型的 Key（LLM 节点未指定模型时使用） */
  getDefaultApiKey(): { modelId: string; apiKey: string; baseUrl: string; model: string } | null {
    const row = this.db.prepare(
      'SELECT * FROM models WHERE is_default = 1 LIMIT 1'
    ).get() as unknown as ModelRow | undefined
    if (!row?.api_key_encrypted) return null
    try {
      return {
        modelId: row.id,
        apiKey: safeStorage.decryptString(row.api_key_encrypted),
        baseUrl: row.base_url,
        model: row.model
      }
    } catch {
      return null
    }
  }

  /** 新建模型 */
  create(input: ModelConfigInput): ModelConfig {
    const now = new Date().toISOString()
    const id = input.id || `model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const encrypted = input.apiKey ? this.encryptKey(input.apiKey) : null

    // 首个模型自动设为默认
    const count = (this.db.prepare('SELECT COUNT(*) as c FROM models').get() as unknown as { c: number }).c
    const isDefault = input.isDefault ?? count === 0

    if (isDefault) this.clearDefault()

    this.db.prepare(`
      INSERT INTO models (id, name, provider, base_url, api_key_encrypted, model, temperature, max_tokens, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.name, input.provider, input.baseUrl, encrypted, input.model,
      input.temperature, input.maxTokens, isDefault ? 1 : 0, now, now
    )
    return this.getConfig(id)!
  }

  /** 更新模型 */
  update(id: string, input: ModelConfigInput): ModelConfig | null {
    const existing = this.getConfig(id)
    if (!existing) return null
    const now = new Date().toISOString()

    // API Key 仅在提交新值时更新
    const encrypted = input.apiKey ? this.encryptKey(input.apiKey) : undefined

    if (input.isDefault) this.clearDefault()

    this.db.prepare(`
      UPDATE models SET
        name = ?, provider = ?, base_url = ?, model = ?, temperature = ?, max_tokens = ?, is_default = ?,
        api_key_encrypted = COALESCE(?, api_key_encrypted),
        updated_at = ?
      WHERE id = ?
    `).run(
      input.name, input.provider, input.baseUrl, input.model, input.temperature, input.maxTokens,
      input.isDefault ? 1 : existing.isDefault ? 1 : 0,
      encrypted ?? null, now, id
    )
    return this.getConfig(id)
  }

  /** 设为默认 */
  setDefault(id: string): boolean {
    if (!this.getConfig(id)) return false
    // 清掉旧默认与设新默认之间若失败，库里会一个默认都没有；两步必须同事务
    this.db.transaction(() => {
      this.clearDefault()
      this.db.prepare('UPDATE models SET is_default = 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), id)
    })()
    return true
  }

  private clearDefault() {
    this.db.prepare('UPDATE models SET is_default = 0 WHERE is_default = 1').run()
  }

  /** 模型列表 */
  list(): ModelConfig[] {
    const rows = this.db.prepare('SELECT * FROM models ORDER BY is_default DESC, updated_at DESC').all() as unknown as ModelRow[]
    return rows.map(r => this.rowToConfig(r))
  }

  getConfig(id: string): ModelConfig | null {
    const row = this.db.prepare('SELECT * FROM models WHERE id = ?').get(id) as unknown as ModelRow | undefined
    return row ? this.rowToConfig(row) : null
  }

  /** 删除模型（默认模型被删除时自动指定新的默认） */
  delete(id: string): boolean {
    const wasDefault = this.getConfig(id)?.isDefault
    const result = this.db.prepare('DELETE FROM models WHERE id = ?').run(id)
    if (result.changes > 0 && wasDefault) {
      const first = this.db.prepare('SELECT id FROM models ORDER BY updated_at DESC LIMIT 1').get() as unknown as { id: string } | undefined
      if (first) this.setDefault(first.id)
    }
    return result.changes > 0
  }

  /** 连通性测试：调用 OpenAI 兼容 /models 或最小 chat 请求 */
  async testConnection(id: string, apiKeyOverride?: string): Promise<ModelTestResult> {
    const config = this.getConfig(id)
    if (!config) return { success: false, message: '模型配置不存在' }

    const apiKey = apiKeyOverride ?? this.getApiKey(id)
    if (!apiKey) return { success: false, message: '未配置 API Key，请先填写密钥' }

    const baseUrl = config.baseUrl.replace(/\/+$/, '')
    const startedAt = Date.now()

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false
        }),
        signal: controller.signal
      })
      clearTimeout(timer)

      const latency = Date.now() - startedAt
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return {
          success: false,
          message: `请求失败 (${res.status}): ${text.slice(0, 200) || res.statusText}`,
          latency
        }
      }
      const data = (await res.json()) as { model?: string }
      return {
        success: true,
        message: `连接成功，模型响应正常`,
        latency,
        respondedModel: data.model
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        message: `连接失败: ${message}`,
        latency: Date.now() - startedAt
      }
    }
  }

  close(): void {
    this.db.close()
  }
}
