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
        nodeTypes={nodeTypes} fitView snapToGrid snapGrid={[16, 16]}
        deleteKeyCode={['Backspace', 'Delete']}
        defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: '#d6d3d1', strokeWidth: 1.5 } }}
        style={{ background: '#f5f2ed' }}>
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2ddd6" />
        <Controls />
        <MiniMap nodeColor={(n) => (n.data?.color as string) || '#b45309'} maskColor="rgba(245,242,237,0.8)" style={{ background: '#faf8f5' }} />
      </ReactFlow>
    </div>
  )
}
