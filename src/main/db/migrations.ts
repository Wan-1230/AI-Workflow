import type { Migration } from './index'
import { scanWorkflowSecrets, replaceWorkflowSecretRefs } from '../../../electron/engine/secrets-guard'

/** 这些字段承载的是「凭证名」而非可插值的字符串，替换时写裸名 */
const NAME_ONLY_FIELDS = new Set(['credentialName', 'apiKeyRef', 'apiKey'])

function credentialNameFor(projectId: string, nodeId: string, field: string, innerKey?: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_')
  return 'purged_' + [projectId, nodeId, field, innerKey]
    .filter((s): s is string => Boolean(s))
    .map(safe)
    .join('__')
}

/** 逐行处理所需的最小依赖面，便于脱离数据库验证 */
export interface PurgeDeps {
  /** 写入加密凭证；返回 false 表示密钥环不可用 */
  setCredential(name: string, value: string, displayName: string): boolean
  credentialExists(name: string): boolean
}

export interface PurgeResult {
  json: string
  replaced: number
  /** 被升格为凭证的条目（不含任何密钥内容，仅位置与凭证名） */
  promoted: { credential: string; nodeId: string; field: string }[]
}

/**
 * 清洗单条项目记录中的明文密钥。
 *
 * 抽为纯函数（除 setCredential/exists 外无副作用）以便在没有 SQLite 的环境下验证，
 * 因为 better-sqlite3 按 Electron ABI 构建，无法在 Node 测试中加载。
 */
export function purgeProjectWorkflow(
  projectId: string,
  projectName: string,
  workflowJson: string,
  deps: PurgeDeps
): PurgeResult {
  const findings = scanWorkflowSecrets(safeParse(workflowJson))
  if (!findings.length) {
    return { json: workflowJson, replaced: 0, promoted: [] }
  }

  const replacements = new Map<string, string>()
  const promoted: PurgeResult['promoted'] = []

  for (const f of findings) {
    const cred = credentialNameFor(projectId, f.nodeId, f.field, f.innerKey)

    if (!deps.credentialExists(cred)) {
      // 密钥环不可用时宁可中止，也不把明文挪个地方继续存
      if (!deps.setCredential(cred, f.value, `从项目「${projectName}」自动迁移的密钥`)) {
        throw new Error('系统密钥环不可用，无法安全保存从项目中迁移出的密钥；请恢复密钥环后重试')
      }
    }

    const refKey = f.innerKey ? `${f.nodeId}.${f.field}.${f.innerKey}` : `${f.nodeId}.${f.field}`
    replacements.set(refKey, NAME_ONLY_FIELDS.has(f.field) ? cred : `{{credentials.${cred}}}`)
    promoted.push({ credential: cred, nodeId: f.nodeId, field: f.field })
  }

  const { json, replaced } = replaceWorkflowSecretRefs(workflowJson, replacements)
  return { json, replaced, promoted: replaced ? promoted : [] }
}

/**
 * 迁移 #1：清除历史项目中以明文形态存储的 API Key。
 *
 * 旧版 llm-call 把 config.apiKeyRef 直接当作密钥使用，于是明文随 workflow_json 进了
 * projects.db，并会经 projects:get 回传渲染进程、被导出 JSON 写到磁盘。
 * 这里把明文升格为系统密钥环中的凭证，配置里改写为引用 —— 保项目仍可运行，
 * 而不是抹掉密钥让用户重新配置一遍。
 */
const purgePlaintextApiKeys: Migration = {
  name: 'purge-plaintext-api-keys',
  version: 1,
  databases: ['projects', 'credentials'],
  destructive: true,
  up(ctx) {
    let tableExists = false
    try {
      tableExists = !!ctx.legacy('projects')
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
        .get()
    } catch { tableExists = false }
    if (!tableExists) return 0

    const rows = ctx.legacy('projects')
      .prepare('SELECT id, name, workflow_json FROM projects')
      .all() as Array<{ id: string; name: string; workflow_json: string }>

    let touchedProjects = 0

    for (const row of rows) {
      const { json, replaced } = purgeProjectWorkflow(row.id, row.name, row.workflow_json, ctx)
      if (replaced === 0) continue

      ctx.legacy('projects')
        .prepare('UPDATE projects SET workflow_json = ? WHERE id = ?')
        .run(json, row.id)
      touchedProjects++
    }

    return touchedProjects
  }
}

/**
 * 迁移 #2：抬升历史遗留的 30 秒默认超时。
 *
 * defaultTimeout 曾长期只写库不被读取（设置页可改但毫无效果），
 * 因此库里的 30000 只可能是旧默认值而非用户主动选择，可以放心改写。
 */
const raiseLegacyDefaultTimeout: Migration = {
  name: 'raise-legacy-default-timeout',
  version: 2,
  databases: ['settings'],
  destructive: false,
  up(ctx) {
    let row: { value: string } | undefined
    try {
      row = ctx.legacy('settings').prepare('SELECT value FROM settings WHERE key = ?').get('defaultTimeout') as
        | { value: string }
        | undefined
    } catch {
      return 0
    }
    if (!row) return 0

    let parsed: unknown
    try {
      parsed = JSON.parse(row.value)
    } catch {
      return 0
    }
    if (parsed !== 30000) return 0

    ctx.legacy('settings')
      .prepare('UPDATE settings SET value = ? WHERE key = ?')
      .run(JSON.stringify(120000), 'defaultTimeout')
    return 1
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const migrations: Migration[] = [purgePlaintextApiKeys, raiseLegacyDefaultTimeout]
