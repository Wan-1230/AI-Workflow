import type { WorkflowDefinition, WorkflowNode } from '@shared/workflow'

export interface ParsedWorkflow {
  nodes: WorkflowNode[]
  edges: { source: string; target: string }[]
}

/**
 * 解析和验证工作流定义
 * - 检查节点 ID 唯一性
 * - 检查 edges 引用的节点是否存在
 * - 将 dependsOn 转换为 edges（如果 edges 为空）
 */
export function parseWorkflow(wf: WorkflowDefinition): ParsedWorkflow {
  const nodeIds = new Set(wf.nodes.map(n => n.id))

  // 检查节点 ID 唯一性
  if (nodeIds.size !== wf.nodes.length) {
    throw new Error('工作流定义包含重复的节点 ID')
  }

  // 检查 edges 引用的节点是否存在
  for (const edge of wf.edges) {
    if (!nodeIds.has(edge.source)) {
      throw new Error(`连线引用了不存在的源节点: ${edge.source}`)
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(`连线引用了不存在的目标节点: ${edge.target}`)
    }
  }

  // 如果 edges 为空但节点有 dependsOn，则自动生成 edges
  let edges = wf.edges
  if (edges.length === 0) {
    edges = []
    for (const node of wf.nodes) {
      if (node.dependsOn) {
        for (const depId of node.dependsOn) {
          if (!nodeIds.has(depId)) {
            throw new Error(`节点 ${node.id} 依赖不存在的节点: ${depId}`)
          }
          edges.push({
            id: `${depId}->${node.id}`,
            source: depId,
            target: node.id
          })
        }
      }
    }
  }

  return {
    nodes: wf.nodes,
    edges: edges.map(e => ({ source: e.source, target: e.target }))
  }
}
