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
   * 同一组内的节点没有相互依赖，可以并发执行
   * 使用 BFS 分层：入度为0的节点为第一层，每层完成后减少下游入度
   */
  getParallelGroups(nodes: WorkflowNode[], edges: Edge[]): string[][] {
    if (nodes.length === 0) return []

    // 构建入度表和邻接表
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    for (const node of nodes) {
      inDegree.set(node.id, 0)
      adjacency.set(node.id, [])
    }

    for (const edge of edges) {
      // 只处理存在于节点列表中的边
      if (!inDegree.has(edge.source) || !inDegree.has(edge.target)) continue
      adjacency.get(edge.source)!.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    // BFS 分层
    const groups: string[][] = []
    let currentLayer: string[] = []

    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        currentLayer.push(nodeId)
      }
    }

    const processed = new Set<string>()

    while (currentLayer.length > 0) {
      groups.push([...currentLayer])

      const nextLayer: string[] = []
      for (const nodeId of currentLayer) {
        processed.add(nodeId)
        const neighbors = adjacency.get(nodeId) || []
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) || 1) - 1
          inDegree.set(neighbor, newDegree)
          if (newDegree === 0 && !processed.has(neighbor)) {
            nextLayer.push(neighbor)
          }
        }
      }
      currentLayer = nextLayer
    }

    // 检查循环依赖
    if (processed.size !== nodes.length) {
      const remaining = nodes.filter(n => !processed.has(n.id)).map(n => n.id)
      throw new Error(`检测到循环依赖！未排序的节点: ${remaining.join(', ')}`)
    }

    return groups
  }
}
