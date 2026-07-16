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

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'error'

export interface ExecutionState {
  status: 'idle' | 'running' | 'completed' | 'error'
  nodeStatuses: Record<string, ExecutionStatus>
  logs: { nodeId: string; message: string; timestamp: number; output?: Record<string, unknown> }[]
}

interface WorkflowStore {
  // 画布数据
  nodes: Node[]
  edges: Edge[]
  workflowName: string

  // 选中状态
  selectedNodeId: string | null

  // 执行状态
  execution: ExecutionState

  // 画布操作
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNode: (type: string, position: XYPosition) => void
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  removeNode: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void

  // 工作流操作
  setWorkflowName: (name: string) => void
  clearCanvas: () => void

  // 执行操作
  execute: () => Promise<void>
  resetExecution: () => void
  addLog: (nodeId: string, message: string, output?: Record<string, unknown>) => void
  setNodeStatus: (nodeId: string, status: ExecutionStatus) => void

  // 序列化
  toWorkflowJSON: () => Record<string, unknown>
  fromWorkflowJSON: (json: Record<string, unknown>) => void

  // 范例
  loadExample: () => void
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],
  workflowName: '未命名工作流',
  selectedNodeId: null,
  execution: {
    status: 'idle',
    nodeStatuses: {},
    logs: []
  },

  // ===== 画布操作 =====

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node[] })
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) as Edge[] })
  },

  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges) as Edge[] })
  },

  addNode: (type, position) => {
    const def = nodeDefinitions[type]
    if (!def) return

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
    set({ nodes: [...get().nodes, newNode] })
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map(node =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      )
    })
  },

  removeNode: (nodeId) => {
    set({
      nodes: get().nodes.filter(n => n.id !== nodeId),
      edges: get().edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId
    })
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  // ===== 工作流操作 =====

  setWorkflowName: (name) => set({ workflowName: name }),
  clearCanvas: () => set({ nodes: [], edges: [], execution: { status: 'idle', nodeStatuses: {}, logs: [] } }),

  // ===== 执行操作 =====

  execute: async () => {
    const state = get()
    const wf = state.toWorkflowJSON()

    set({
      execution: {
        status: 'running',
        nodeStatuses: Object.fromEntries(state.nodes.map(n => [n.id, 'idle' as ExecutionStatus])),
        logs: []
      }
    })

    try {
      // 建立执行事件监听
      const unsubscribe = window.api.onExecutionUpdate((event) => {
        if (event.type === 'node:start' && event.nodeId) {
          get().setNodeStatus(event.nodeId, 'running')
          get().addLog(event.nodeId, '开始执行...')
        } else if (event.type === 'node:complete' && event.nodeId) {
          get().setNodeStatus(event.nodeId, 'success')
          get().addLog(event.nodeId, '执行成功 ✅', event.data as Record<string, unknown> | undefined)
        } else if (event.type === 'node:error' && event.nodeId) {
          get().setNodeStatus(event.nodeId, 'error')
          const errMsg = event.data?.error as string || '未知错误'
          get().addLog(event.nodeId, `执行失败 ❌: ${errMsg}`)
        }
      })

      const result = await window.api.executeWorkflow(wf as any)

      unsubscribe()

      if (result.success) {
        set({ execution: { ...get().execution, status: 'completed' } })
      } else {
        set({ execution: { ...get().execution, status: 'error' } })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ execution: { ...get().execution, status: 'error' } })
      console.error('工作流执行失败:', msg)
    }
  },

  resetExecution: () => set({
    execution: { status: 'idle', nodeStatuses: {}, logs: [] }
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

  // ===== 序列化 =====

  toWorkflowJSON: () => {
    const state = get()
    return {
      id: uuid(),
      name: state.workflowName,
      nodes: state.nodes.map(node => ({
        id: node.id,
        type: node.data.nodeType,
        label: node.data.label,
        position: node.position,
        config: node.data.config || {}
      })),
      edges: state.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || undefined,
        targetHandle: edge.targetHandle || undefined
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  },

  fromWorkflowJSON: (json) => {
    const wf = json as any
    const nodes: Node[] = (wf.nodes || []).map((n: any) => {
      const def = nodeDefinitions[n.type]
      return {
        id: n.id,
        type: 'baseNode',
        position: n.position || { x: 0, y: 0 },
        data: {
          label: n.label || def?.displayName || n.type,
          nodeType: n.type,
          category: def?.category || 'action',
          color: def?.color || '#22c55e',
          icon: def?.icon || '📦',
          config: n.config || {}
        }
      }
    })

    const edges: Edge[] = (wf.edges || []).map((e: any) => ({
      id: e.id || uuid(),
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle
    }))

    set({
      nodes,
      edges,
      workflowName: wf.name || '未命名工作流',
      selectedNodeId: null,
      execution: { status: 'idle', nodeStatuses: {}, logs: [] }
    })
  },

  // ===== 范例 =====

  loadExample: () => {
    const ids = { trigger: uuid(), http: uuid(), code: uuid(), notify: uuid() }

    const nodes: Node[] = [
      {
        id: ids.trigger, type: 'baseNode', position: { x: 250, y: 40 },
        data: { label: '👋 开始', nodeType: 'manual-trigger', category: 'trigger', color: '#5b9cf5', icon: 'play', config: {} }
      },
      {
        id: ids.http, type: 'baseNode', position: { x: 250, y: 210 },
        data: { label: '🌐 获取用户信息', nodeType: 'http-request', category: 'action', color: '#4cc38a', icon: 'globe',
          config: { url: 'https://api.github.com/users/octocat', method: 'GET', headers: '{}', body: '' } }
      },
      {
        id: ids.code, type: 'baseNode', position: { x: 250, y: 390 },
        data: { label: '💻 提取关键信息', nodeType: 'code-exec', category: 'action', color: '#4cc38a', icon: 'code-2',
          config: { code: '// input 包含了上游 HTTP 请求返回的数据\nconst user = input.data;\nreturn {\n  用户名: user.login,\n  昵称: user.name,\n  简介: user.bio,\n  仓库数: user.public_repos,\n  关注者: user.followers,\n  注册时间: user.created_at\n};' } }
      },
      {
        id: ids.notify, type: 'baseNode', position: { x: 250, y: 570 },
        data: { label: '📢 输出结果', nodeType: 'notification', category: 'action', color: '#4cc38a', icon: 'bell',
          config: { message: '✅ 用户 {{' + ids.code + '.用户名}} 已处理完成！', level: 'info' } }
      },
    ]

    const edges: Edge[] = [
      { id: uuid(), source: ids.trigger, target: ids.http },
      { id: uuid(), source: ids.http, target: ids.code },
      { id: uuid(), source: ids.code, target: ids.notify },
    ]

    set({
      nodes, edges,
      workflowName: '示例：GitHub 用户查询',
      selectedNodeId: null,
      execution: { status: 'idle', nodeStatuses: {}, logs: [] }
    })
  }
}))
