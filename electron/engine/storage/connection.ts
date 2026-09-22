import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

/**
 * 各存储库共用的连接打开方式。
 *
 * 六个库以前各自 new Database(...) 并只设了 journal_mode：
 * 没有 busy_timeout，两个窗口撞上同一张表就抛 SQLITE_BUSY；
 * 没有 foreign_keys，SQLite 默认还是关着的；
 * 同一份 pragma 抄六遍，改一处漏五处。
 *
 * 注：跨库外键是做不到的（SQLite 的 FK 不跨文件），所以执行历史与项目的
 * 参照关系仍靠删除顺序与启动清理维持，见 purgeExecutionsOf。
 */

export type StoreFile =
  | 'projects' | 'models' | 'prompts' | 'settings' | 'executions' | 'credentials'

/** 打开失败时给出可操作的中文名，而不是让调用方去猜 errno */
export const storeLabels: Record<StoreFile, string> = {
  projects: '项目库',
  models: '模型库',
  prompts: '提示词库',
  settings: '设置库',
  executions: '执行历史库',
  credentials: '凭证库'
}

export function openStore(file: StoreFile, overridePath?: string): Database.Database {
  const path = overridePath || join(app.getPath('userData'), `${file}.db`)
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  // 写冲突时等 3s 再报错；默认 0 会让并发写直接抛 SQLITE_BUSY
  db.pragma('busy_timeout = 3000')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  return db
}

/** 一个文件路径，供启动期的错误提示使用 */
export function storePath(file: StoreFile): string {
  return join(app.getPath('userData'), `${file}.db`)
}
