import { useState } from 'react'
import { Search, Grid3X3 } from 'lucide-react'
import { nodeCategories, type NodeDefinition } from '@shared/node-catalog'
import { useWorkflowStore } from '../../stores/workflow-store'
import { toast } from '../../stores/toast-store'

/** 可拖拽节点项：拖拽到画布创建 */
function DragNode({ node }: { node: NodeDefinition }) {
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/reactflow-type', node.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDoubleClick={() => {
        const { addNode } = useWorkflowStore.getState()
        addNode(node.id, { x: 120 + Math.random() * 160, y: 120 + Math.random() * 120 })
        toast.success(`已添加「${node.displayName}」`)
      }}
      className="group flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-grab active:cursor-grabbing
        hover:bg-overlay border border-transparent hover:border-line transition-all duration-fast"
      title={`双击直接添加到画布：${node.description}`}
    >
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 text-sm"
        style={{ backgroundColor: node.color + '14', color: node.color }}>
        {node.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-fg leading-tight">{node.displayName}</div>
        <div className="text-2xs text-fg-muted mt-0.5 leading-tight line-clamp-2">{node.description}</div>
      </div>
    </div>
  )
}

/**
 * 左侧节点面板：分类分组 + 搜索过滤 + 拖拽/双击添加
 */
export function NodePalette() {
  const [q, setQ] = useState('')
  const cats = nodeCategories
    .map(c => ({
      ...c,
      nodes: c.nodes.filter(n =>
        !q || n.displayName.toLowerCase().includes(q.toLowerCase()) || n.description.includes(q) || n.id.includes(q)
      )
    }))
    .filter(c => c.nodes.length > 0)

  return (
    <div className="w-56 min-w-56 h-full border-r border-line bg-surface flex flex-col">
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <h2 className="text-2xs font-semibold text-fg-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Grid3X3 size={12} /> 节点库
        </h2>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索节点..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-app border border-line rounded-lg text-fg placeholder:text-fg-faint
              focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* 节点列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="space-y-4">
          {cats.map(cat => (
            <div key={cat.category}>
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                <h3 className="text-2xs font-semibold text-fg-muted uppercase tracking-wider">{cat.label}</h3>
                <span className="text-2xs text-fg-faint font-mono ml-auto">{cat.nodes.length}</span>
              </div>
              <div className="space-y-0.5">
                {cat.nodes.map(n => <DragNode key={n.id} node={n} />)}
              </div>
            </div>
          ))}
        </div>
        {cats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-fg-faint gap-1">
            <Search size={16} className="opacity-40" />
            <p className="text-2xs">没有匹配的节点</p>
          </div>
        )}
      </div>
    </div>
  )
}
