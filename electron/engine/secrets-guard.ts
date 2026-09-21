/**
 * 密钥边界防护。
 *
 * 目标只有一条：节点配置里不得出现密钥明文。因为配置会随 workflow_json 落库、
 * 被「导出 JSON」写到磁盘、并通过 IPC 回传渲染进程 —— 一旦存了明文就等于三处同时泄露。
 *
 * 本模块全部为纯函数，便于脱离数据库与 Electron 运行时进行验证。
 */

/** 键名暗示这是敏感字段 */
const SECRET_KEY_RE = /(api[_-]?key|apikey|access[_-]?token|secret|password|passwd|private[_-]?key|auth(?:orization)?|bearer)/i

/** 常见服务商密钥前缀与 Bearer 凭据：命中即可判定为明文密钥，与键名无关 */
const PROVIDER_PREFIX_RE = /^\s*(sk-[A-Za-z0-9_-]{12,}|pk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._~+-]{16,}=*)/i

/** 模板引用形式：{{credentials.KEY}} / {{env.VAR}} —— 这是正确用法，不是泄露 */
const TEMPLATE_REF_RE = /\{\{[^{}]*\}\}/

/** 高熵字面量：长度足够、无空白、字符集混杂 */
function isHighEntropyLiteral(v: string): boolean {
  if (v.length < 24 || /\s/.test(v)) return false
  if (!/^[A-Za-z0-9_\-./+=]+$/.test(v)) return false
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[_\-./+=]/].filter(r => r.test(v)).length
  return classes >= 3
}

/** 该字符串是否应视为密钥明文 */
export function looksLikeSecret(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v) return false
  if (TEMPLATE_REF_RE.test(v)) return false
  if (PROVIDER_PREFIX_RE.test(v)) return true
  return isHighEntropyLiteral(v)
}

/** 仅凭值本身即可确认的强特征（用于键名不透明的场景） */
export function hasProviderSecretPrefix(value: unknown): boolean {
  return typeof value === 'string' && PROVIDER_PREFIX_RE.test(value.trim())
}

function isSecretBearingKey(key: string): boolean {
  return SECRET_KEY_RE.test(key)
}

/**
 * 递归找出对象中疑似含明文密钥的路径，返回如
 * `nodes[2].config.apiKeyRef` / `config.headers.Authorization` 的定位串。
 */
export function findSecretPaths(obj: unknown, basePath = '', maxDepth = 6, out: string[] = []): string[] {
  if (maxDepth < 0 || !obj || typeof obj !== 'object') return out

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => findSecretPaths(item, `${basePath}[${i}]`, maxDepth - 1, out))
    return out
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = basePath ? `${basePath}.${key}` : key

    if (typeof value === 'string') {
      const flagged = hasProviderSecretPrefix(value) || (isSecretBearingKey(key) && looksLikeSecret(value))
      if (flagged) out.push(path)
    } else if (value && typeof value === 'object') {
      findSecretPaths(value, path, maxDepth - 1, out)
    }
  }

  return out
}

/** 返回脱敏副本（命中路径的值替换为 [REDACTED]），用于对外读出与落盘导出 */
export function redactSecrets<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(item => redactSecrets(item)) as unknown as T
  if (!obj || typeof obj !== 'object') return obj

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const isSecretValue = typeof value === 'string' && hasProviderSecretPrefix(value)
    const secretNamedString = typeof value === 'string' && isSecretBearingKey(key) && looksLikeSecret(value)

    if (isSecretValue || secretNamedString) {
      result[key] = '[REDACTED]'
    } else {
      result[key] = redactSecrets(value)
    }
  }
  return result as T
}

/** 工作流中一处密钥明文的位置与取值 */
export interface SecretFinding {
  nodeId: string
  field: string
  value: string
  /**
   * 明文位于 JSON 字符串内部时的键名。
   * 典型场景是 HTTP 节点的 headers：'{"Authorization":"Bearer sk-..."}'
   */
  innerKey?: string
}

/** 尝试把值当作 JSON 对象解析，供嵌套探测 */
function asJsonRecord(value: string): Record<string, unknown> | null {
  const v = value.trim()
  if (!v.startsWith('{') || !v.endsWith('}')) return null
  try {
    const parsed: unknown = JSON.parse(v)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

/** 单个配置值是否构成明文密钥（模板引用视为正确用法，放过） */
function classifyValue(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (TEMPLATE_REF_RE.test(value)) return false
  return hasProviderSecretPrefix(value) || (isSecretBearingKey(key) && looksLikeSecret(value))
}

/**
 * 扫描工作流的节点配置，找出明文密钥。
 *
 * `{{credentials.KEY}}` 这类引用是正确用法，不会被计入。
 */
export function scanWorkflowSecrets(wf: unknown): SecretFinding[] {
  const findings: SecretFinding[] = []
  if (!wf || typeof wf !== 'object') return findings

  const nodes = (wf as { nodes?: unknown }).nodes
  if (!Array.isArray(nodes)) return findings

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const { id, config } = node as { id?: unknown; config?: unknown }
    if (typeof id !== 'string' || !config || typeof config !== 'object') continue

    for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
      if (classifyValue(key, value)) {
        findings.push({ nodeId: id, field: key, value: value as string })
        continue
      }

      // 值为 JSON 字符串时，明文可能藏在它内部
      if (typeof value === 'string' && !TEMPLATE_REF_RE.test(value)) {
        const nested = asJsonRecord(value)
        if (nested) {
          for (const [nk, nv] of Object.entries(nested)) {
            if (classifyValue(nk, nv)) {
              findings.push({ nodeId: id, field: key, innerKey: nk, value: nv as string })
            }
          }
        }
      }
    }
  }

  return findings
}

/**
 * 就地改写工作流 JSON 字符串中命中的字段值。
 * replacements 的键形如 `${nodeId}.${field}` 或 `${nodeId}.${field}.${innerKey}`。
 * 返回新字符串与实际替换数量，供迁移判断是否有变更。
 */
export function replaceWorkflowSecretRefs(
  wfJson: string,
  replacements: Map<string, string>
): { json: string; replaced: number } {
  let parsed: unknown
  try {
    parsed = JSON.parse(wfJson)
  } catch {
    return { json: wfJson, replaced: 0 }
  }

  const nodes = (parsed as { nodes?: unknown })?.nodes
  if (!Array.isArray(nodes)) return { json: wfJson, replaced: 0 }

  let replaced = 0
  for (const node of nodes) {
    const cfg = (node as { config?: Record<string, unknown> })?.config
    const nodeId = (node as { id?: string }).id
    if (!cfg || typeof cfg !== 'object' || typeof nodeId !== 'string') continue

    for (const [key, value] of Object.entries(cfg)) {
      // 顶层字符串字段
      const direct = replacements.get(`${nodeId}.${key}`)
      if (direct !== undefined && value !== direct) {
        cfg[key] = direct
        replaced++
        continue
      }

      // JSON 字符串内部的字段
      if (typeof value === 'string') {
        const nested = asJsonRecord(value)
        if (!nested) continue
        let changed = false
        for (const nk of Object.keys(nested)) {
          const next = replacements.get(`${nodeId}.${key}.${nk}`)
          if (next !== undefined && nested[nk] !== next) {
            nested[nk] = next
            changed = true
            replaced++
          }
        }
        if (changed) cfg[key] = JSON.stringify(nested)
      }
    }
  }

  return { json: JSON.stringify(parsed), replaced }
}
