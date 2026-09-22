import { nodeCatalog, catalogNodeTypes } from './node-catalog'
import { analyzeLoopScopes } from './loop-scopes'
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from './workflow'

const MAX_NODES = 100
const MAX_EDGES = 200
const MAX_CONFIG_DEPTH = 5

/**
 * 合法节点类型直接由节点目录派生。
 *
 * 这里曾经是一份手写的 5 类白名单，而目录已有 16 类，二者长期不同步，
 * 导致 11 类节点（含全部 AI 节点）在执行入口就被判为「类型无效」。
 */
const VALID_NODE_TYPES = new Set(catalogNodeTypes)

/** 插值中不属于节点引用的保留字与内置函数 */
const RESERVED_REFS = new Set([
  'input', 'item', 'index', 'count', 'global', 'env', 'credentials', 'secrets',
  'json', 'now', 'timestamp', 'length'
])

const INTERPOLATION_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

export interface ValidationIssue {
  nodeId?: string
  field?: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

/** 校验失败时给用户的可读文本 */
export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues
    .map(i => (i.nodeId ? `[${i.nodeId}]${i.field ? ` ${i.field}:` : ':'} ${i.message}` : i.message))
    .join('; ')
}

/**
 * 校验工作流定义的合法性：结构完整性、类型合法性、连线与出口句柄、
 * 以及跨节点引用是否成立。防止恶意或损坏数据导致引擎崩溃，
 * 并在执行前拦下「引用写错 → 运行期静默变成字面量文本」这一类问题。
 */
export function validateWorkflow(wf: unknown): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  if (!wf || typeof wf !== 'object') {
    return { valid: false, errors: [{ message: '工作流定义必须是对象' }], warnings }
  }

  const workflow = wf as Partial<WorkflowDefinition>

  if (!workflow.name || typeof workflow.name !== 'string') {
    errors.push({ message: '工作流缺少有效的 name 字段' })
  } else if (workflow.name.length > 200) {
    errors.push({ message: '工作流名称不能超过 200 字符' })
  }

  if (!Array.isArray(workflow.nodes)) {
    errors.push({ message: '工作流缺少 nodes 数组' })
    return { valid: false, errors, warnings }
  }

  if (workflow.nodes.length === 0) {
    errors.push({ message: '工作流至少需要一个节点' })
  }

  if (workflow.nodes.length > MAX_NODES) {
    errors.push({ message: `节点数量超过上限 (${MAX_NODES})` })
  }

  const nodes = workflow.nodes as WorkflowNode[]
  const nodeIds = new Set<string>()

  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      errors.push({ message: '存在无效的节点对象' })
      continue
    }

    const nodeId = node.id
    if (!nodeId || typeof nodeId !== 'string') {
      errors.push({ message: '节点缺少有效的 id' })
      continue
    }

    if (nodeIds.has(nodeId)) {
      errors.push({ nodeId, message: '节点 ID 重复' })
    }
    nodeIds.add(nodeId)

    if (!node.type || !VALID_NODE_TYPES.has(node.type)) {
      errors.push({ nodeId, field: 'type', message: `节点类型无效: ${String(node.type)}` })
      continue
    }

    const def = nodeCatalog[node.type]

    if (node.config && typeof node.config === 'object') {
      if (getObjectDepth(node.config as Record<string, unknown>) > MAX_CONFIG_DEPTH) {
        errors.push({ nodeId, field: 'config', message: `配置嵌套过深 (>${MAX_CONFIG_DEPTH})` })
      }

      // 未知配置键：旧项目文件可能携带已废弃字段，只告警不阻断
      const declaredKeys = new Set(def.fields.map(f => f.key))
      for (const key of Object.keys(node.config)) {
        if (!declaredKeys.has(key) && key !== 'label') {
          warnings.push({ nodeId, field: key, message: `未在节点目录中声明的配置键: ${key}` })
        }
      }
    }
  }

  if (!Array.isArray(workflow.edges)) {
    errors.push({ message: '工作流缺少 edges 数组' })
    return { valid: false, errors, warnings }
  }

  const edges = workflow.edges as WorkflowEdge[]

  if (edges.length > MAX_EDGES) {
    errors.push({ message: `连线数量超过上限 (${MAX_EDGES})` })
  }

  for (const edge of edges) {
    if (!edge.source || !nodeIds.has(edge.source)) {
      errors.push({ message: `连线的 source 引用了不存在的节点: ${String(edge.source)}` })
      continue
    }
    if (!edge.target || !nodeIds.has(edge.target)) {
      errors.push({ message: `连线的 target 引用了不存在的节点: ${String(edge.target)}` })
      continue
    }

    // 出口句柄必须是被引用节点实际声明的多出口之一。
    // 引擎按 `edge.sourceHandle || 'true'` 路由分支，未声明的句柄会静默落到默认分支。
    if (edge.sourceHandle) {
      const handles = nodeCatalog[nodes.find(n => n.id === edge.source)!.type]?.sourceHandles
      if (!handles?.includes(edge.sourceHandle)) {
        errors.push({
          nodeId: edge.source,
          message: `出口句柄 "${edge.sourceHandle}" 不存在，该节点仅有 ${handles ? handles.join('/') : '单一匿名'} 出口`
        })
      }
    }
  }

  // 多出口节点的两条分支若无连线，其中一条永远不会被执行 —— 提示而非报错
  for (const node of nodes) {
    const handles = nodeCatalog[node.type]?.sourceHandles
    if (!handles?.length || handles.length < 2) continue
    const connected = new Set(edges.filter(e => e.source === node.id).map(e => e.sourceHandle ?? handles[0]))
    const missing = handles.filter(h => !connected.has(h))
    if (missing.length) {
      warnings.push({ nodeId: node.id, message: `分支出口未连线: ${missing.join('、')}（该分支上的下游不会执行）` })
    }
  }

  validateInterpolations(nodes, edges, nodeIds, errors, warnings)
  validateLoopScopes(nodes, edges, errors)
  validateSubWorkflowInputs(nodes, edges, warnings)

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * 子工作流的 {{global.sub_input}} 只有在父级填了「输入数据」或接了上游时才有值；
 * 两者皆空时子流程会在运行期抛"全局变量未定义"，在这里提前给出定位。
 */
function validateSubWorkflowInputs(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  warnings: ValidationIssue[]
): void {
  for (const node of nodes) {
    if (node.type !== 'sub-workflow') continue
    if (!/\{\{\s*global\.sub_input/.test(String(node.config.workflowJson ?? ''))) continue
    if (typeof node.config.input === 'string' && node.config.input.trim()) continue
    if (edges.some(e => e.target === node.id)) continue

    warnings.push({
      nodeId: node.id,
      field: 'input',
      message: '子工作流引用了 {{global.sub_input}}，但本节点既未填「输入数据」也没有上游连线，运行时会因该变量不存在而失败'
    })
  }
}

/**
 * 循环体结构：body 子图必须恰好有一个 loop-end 终点、无回边、不被体外连线污染。
 * 推断逻辑与引擎共用同一份实现（@shared/loop-scopes），避免"校验通过但引擎拒绝"。
 */
function validateLoopScopes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  errors: ValidationIssue[]
): void {
  if (!nodes.some(n => n.type === 'loop')) return

  const analysis = analyzeLoopScopes(nodes, edges)
  for (const problem of analysis.problems) {
    errors.push({ nodeId: problem.loopId, message: problem.message })
  }
}

/**
 * 校验配置里的 {{nodeId.field}} 引用：
 * 被引用节点必须存在、不能是自身、且必须是当前节点的上游（沿边可达）。
 * 未解析的插值在执行器里会被原样保留为文本，条件节点会拿 "{{x}}" 字面量去比较并误报成功，
 * 因此这类错误必须在执行前拦下。
 */
function validateInterpolations(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  nodeIds: Set<string>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  // 反向邻接：target -> sources，用于求上游闭包
  const incoming = new Map<string, string[]>()
  for (const e of edges) {
    const list = incoming.get(e.target)
    if (list) list.push(e.source)
    else incoming.set(e.target, [e.source])
  }

  const scopeByLoopId = new Map(analyzeLoopScopes(nodes, edges).scopes.map(s => [s.loopId, s]))

  const ancestorsOf = (id: string): Set<string> => {
    const seen = new Set<string>()
    const queue = [...(incoming.get(id) ?? [])]
    while (queue.length) {
      const cur = queue.shift()!
      if (seen.has(cur)) continue
      seen.add(cur)
      queue.push(...(incoming.get(cur) ?? []))
    }

    // 循环体节点对其 done 下游可见：引擎把最后一轮的体内结果并入父层，
    // 因此「体内节点 → …→ loop → done 分支」这条引用是合法的
    for (const scope of scopeByLoopId.values()) {
      if (seen.has(scope.loopId)) {
        for (const member of scope.scopeNodeIds) seen.add(member)
      }
    }
    return seen
  }

  for (const node of nodes) {
    if (!node.id || !VALID_NODE_TYPES.has(node.type) || !node.config) continue
    const def = nodeCatalog[node.type]

    for (const field of def.fields) {
      if (field.nodeRefInterpolation === false) continue
      const raw = (node.config as Record<string, unknown>)[field.key]
      if (typeof raw !== 'string' || !raw.includes('{{')) continue

      const ancestors = ancestorsOf(node.id)
      for (const [, expr] of raw.matchAll(INTERPOLATION_RE)) {
        // 内置函数形式 {{now()}} / {{json(x)}} 不做节点引用校验
        if (/^[A-Za-z_][\w]*\s*\(/.test(expr)) continue
        const ref = expr.split('.')[0].trim()
        if (!ref || RESERVED_REFS.has(ref)) continue

        if (!nodeIds.has(ref)) {
          errors.push({
            nodeId: node.id,
            field: field.key,
            message: `引用了不存在的节点 "${ref}"，未解析的 {{...}} 会被当作字面量文本传给下游`
          })
        } else if (ref === node.id) {
          errors.push({ nodeId: node.id, field: field.key, message: `引用了自身输出 "${ref}"，构成自依赖` })
        } else if (!ancestors.has(ref)) {
          errors.push({
            nodeId: node.id,
            field: field.key,
            message: `引用的节点 "${ref}" 不是当前节点的上游，执行时其输出尚不可用`
          })
        } else {
          const refDef = nodeCatalog[nodes.find(n => n.id === ref)!.type]
          const path = expr.split('.')[1]?.trim()
          if (path && !refDef.outputs.some(o => o.name === path)) {
            warnings.push({
              nodeId: node.id,
              field: field.key,
              message: `节点 "${ref}" 未声明输出 "${path}"，可用输出: ${refDef.outputs.map(o => o.name).join('/')}`
            })
          }
        }
      }
    }
  }
}

function getObjectDepth(obj: Record<string, unknown>, current = 0): number {
  if (current > MAX_CONFIG_DEPTH) return current

  let maxDepth = current
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const d = getObjectDepth(value as Record<string, unknown>, current + 1)
      maxDepth = Math.max(maxDepth, d)
    }
  }
  return maxDepth
}
