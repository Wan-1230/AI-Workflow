import type { WorkflowDefinition } from '@shared/workflow'

const MAX_NODES = 100
const MAX_EDGES = 200
const MAX_CONFIG_DEPTH = 5
const VALID_NODE_TYPES = new Set([
  'manual-trigger', 'http-request', 'code-exec', 'condition', 'notification'
])

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * 校验工作流定义的合法性
 * 防止恶意数据导致引擎崩溃
 */
export function validateWorkflow(wf: unknown): ValidationResult {
  const errors: string[] = []

  if (!wf || typeof wf !== 'object') {
    return { valid: false, errors: ['工作流定义必须是对象'] }
  }

  const workflow = wf as Record<string, unknown>

  // 基本字段检查
  if (!workflow.name || typeof workflow.name !== 'string') {
    errors.push('工作流缺少有效的 name 字段')
  }

  if (typeof workflow.name === 'string' && workflow.name.length > 200) {
    errors.push('工作流名称不能超过 200 字符')
  }

  // 节点检查
  if (!Array.isArray(workflow.nodes)) {
    errors.push('工作流缺少 nodes 数组')
    return { valid: false, errors }
  }

  if (workflow.nodes.length === 0) {
    errors.push('工作流至少需要一个节点')
  }

  if (workflow.nodes.length > MAX_NODES) {
    errors.push(`节点数量超过上限 (${MAX_NODES})`)
  }

  const nodeIds = new Set<string>()

  for (let i = 0; i < workflow.nodes.length; i++) {
    const node = workflow.nodes[i] as Record<string, unknown>

    if (!node.id || typeof node.id !== 'string') {
      errors.push(`节点 [${i}] 缺少有效的 id`)
      continue
    }

    if (nodeIds.has(node.id)) {
      errors.push(`节点 ID 重复: ${node.id}`)
    }
    nodeIds.add(node.id)

    if (!node.type || typeof node.type !== 'string') {
      errors.push(`节点 ${node.id} 缺少 type`)
    } else if (!VALID_NODE_TYPES.has(node.type)) {
      errors.push(`节点 ${node.id} 的类型无效: ${node.type}`)
    }

    // config 深度检查
    if (node.config && typeof node.config === 'object') {
      const depth = getObjectDepth(node.config as Record<string, unknown>)
      if (depth > MAX_CONFIG_DEPTH) {
        errors.push(`节点 ${node.id} 的配置嵌套过深 (>${MAX_CONFIG_DEPTH})`)
      }
    }
  }

  // 边检查
  if (!Array.isArray(workflow.edges)) {
    errors.push('工作流缺少 edges 数组')
    return { valid: false, errors }
  }

  if (workflow.edges.length > MAX_EDGES) {
    errors.push(`连线数量超过上限 (${MAX_EDGES})`)
  }

  for (let i = 0; i < workflow.edges.length; i++) {
    const edge = workflow.edges[i] as Record<string, unknown>

    if (!edge.source || !nodeIds.has(edge.source as string)) {
      errors.push(`连线 [${i}] 的 source 引用了不存在的节点`)
    }
    if (!edge.target || !nodeIds.has(edge.target as string)) {
      errors.push(`连线 [${i}] 的 target 引用了不存在的节点`)
    }
  }

  return { valid: errors.length === 0, errors }
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
