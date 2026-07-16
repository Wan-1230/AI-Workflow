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
        defaultEdgeOptions={{ style: { stroke: '#2e2f39', strokeWidth: 1.5 } }}
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #0f1118 0%, #08090c 70%)' }}>
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} color="#1c1d25" />
        <Controls />
        <MiniMap nodeColor={n => n.data?.color || '#4db87a'} maskColor="rgba(0,0,0,0.6)" style={{ background: '#16171e' }} />
      </ReactFlow>
    </div>
  )
}
