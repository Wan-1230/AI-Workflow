import { useState } from 'react'
import { Search, Play, Globe, Code2, GitBranch, Bell } from 'lucide-react'
import { nodeCategories, type UINodeDefinition } from '../../stores/node-definitions'

const icons: Record<string, React.ElementType> = { play: Play, globe: Globe, 'code-2': Code2, 'git-branch': GitBranch, bell: Bell }

function DragNode({ node }: { node: UINodeDefinition }) {
  const I = icons[node.icon] || Play
  return (
    <div draggable onDragStart={e => { e.dataTransfer.setData('application/reactflow-type', node.type); e.dataTransfer.effectAllowed = 'move' }}
      className="group flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-grab active:cursor-grabbing
        hover:bg-overlay border border-transparent hover:border-border transition-all duration-100">
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: node.color + '12', color: node.color }}>
        <I size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-t-primary leading-tight">{node.displayName}</div>
        <div className="text-[10px] text-t-muted mt-0.5 leading-tight line-clamp-2">{node.description}</div>
      </div>
    </div>
  )
}

export function NodePalette() {
  const [q, setQ] = useState('')
  const cats = nodeCategories.map(c => ({ ...c, nodes: c.nodes.filter(n => !q || n.displayName.includes(q) || n.description.includes(q)) })).filter(c => c.nodes.length > 0)

  return (
    <div className="w-[220px] min-w-[220px] h-full border-r border-border bg-panel flex flex-col">
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <h2 className="text-[11px] font-semibold text-t-muted uppercase tracking-wider mb-2">Nodes</h2>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-t-faint" />
          <input type="text" placeholder="Search nodes..." value={q} onChange={e => setQ(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-[12px] bg-base border border-border rounded-lg text-t-primary placeholder:text-t-faint
              focus:outline-none transition-colors" />
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="space-y-4">
          {cats.map(cat => (
            <div key={cat.category}>
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                <h3 className="text-[10px] font-semibold text-t-muted uppercase tracking-wider">{cat.label}</h3>
                <span className="text-[9px] text-t-faint font-mono ml-auto">{cat.nodes.length}</span>
              </div>
              <div className="space-y-0.5">{cat.nodes.map(n => <DragNode key={n.type} node={n} />)}</div>
            </div>
          ))}
        </div>
        {cats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-t-faint gap-1">
            <Search size={16} className="opacity-40" />
            <p className="text-[11px]">No results</p>
          </div>
        )}
      </div>
    </div>
  )
}
