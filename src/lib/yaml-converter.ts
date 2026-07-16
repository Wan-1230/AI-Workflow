import yaml from 'yaml'
import { v4 as uuid } from 'uuid'
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from '@shared/workflow'

/**
 * 将工作流定义序列化为 YAML 字符串
 * 格式参考 DESIGN.md §5.2
 */
export function workflowToYaml(wf: WorkflowDefinition): string {
  const yamlObj: Record<string, unknown> = {
    name: wf.name
  }

  // 触发器
  if (wf.trigger) {
    yamlObj.trigger = {
      type: wf.trigger.type,
      ...wf.trigger.config
    }
  }

  // 节点
  yamlObj.nodes = wf.nodes.map(node => {
    const n: Record<string, unknown> = {
      id: node.id,
      type: node.type,
      config: node.config
    }

    // 从 edges 推断 dependsOn
    const deps = wf.edges
      .filter(e => e.target === node.id)
      .map(e => e.source)

    if (deps.length > 0) {
      n.depends_on = deps
    }

    return n
  })

  return yaml.stringify(yamlObj, {
    indent: 2,
    lineWidth: 120,
    defaultStringType: 'QUOTE_DOUBLE'
  })
}

/**
 * 从 YAML 字符串解析工作流定义
 * 自动推断节点位置（简单网格布局）
 */
export function yamlToWorkflow(yamlStr: string): WorkflowDefinition {
  const parsed = yaml.parse(yamlStr) as any

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('无效的 YAML 格式')
  }

  const nodes: WorkflowNode[] = []
  const edges: WorkflowEdge[] = []
  const nodePositions: Map<string, { x: number; y: number }> = new Map()

  // 解析节点
  if (Array.isArray(parsed.nodes)) {
    parsed.nodes.forEach((n: any, index: number) => {
      const nodeId = n.id || uuid()
      const node: WorkflowNode = {
        id: nodeId,
        type: n.type || 'unknown',
        label: n.label || n.type || nodeId,
        position: { x: 0, y: 0 },
        config: n.config || {},
        dependsOn: Array.isArray(n.depends_on) ? n.depends_on : undefined
      }

      nodes.push(node)

      // 简单网格布局：每行3个节点
      const col = index % 3
      const row = Math.floor(index / 3)
      nodePositions.set(nodeId, {
        x: 50 + col * 280,
        y: 50 + row * 180
      })
    })
  }

  // 从 dependsOn 生成 edges
  for (const node of nodes) {
    if (node.dependsOn) {
      for (const depId of node.dependsOn) {
        edges.push({
          id: `${depId}->${node.id}`,
          source: depId,
          target: node.id
        })
      }
    }
  }

  // 设置节点位置
  for (const node of nodes) {
    const pos = nodePositions.get(node.id)
    if (pos) {
      node.position = pos
    }
  }

  // 解析触发器
  let trigger: WorkflowDefinition['trigger'] = undefined
  if (parsed.trigger) {
    const { type, ...config } = parsed.trigger
    trigger = {
      type: type || 'manual',
      config: config || {}
    }
  }

  return {
    id: uuid(),
    name: parsed.name || '未命名工作流',
    trigger,
    nodes,
    edges,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

/**
 * 从 YAML 生成默认节点位置（dagre 布局的简化版）
 * 根据 dependsOn 关系做层次排列
 */
export function autoLayoutNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  // 简单分层：通过 BFS 确定每层节点
  const inDegree = new Map<string, number>()
  const children = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    children.set(node.id, [])
  }

  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    children.get(edge.source)?.push(edge.target)
  }

  // BFS 分层
  const layers: string[][] = []
  const visited = new Set<string>()
  let currentLayer = nodes.filter(n => (inDegree.get(n.id) || 0) === 0)

  while (currentLayer.length > 0) {
    // 避免无限循环
    const filtered = currentLayer.filter(n => !visited.has(n.id))
    if (filtered.length === 0) break

    visited.add(new Set(filtered.map(n => n.id)))
    layers.push(filtered.map(n => n.id))

    const nextLayer: typeof currentLayer = []
    for (const node of filtered) {
      for (const childId of (children.get(node.id) || [])) {
        const newDegree = (inDegree.get(childId) || 1) - 1
        inDegree.set(childId, newDegree)
        if (newDegree === 0 && !visited.has(childId)) {
          nextLayer.push(nodes.find(n => n.id === childId)!)
        }
      }
    }
    currentLayer = nextLayer
  }

  // 为每层节点计算位置
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layerNodes = layers[layerIdx]
    const layerWidth = layerNodes.length * 280
    const startX = layerNodes.length === 1 ? 0 : -layerWidth / 2 + 140

    for (let i = 0; i < layerNodes.length; i++) {
      positions.set(layerNodes[i], {
        x: 300 + startX + i * 280,
        y: 50 + layerIdx * 180
      })
    }
  }

  return positions
}
