import { useCallback, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, type XYPosition, BackgroundVariant } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { BaseNode } from './nodes/BaseNode'
import { useWorkflowStore } from '../../stores/workflow-store'
import { nodeDefinitions } from '../../stores/node-definitions'

const nodeTypes = { baseNode: BaseNode }

export function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, selectNode } = useWorkflowStore()
  const wrapper = useRef<HTMLDivElement>(null)

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const t = e.dataTransfer.getData('application/reactflow-type')
    if (!t || !nodeDefinitions[t]) return
    const b = wrapper.current?.getBoundingClientRect(); if (!b) return
    addNode(t, { x: e.clientX - b.left - 80, y: e.clientY - b.top - 30 })
  }, [addNode])

  return (
    <div ref={wrapper} className="flex-1" style={{ height: '100%' }}>
      <ReactFlow nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
        onDrop={onDrop} onPaneClick={() => selectNode(null)}
        nodeTypes={nodeTypes} fitView snapToGrid snapGrid={[20, 20]}
        deleteKeyCode={['Backspace', 'Delete']}
        defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: '#cfd2db', strokeWidth: 1.6 } }}
        style={{ background: 'radial-gradient(120% 90% at 50% -20%, #ffffff 0%, #f1f2f6 72%)' }}>
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.1} color="#e2e4ea" />
        <Controls />
        <MiniMap nodeColor={(n) => (n.data?.color as string) || '#4f7cf0'} maskColor="rgba(255,255,255,0.7)" style={{ background: '#ffffff' }} />
      </ReactFlow>
    </div>
  )
}
