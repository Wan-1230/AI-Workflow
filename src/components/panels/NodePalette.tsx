import { useCallback, useState } from 'react'
import { Search, Play, Globe, Code2, GitBranch, Bell } from 'lucide-react'
import { nodeCategories, type UINodeDefinition } from '../../stores/node-definitions'

const icons: Record<string, React.ElementType> = { play: Play, globe: Globe, 'code-2': Code2, 'git-branch': GitBranch, bell: Bell }

function DragNode({ node }: { node: UINodeDefinition }) {
  const I = icons[node.icon] || Play
  return (
    <div draggable onDragStart={e => { e.dataTransfer.setData('application/reactflow-type', node.type); e.dataTransfer.effectAllowed = 'move' }}
      className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing
        bg-card hover:bg-overlay border border-border hover:border-accent/40 hover:shadow-card transition-all duration-150">
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: node.color + '14', color: node.color }}>
        <I size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-t-primary truncate">{node.displayName}</div>
        <div className="text-[10px] text-t-muted truncate font-mono mt-0.5">{node.description}</div>
      </div>
    </div>
  )
}

export function NodePalette() {
  const [q, setQ] = useState('')
  const cats = nodeCategories.map(c => ({ ...c, nodes: c.nodes.filter(n => !q || n.displayName.includes(q) || n.description.includes(q)) })).filter(c => c.nodes.length > 0)
  const total = nodeCategories.reduce((a, c) => a + c.nodes.length, 0)

  return (
    <div className="w-56 min-w-[224px] h-full border-r border-border bg-panel overflow-y-auto animate-slide-l">
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] font-semibold text-t-muted uppercase tracking-widest">节点</h2>
          <span className="text-3xs text-t-muted bg-base rounded-full px-2 py-0.5 font-mono">{total}</span>
        </div>
        <div className="relative mb-3">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-t-faint" />
          <input type="text" placeholder="搜索…" value={q} onChange={e => setQ(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-card border border-border rounded-sm text-t-primary placeholder:text-t-faint
              focus:border-accent/40 focus:outline-none transition-colors font-mono" />
        </div>
        <div className="space-y-4">
          {cats.map(cat => (
            <div key={cat.category}>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                <h3 className="text-[10px] font-semibold text-t-muted uppercase tracking-widest">{cat.label}</h3>
              </div>
              <div className="space-y-1">{cat.nodes.map(n => <DragNode key={n.type} node={n} />)}</div>
            </div>
          ))}
        </div>
        {cats.length === 0 && <div className="text-xs text-t-faint text-center py-8 font-mono">—</div>}
      </div>
    </div>
  )
}
