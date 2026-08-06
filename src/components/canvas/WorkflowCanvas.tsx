import { useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type XYPosition,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { BaseNode } from './nodes/BaseNode'
import { useWorkflowStore } from '../../stores/workflow-store'
import { nodeDefinitions } from '../../stores/node-definitions'
import { toast } from '../../stores/toast-store'

const nodeTypes = { baseNode: BaseNode }

/**
 * 中央画布：拖拽/缩放/框选/快捷键/复制粘贴
 * 快捷键：
 *  - Ctrl/Cmd+Z 撤销 / Ctrl+Shift+Z / Ctrl+Y 重做
 *  - Ctrl/Cmd+C 复制 / Ctrl/Cmd+V 粘贴 / Ctrl/Cmd+D 复制选中节点
 *  - Delete/Backspace 删除（ReactFlow 内置）
 *  - Ctrl/Cmd+S 保存
 *  - Ctrl/Cmd+L 自动布局
 */
export function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, selectNode } = useWorkflowStore()
  const wrapper = useRef<HTMLDivElement>(null)
  const rf = useReactFlow()

  // 拖拽添加节点
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow-type')
    if (!type || !nodeDefinitions[type]) return
    const b = wrapper.current?.getBoundingClientRect()
    if (!b) return
    const pos = rf.screenToFlowPosition({ x: e.clientX - b.left, y: e.clientY - b.top })
    addNode(type, { x: pos.x - 90, y: pos.y - 28 })
  }, [addNode, rf])

  // 全局快捷键（避免与输入框冲突）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const mod = e.ctrlKey || e.metaKey
      const s = useWorkflowStore.getState()

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
      } else if (mod && e.key.toLowerCase() === 'c') {
        s.copySelection()
      } else if (mod && e.key.toLowerCase() === 'v') {
        s.pasteClipboard()
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (s.selectedNodeId) s.duplicateNode(s.selectedNodeId)
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        s.saveToProject()
      } else if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        s.autoLayout()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div ref={wrapper} className="flex-1 relative" style={{ height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
        onDrop={onDrop}
        onPaneClick={() => selectNode(null)}
        onNodeDoubleClick={(_, node) => selectNode(node.id)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Shift', 'Meta']}
        selectionKeyCode="Shift"
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: 'var(--c-line-strong)', strokeWidth: 1.5 },
          markerEnd: { type: 'arrowclosed', width: 14, height: 14, color: 'var(--c-line-strong)' }
        }}
        proOptions={{ hideAttribution: true }}
        className="bg-canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--c-line)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={n => (n.data?.color as string) || 'var(--c-accent)'}
          maskColor="var(--c-overlay)"
          style={{ background: 'var(--c-surface)' }}
        />
      </ReactFlow>
    </div>
  )
}
