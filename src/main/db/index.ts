import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

/**
 * 版本化迁移骨架。
 *
 * 此前六个库各自 CREATE TABLE IF NOT EXISTS，没有任何版本号与迁移记录：
 * 一旦列变动，老用户升级后写入即抛错，而启动本身"成功"，表现为所有页面空白，
 * 且无从回滚。这里建立权威版本轨与备份前置，S0 只落框架与两条数据清洗迁移，
 * 6 库合一留到 S4（届时把遗留库并入 app.db）。
 */

export type LegacyDb =
  | 'projects' | 'models' | 'prompts' | 'settings' | 'executions' | 'credentials'

const LEGACY_FILES: Record<LegacyDb, string> = {
  projects: 'projects.db',
  models: 'models.db',
  prompts: 'prompts.db',
  settings: 'settings.db',
  executions: 'executions.db',
  credentials: 'credentials.db'
}

export interface MigrationContext {
  /** 迁移框架自身的库（app.db） */
  app: Database.Database
  /** 打开遗留库；由运行器在迁移全部结束后统一关闭 */
  legacy(name: LegacyDb): Database.Database
  /** 写入一条加密凭证；返回 false 表示系统密钥环不可用 */
  setCredential(name: string, value: string, displayName: string): boolean
  credentialExists(name: string): boolean
  log(msg: string): void
}

export interface Migration {
  name: string
  /** 目标版本号；必须严格递增 */
  version: number
  /** 需要读写的遗留库 */
  databases: LegacyDb[]
  /** 破坏性迁移在执行前对涉及的每个遗留库做全量备份 */
  destructive: boolean
  /** 已在事务语境中调用；返回受影响条数用于迁移报告 */
  up(ctx: MigrationContext): number
}

export interface MigrationReport {
  applied: { name: string; affected: number; backupDir: string | null }[]
  fromVersion: number
  toVersion: number
}

export class MigrationError extends Error {
  constructor(message: string, readonly backupHint?: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** SQLite 的 VACUUM INTO 不接受参数绑定，这里按字面量安全转义路径 */
function sqlStringLiteral(p: string): string {
  return `'${p.replace(/\\/g, '/').replace(/'/g, "''")}'`
}

function backupLegacyDb(source: Database.Database, destPath: string): void {
  source.exec(`VACUUM INTO ${sqlStringLiteral(destPath)}`)
}

/**
 * 按版本顺序执行迁移。
 *
 * 失败即抛：调用方必须中止启动，不能带着半迁移的数据继续运行 ——
 * 静默降级会把「数据库读不到」显示成「你没有项目」，诱导用户重建并覆盖数据。
 */
export function runMigrations(
  migrations: Migration[],
  ctx: Omit<MigrationContext, 'app' | 'legacy'>
): { report: MigrationReport; close: () => void } {
  const userData = app.getPath('userData')
  ensureDir(userData)

  const appDb = new Database(join(userData, 'app.db'))
  appDb.pragma('journal_mode = WAL')
  appDb.exec(`
    CREATE TABLE IF NOT EXISTS migration_history (
      name        TEXT PRIMARY KEY,
      version     INTEGER NOT NULL,
      applied_at  TEXT NOT NULL,
      backup_path TEXT
    );
  `)

  const current = appDb.pragma('user_version', { simple: true }) as number

  // 数据版本高于当前程序所能理解的版本，说明发生了降级：拒绝启动而非误改数据
  const highest = migrations.reduce((m, x) => Math.max(m, x.version), 0)
  if (current > highest) {
    appDb.close()
    throw new MigrationError(
      `数据库版本 (${current}) 高于本程序支持的版本 (${highest})，请升级应用后再打开。`
    )
  }

  const opened = new Map<LegacyDb, Database.Database>()
  const legacy = (name: LegacyDb): Database.Database => {
    let db = opened.get(name)
    if (!db) {
      db = new Database(join(userData, LEGACY_FILES[name]))
      db.pragma('journal_mode = WAL')
      opened.set(name, db)
    }
    return db
  }

  const fullCtx: MigrationContext = { ...ctx, app: appDb, legacy }
  const applied: MigrationReport['applied'] = []
  const ordered = [...migrations].sort((a, b) => a.version - b.version)

  try {
    for (const m of ordered) {
      if (m.version <= current) continue

      let backupDir: string | null = null
      if (m.destructive) {
        // 时间戳进目录名，避免同名迁移的备份互相覆盖
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        backupDir = join(userData, 'backups', `v${m.version}-${m.name}-${stamp}`, '')
        ensureDir(backupDir)
        for (const db of m.databases) {
          const file = join(userData, LEGACY_FILES[db])
          if (!existsSync(file)) continue
          backupLegacyDb(legacy(db), join(backupDir, LEGACY_FILES[db]))
        }
        ctx.log(`迁移 ${m.name} 执行前已备份: ${backupDir}`)
      }

      // 每个迁移在应用自己的事务中运行；跨文件的一致性由前置备份兜底
      const affected = appDb.transaction(() => m.up(fullCtx))()

      appDb.prepare(
        'INSERT INTO migration_history (name, version, applied_at, backup_path) VALUES (?, ?, ?, ?)'
      ).run(m.name, m.version, new Date().toISOString(), backupDir)
      appDb.pragma(`user_version = ${m.version}`)
      applied.push({ name: m.name, affected, backupDir })
      ctx.log(`已应用迁移 ${m.version} · ${m.name}（影响 ${affected} 条）`)
    }
  } catch (err) {
    for (const db of opened.values()) { try { db.close() } catch { /* 关闭失败不覆盖原始错误 */ } }
    appDb.close()
    const hint = applied.at(-1)?.backupDir
    throw new MigrationError(
      `数据库迁移失败：${err instanceof Error ? err.message : String(err)}`,
      hint ? `数据已备份于 ${hint}` : undefined
    )
  }

  return {
    report: { applied, fromVersion: current, toVersion: ordered.at(-1)?.version ?? current },
    close: () => {
      for (const db of opened.values()) db.close()
      appDb.close()
    }
  }
}
