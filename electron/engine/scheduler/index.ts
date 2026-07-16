import type { WorkflowNode } from '@shared/workflow'

interface Edge {
  source: string
  target: string
}

/**
 * DAG 调度器 — 使用 Kahn 算法进行拓扑排序
 * 返回节点执行顺序（按拓扑序排列的节点 ID 列表）
 */
export class Scheduler {
  topologicalSort(nodes: WorkflowNode[], edges: Edge[]): string[] {
    if (nodes.length === 0) return []

    // 构建邻接表和入度表
    const adjacency = new Map<string, string[]>()
    const inDegree = new Map<string, number>()

    // 初始化
    for (const node of nodes) {
      adjacency.set(node.id, [])
      inDegree.set(node.id, 0)
    }

    // 填充边信息
    for (const edge of edges) {
      const targets = adjacency.get(edge.source) || []
      targets.push(edge.target)
      adjacency.set(edge.source, targets)

      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    // Kahn 算法
    const queue: string[] = []
    const result: string[] = []

    // 入度为 0 的节点入队（触发器或起始节点）
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId)
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!
      result.push(current)

      // 减少所有邻接节点的入度
      const neighbors = adjacency.get(current) || []
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1
        inDegree.set(neighbor, newDegree)

        if (newDegree === 0) {
          queue.push(neighbor)
        }
      }
    }

    // 检查循环依赖
    if (result.length !== nodes.length) {
      const remaining = nodes.filter(n => !result.includes(n.id)).map(n => n.id)
      throw new Error(
        `检测到循环依赖！未排序的节点: ${remaining.join(', ')}`
      )
    }

    return result
  }

  /**
   * 识别可以并行执行的节点组
   * 同一组内的节点没有相互依赖，可以并发
   */
  getParallelGroups(nodes: WorkflowNode[], edges: Edge[]): string[][] {
    const order = this.topologicalSort(nodes, edges)
    const groups: string[][] = []
    const completed = new Set<string>()

    for (const nodeId of order) {
      // 检查该节点的所有前置节点是否都在当前组之前已完成
      const deps = edges.filter(e => e.target === nodeId).map(e => e.source)

      // 简单策略：每个节点单独一组
      // 更复杂的并行检测可在后续版本实现
      groups.push([nodeId])
      completed.add(nodeId)
    }

    return groups
  }
}
