import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type XYPosition,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge
} from '@xyflow/react'
import { v4 as uuid } from 'uuid'
import { nodeDefinitions } from './node-definitions'
import { useAppStore } from './app-store'
import { toast } from './toast-store'
import type { GlobalVariable, WorkflowDefinition } from '@shared/workflow'

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'
export type ExecutionPhase = 'idle' | 'running' | 'completed' | 'error' | 'cancelled'

export interface ExecutionState {
  status: ExecutionPhase
  nodeStatuses: Record<string, ExecutionStatus>
  logs: { nodeId: string; message: string; timestamp: number; output?: Record<string, unknown> }[]
  /** LLM 流式输出：nodeId → 累计文本 */
  streamTexts: Record<string, string>
  /** 当前流式输出的节点 */
  streamingNodeId: string | null
  startedAt: number | null
  duration: number | null
}

/** 画布历史快照（撤销/重做） */
interface HistorySnapshot {
  nodes: Node[]
  edges: Edge[]
}

/** 剪贴板内容（复制/粘贴） */
interface ClipboardContent {
  nodes: Node[]
  edges: Edge[]
  /** 源节点 id → 粘贴后的新 id */
  idMap?: Record<string, string>
}

interface WorkflowStore {
  // 画布数据
  nodes: Node[]
  edges: Edge[]
  workflowId: string
  workflowName: string
  variables: GlobalVariable[]

  // 选中状态
  selectedNodeId: string | null

  // 执行状态
  execution: ExecutionState

  // 撤销/重做
  history: HistorySnapshot[]
  historyIndex: number
  canUndo: boolean
  canRedo: boolean

  // 剪贴板
  clipboard: ClipboardContent | null

  // 画布操作
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNode: (type: string, position: XYPosition) => Node | null
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void
  removeNode: (nodeId: string) => void
  removeNodes: (nodeIds: string[]) => void
  selectNode: (nodeId: string | null) => void

  // 撤销/重做
  undo: () => void
  redo: () => void
  pushHistory: () => void

  // 复制/粘贴
  copySelection: () => void
  pasteClipboard: () => void
  duplicateNode: (nodeId: string) => void

  // 变量
  setVariables: (variables: GlobalVariable[]) => void

  // 工作流操作
  setWorkflowName: (name: string) => void
  clearCanvas: () => void

  // 项目加载/保存
  loadWorkflow: (wf: WorkflowDefinition) => void
  saveToProject: () => Promise<void>

  // 执行操作
  execute: () => Promise<void>
  cancelExecution: () => Promise<void>
  resetExecution: () => void
  addLog: (nodeId: string, message: string, output?: Record<string, unknown>) => void
  setNodeStatus: (nodeId: string, status: ExecutionStatus) => void
  setStreamChunk: (nodeId: string, delta: string, full: string) => void
  clearStream: (nodeId: string) => void

  // 序列化
  toWorkflowJSON: () => WorkflowDefinition
  toWorkflowJSONString: () => string

  // 自动布局（按层级横向排列）
  autoLayout: () => void
}

const MAX_HISTORY = 60

function getDef(type: string) {
  return nodeDefinitions[type]
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],
  workflowId: uuid(),
  workflowName: '未命名工作流',
  variables: [],
  selectedNodeId: null,
  execution: {
    status: 'idle',
    nodeStatuses: {},
    logs: [],
    streamTexts: {},
    streamingNodeId: null,
    startedAt: null,
    duration: null
  },
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,
  clipboard: null,

  // ===== 画布操作 =====

  onNodesChange: changes => {
    const next = applyNodeChanges(changes, get().nodes) as Node[]
    set({ nodes: next })
    // 位置/尺寸变化不计入历史（拖动过程中），删除等结构性变化计入
    if (changes.some(c => c.type === 'remove')) {
      get().pushHistory()
    }
  },

  onEdgesChange: changes => {
    const next = applyEdgeChanges(changes, get().edges) as Edge[]
    set({ edges: next })
    if (changes.some(c => c.type === 'remove')) {
      get().pushHistory()
    }
  },

  onConnect: connection => {
    set({ edges: addEdge(connection, get().edges) as Edge[] })
    get().pushHistory()
  },

  addNode: (type, position) => {
    const def = getDef(type)
    if (!def) return null

    const newNode: Node = {
      id: uuid(),
      type: 'baseNode',
      position,
      data: {
        label: def.displayName,
        nodeType: type,
        category: def.category,
        color: def.color,
        icon: def.icon,
        config: { ...def.defaultConfig }
      }
    }
    set({ nodes: [...get().nodes, newNode], selectedNodeId: newNode.id })
    get().pushHistory()
    return newNode
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map(node =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )
    })
  },

  updateNodeConfig: (nodeId, config) => {
    get().updateNodeData(nodeId, { config })
  },

  removeNode: nodeId => {
    get().removeNodes([nodeId])
  },

  removeNodes: nodeIds => {
    const idSet = new Set(nodeIds)
    set({
      nodes: get().nodes.filter(n => !idSet.has(n.id)),
      edges: get().edges.filter(e => !idSet.has(e.source) && !idSet.has(e.target)),
      selectedNodeId: idSet.has(get().selectedNodeId || '') ? null : get().selectedNodeId
    })
    get().pushHistory()
  },

  selectNode: nodeId => set({ selectedNodeId: nodeId }),

  // ===== 撤销/重做 =====

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get()
    // 忽略空画布快照的重复记录
    const snapshot: HistorySnapshot = {
      nodes: nodes.map(n => structuredClone(n)),
      edges: edges.map(e => structuredClone(e))
    }
    const trimmed = history.slice(0, historyIndex + 1)
    const last = trimmed[trimmed.length - 1]
    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return
    const next = [...trimmed, snapshot].slice(-MAX_HISTORY)
    set({
      history: next,
      historyIndex: next.length - 1,
      canUndo: next.length > 1,
      canRedo: false
    })
  },

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const snapshot = history[historyIndex - 1]
    set({
      nodes: structuredClone(snapshot.nodes),
      edges: structuredClone(snapshot.edges),
      historyIndex: historyIndex - 1,
      canUndo: historyIndex - 1 > 0,
      canRedo: true,
      selectedNodeId: null
    })
  },

  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const snapshot = history[historyIndex + 1]
    set({
      nodes: structuredClone(snapshot.nodes),
      edges: structuredClone(snapshot.edges),
      historyIndex: historyIndex + 1,
      canUndo: true,
      canRedo: historyIndex + 1 < history.length - 1,
      selectedNodeId: null
    })
  },

  // ===== 复制/粘贴 =====

  copySelection: () => {
    const { nodes, edges, selectedNodeId } = get()
    const targetId = selectedNodeId
    const selected = targetId ? nodes.filter(n => n.id === targetId) : nodes.filter(n => n.selected)
    if (selected.length === 0) return

    const selectedIds = new Set(selected.map(n => n.id))
    const copiedEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target))
    set({
      clipboard: {
        nodes: structuredClone(selected),
        edges: structuredClone(copiedEdges)
      }
    })
    toast.info(`已复制 ${selected.length} 个节点`)
  },

  pasteClipboard: () => {
    const { clipboard, nodes, edges } = get()
    if (!clipboard || clipboard.nodes.length === 0) return

    const idMap: Record<string, string> = {}
    const newNodes = clipboard.nodes.map(n => {
      const newId = uuid()
      idMap[n.id] = newId
      return {
        ...structuredClone(n),
        id: newId,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        selected: true
      }
    })
    const newEdges = clipboard.edges.map(e => ({
      ...structuredClone(e),
      id: uuid(),
      source: idMap[e.source] || e.source,
      target: idMap[e.target] || e.target
    }))

    set({
      nodes: [
        ...nodes.map(n => ({ ...n, selected: false })),
        ...newNodes
      ],
      edges: [...edges, ...newEdges]
    })
    get().pushHistory()
    toast.info(`已粘贴 ${newNodes.length} 个节点`)
  },

  duplicateNode: nodeId => {
    const { nodes, edges } = get()
    const source = nodes.find(n => n.id === nodeId)
    if (!source) return

    const newId = uuid()
    const newNode = {
      ...structuredClone(source),
      id: newId,
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      selected: true
    }
    const connectedEdges = edges
      .filter(e => e.source === nodeId || e.target === nodeId)
      .map(e => ({
        ...structuredClone(e),
        id: uuid(),
        source: e.source === nodeId ? newId : e.source,
        target: e.target === nodeId ? newId : e.target
      }))

    set({
      nodes: [...nodes.map(n => ({ ...n, selected: false })), newNode],
      edges: [...edges, ...connectedEdges]
    })
    get().pushHistory()
  },

  // ===== 变量 =====

  setVariables: variables => {
    set({ variables })
    get().pushHistory()
  },

  // ===== 工作流操作 =====

  setWorkflowName: name => set({ workflowName: name }),

  clearCanvas: () => {
    set({
      nodes: [],
      edges: [],
      workflowId: uuid(),
      workflowName: '未命名工作流',
      variables: [],
      selectedNodeId: null,
      execution: { status: 'idle', nodeStatuses: {}, logs: [], streamTexts: {}, streamingNodeId: null, startedAt: null, duration: null },
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false
    })
  },

  // ===== 项目加载/保存 =====

  loadWorkflow: wf => {
    const nodes: Node[] = (wf.nodes || []).map(n => {
      const def = getDef(n.type)
      return {
        id: n.id,
        type: 'baseNode',
        position: n.position || { x: 0, y: 0 },
        data: {
          label: n.label || def?.displayName || n.type,
          nodeType: n.type,
          category: def?.category || 'action',
          color: def?.color || '#4cc38a',
          icon: def?.icon || '📦',
          config: { ...(def?.defaultConfig || {}), ...(n.config || {}) }
        }
      }
    })

    const edges: Edge[] = (wf.edges || []).map(e => ({
      id: e.id || uuid(),
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle
    }))

    set({
      nodes,
      edges,
      workflowId: wf.id || uuid(),
      workflowName: wf.name || '未命名工作流',
      variables: wf.variables || [],
      selectedNodeId: null,
      execution: { status: 'idle', nodeStatuses: {}, logs: [], streamTexts: {}, streamingNodeId: null, startedAt: null, duration: null },
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false
    })
  },

  saveToProject: async () => {
    const state = get()
    const wf = state.toWorkflowJSON()
    const ok = await useAppStore.getState().saveCurrentWorkflow(wf)
    if (ok) {
      toast.success('已保存到项目库')
    }
  },

  // ===== 执行操作 =====

  execute: async () => {
    const state = get()
    const wf = state.toWorkflowJSON()

    // 未连接到任何触发器时提示
    if (state.nodes.length === 0) {
      toast.warning('画布为空，请先添加节点')
      return
    }

    set({
      execution: {
        status: 'running',
        nodeStatuses: Object.fromEntries(state.nodes.map(n => [n.id, 'idle' as ExecutionStatus])),
        logs: [],
        streamTexts: {},
        streamingNodeId: null,
        startedAt: Date.now(),
        duration: null
      }
    })

    try {
      const unsubscribe = window.api.onExecutionUpdate(event => {
        const s = useWorkflowStore.getState()
        if (event.type === 'node:start' && event.nodeId) {
          s.setNodeStatus(event.nodeId, 'running')
          s.addLog(event.nodeId, '开始执行...')
        } else if (event.type === 'node:complete' && event.nodeId) {
          s.setNodeStatus(event.nodeId, 'success')
          s.addLog(event.nodeId, '执行成功', event.data as Record<string, unknown> | undefined)
        } else if (event.type === 'node:error' && event.nodeId) {
          s.setNodeStatus(event.nodeId, 'error')
          const errMsg = String((event.data as { error?: string } | undefined)?.error || '未知错误')
          s.addLog(event.nodeId, `执行失败: ${errMsg}`)
        } else if (event.type === 'node:log' && event.nodeId) {
          const msg = String((event.data as { message?: string } | undefined)?.message || '')
          if (msg) s.addLog(event.nodeId, msg)
        } else if (event.type === 'node:stream' && event.nodeId) {
          const chunk = event.data as { delta?: string; full?: string; done?: boolean } | undefined
          if (chunk?.full !== undefined) {
            s.setStreamChunk(event.nodeId, chunk.delta || '', chunk.full)
          }
          if (chunk?.done) s.clearStream(event.nodeId)
        } else if (event.type === 'node:cancelled' && event.nodeId) {
          s.setNodeStatus(event.nodeId, 'cancelled')
          s.addLog(event.nodeId, '已取消')
        }
      })

      let result: Awaited<ReturnType<typeof window.api.executeWorkflow>>
      try {
        result = await window.api.executeWorkflow(wf)
      } finally {
        unsubscribe()
      }

      if (result.success) {
        const resultData = result.result
        const wasCancelled = resultData && Object.values(resultData).some(r => r.status === 'cancelled')
        set({
          execution: {
            ...get().execution,
            status: wasCancelled ? 'cancelled' : 'completed',
            streamingNodeId: null,
            duration: Date.now() - (get().execution.startedAt || Date.now())
          }
        })
        if (!wasCancelled) toast.success('工作流执行完成')
        else toast.warning('工作流已取消')
      } else {
        set({
          execution: {
            ...get().execution,
            status: 'error',
            streamingNodeId: null,
            duration: Date.now() - (get().execution.startedAt || Date.now())
          }
        })
        toast.error(`执行失败: ${result.error || '未知错误'}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({
        execution: {
          ...get().execution,
          status: 'error',
          streamingNodeId: null,
          duration: Date.now() - (get().execution.startedAt || Date.now())
        }
      })
      toast.error(`执行异常: ${msg}`)
    }
  },

  cancelExecution: async () => {
    try {
      const res = await window.api.cancelExecution()
      if (res.success) {
        toast.info('正在取消执行...')
      }
    } catch {
      // 忽略
    }
  },

  resetExecution: () => set({
    execution: {
      status: 'idle',
      nodeStatuses: {},
      logs: [],
      streamTexts: {},
      streamingNodeId: null,
      startedAt: null,
      duration: null
    }
  }),

  addLog: (nodeId, message, output) => {
    set({
      execution: {
        ...get().execution,
        logs: [...get().execution.logs, { nodeId, message, timestamp: Date.now(), output }]
      }
    })
  },

  setNodeStatus: (nodeId, status) => {
    set({
      execution: {
        ...get().execution,
        nodeStatuses: { ...get().execution.nodeStatuses, [nodeId]: status }
      }
    })
  },

  setStreamChunk: (nodeId, delta, full) => {
    set({
      execution: {
        ...get().execution,
        streamTexts: { ...get().execution.streamTexts, [nodeId]: full },
        streamingNodeId: nodeId
      }
    })
  },

  clearStream: nodeId => {
    set({
      execution: {
        ...get().execution,
        streamingNodeId: get().execution.streamingNodeId === nodeId ? null : get().execution.streamingNodeId
      }
    })
  },

  // ===== 序列化 =====

  toWorkflowJSON: () => {
    const state = get()
    return {
      id: state.workflowId,
      name: state.workflowName,
      nodes: state.nodes.map(node => ({
        id: node.id,
        type: String(node.data.nodeType),
        label: String(node.data.label || ''),
        position: node.position,
        config: (node.data.config as Record<string, unknown>) || {}
      })),
      edges: state.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || undefined,
        targetHandle: edge.targetHandle || undefined
      })),
      variables: state.variables,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  },

  toWorkflowJSONString: () => JSON.stringify(get().toWorkflowJSON(), null, 2),

  // ===== 自动布局 =====

  autoLayout: () => {
    const { nodes, edges } = get()
    if (nodes.length === 0) return

    // 计算入度并分层（BFS）
    const inDegree: Record<string, number> = {}
    const children: Record<string, string[]> = {}
    for (const n of nodes) {
      inDegree[n.id] = 0
      children[n.id] = []
    }
    for (const e of edges) {
      if (inDegree[e.target] !== undefined) {
        inDegree[e.target]++
        children[e.source]?.push(e.target)
      }
    }

    const layers: string[][] = []
    const queue: string[] = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
    const visited = new Set(queue)
    while (queue.length > 0) {
      const layer: string[] = []
      const len = queue.length
      for (let i = 0; i < len; i++) {
        const id = queue.shift()!
        layer.push(id)
        for (const child of children[id] || []) {
          if (!visited.has(child)) {
            visited.add(child)
            queue.push(child)
          }
        }
      }
      layers.push(layer)
    }
    // 剩余环内节点放到最后一层
    const remaining = nodes.map(n => n.id).filter(id => !visited.has(id))
    if (remaining.length > 0) layers.push(remaining)

    const COL_GAP = 240
    const ROW_GAP = 100
    const next = nodes.map(n => {
      let layerIndex = layers.findIndex(l => l.includes(n.id))
      if (layerIndex === -1) layerIndex = 0
      const rowIndex = layers[layerIndex].indexOf(n.id)
      const offset = (layers[layerIndex].length - 1) / 2
      return {
        ...n,
        position: {
          x: layerIndex * COL_GAP + 60,
          y: (rowIndex - offset) * ROW_GAP + 200
        }
      }
    })
    set({ nodes: next })
    get().pushHistory()
    toast.success('已自动布局')
  }
}))
