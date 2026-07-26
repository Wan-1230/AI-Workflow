import { useState } from 'react'
import { Search, Play, Globe, Code2, GitBranch, Bell } from 'lucide-react'
import { nodeCategories, type UINodeDefinition } from '../../stores/node-definitions'

const icons: Record<string, React.ElementType> = { play: Play, globe: Globe, 'code-2': Code2, 'git-branch': GitBranch, bell: Bell }

function DragNode({ node }: { node: UINodeDefinition }) {
  const I = icons[node.icon] || Play
  return (
    <div draggable onDragStart={e => { e.dataTransfer.setData('application/reactflow-type', node.type); e.dataTransfer.effectAllowed = 'move' }}
      className="group flex items-center gap-2 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing
        hover:bg-overlay border border-transparent hover:border-border transition-all duration-100">
      <div className="w-5 h-5 rounded-sm flex items-center justify-center shrink-0" style={{ backgroundColor: node.color + '12', color: node.color }}>
        <I size={11} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-t-primary truncate">{node.displayName}</div>
      </div>
    </div>
  )
}

export function NodePalette() {
  const [q, setQ] = useState('')
  const cats = nodeCategories.map(c => ({ ...c, nodes: c.nodes.filter(n => !q || n.displayName.includes(q) || n.description.includes(q)) })).filter(c => c.nodes.length > 0)

  return (
    <div className="w-48 min-w-[192px] h-full border-r border-border bg-panel overflow-y-auto">
      <div className="p-2.5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-[10px] font-bold text-t-muted uppercase tracking-widest">Nodes</h2>
        </div>
        <div className="relative mb-2.5">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-t-faint" />
          <input type="text" placeholder="filter..." value={q} onChange={e => setQ(e.target.value)}
            className="w-full pl-6 pr-2 py-1 text-[11px] bg-card border border-border rounded text-t-primary placeholder:text-t-faint
              focus:outline-none transition-colors font-mono" />
        </div>
        <div className="space-y-3">
          {cats.map(cat => (
            <div key={cat.category}>
              <div className="flex items-center gap-1.5 mb-1 px-0.5">
                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: cat.color }} />
                <h3 className="text-[9px] font-bold text-t-muted uppercase tracking-widest font-mono">{cat.label}</h3>
              </div>
              <div className="space-y-0.5">{cat.nodes.map(n => <DragNode key={n.type} node={n} />)}</div>
            </div>
          ))}
        </div>
        {cats.length === 0 && <div className="text-[10px] text-t-faint text-center py-6 font-mono">--</div>}
      </div>
    </div>
  )
}
