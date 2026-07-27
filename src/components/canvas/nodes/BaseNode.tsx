import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play, Globe, Code2, GitBranch, Bell, Trash2, Copy, RotateCcw } from 'lucide-react'
import { useWorkflowStore, type ExecutionStatus } from '../../../stores/workflow-store'

const iconMap: Record<string, React.ElementType> = { play: Play, globe: Globe, 'code-2': Code2, 'git-branch': GitBranch, bell: Bell }
const catLabels: Record<string, string> = { trigger: 'Trigger', action: 'Action', logic: 'Logic', ai: 'AI', agent: 'Agent' }

interface BaseNodeData { label: string; nodeType: string; category: string; color: string; icon: string; config: Record<string, unknown> }

function BaseNodeComponent({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const { selectNode, execution, removeNode, addNode } = useWorkflowStore()
  const nd = data as unknown as BaseNodeData
  const status: ExecutionStatus = execution.nodeStatuses[id] || 'idle'
  const Icon = iconMap[nd.icon] || Play
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isCondition = nd.nodeType === 'condition'

  useEffect(() => {
    if (!menu) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [menu])

  const onCtx = useCallback((e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); selectNode(id); setMenu({ x: e.clientX, y: e.clientY }) }, [id, selectNode])

  // Status-driven left bar color
  const barColor: Record<ExecutionStatus, string> = {
    idle: nd.color, running: '#f59e0b', success: '#22c55e', error: '#ef4444', cancelled: '#cbd5e1',
  }
  const dotSt: Record<ExecutionStatus, string> = {
    idle: 'bg-slate-300', running: 'bg-sig-amber animate-breathe', success: 'bg-sig-green', error: 'bg-sig-red', cancelled: 'bg-slate-300',
  }

  return (
    <>
      <div className={`relative min-w-[180px] rounded-lg border bg-card overflow-hidden cursor-pointer transition-all duration-150
        ${selected ? 'shadow-node-selected border-accent/50' : 'shadow-node hover:shadow-card-hover border-border'}
        ${status === 'error' ? 'bg-red-50/50' : ''} ${status === 'cancelled' ? 'opacity-50' : ''}`}
        onClick={e => { e.stopPropagation(); selectNode(id) }} onContextMenu={onCtx}>
        {/* Left color bar */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-150" style={{ backgroundColor: barColor[status] }} />

        <div className="pl-3.5 pr-3 py-2.5">
          {/* Row 1: Icon + Label */}
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: nd.color + '12', color: nd.color }}>
              <Icon size={12} />
            </div>
            <span className="text-[12px] font-medium text-t-primary truncate flex-1">{nd.label}</span>
            <div className={`w-2 h-2 rounded-full shrink-0 ${dotSt[status]}`} />
          </div>
          {/* Row 2: Type + Category */}
          <div className="flex items-center gap-2 pl-8">
            <span className="text-[10px] text-t-muted font-mono">{nd.nodeType}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-overlay text-t-muted font-medium">{catLabels[nd.category] || nd.category}</span>
          </div>
        </div>

        {/* Handles */}
        <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-slate-300 !border-2 !border-white" />

        {isCondition ? (
          <>
            <Handle type="source" position={Position.Bottom} id="true"
              className="!w-2.5 !h-2.5 !bg-sig-green !border-2 !border-white" style={{ left: '30%' }} />
            <Handle type="source" position={Position.Bottom} id="false"
              className="!w-2.5 !h-2.5 !bg-sig-red !border-2 !border-white" style={{ left: '70%' }} />
            <span className="absolute -bottom-4 left-[22%] text-[8px] text-sig-green font-mono font-bold">T</span>
            <span className="absolute -bottom-4 left-[63%] text-[8px] text-sig-red font-mono font-bold">F</span>
          </>
        ) : (
          <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-slate-300 !border-2 !border-white" />
        )}
      </div>

      {/* Context menu */}
      {menu && (
        <div ref={menuRef} className="fixed z-[100] bg-card border border-border rounded-lg shadow-modal py-1 min-w-[150px] animate-fade-up overflow-hidden"
          style={{ left: menu.x, top: menu.y }}>
          <CtxItem onClick={() => { addNode(nd.nodeType, { x: (positionAbsoluteX || 0) + 40, y: (positionAbsoluteY || 0) + 60 }); setMenu(null) }}>
            <Copy size={12} /> Duplicate</CtxItem>
          <CtxItem onClick={() => setMenu(null)}><RotateCcw size={12} /> Reset status</CtxItem>
          <div className="border-t border-border my-1" />
          <CtxItem onClick={() => { removeNode(id); setMenu(null) }} className="text-sig-red hover:text-sig-red hover:bg-red-50">
            <Trash2 size={12} /> Delete</CtxItem>
        </div>
      )}
    </>
  )
}

function CtxItem({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick: () => void }) {
  return <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-t-secondary hover:text-t-primary hover:bg-overlay transition-colors ${className}`}>{children}</button>
}

export const BaseNode = memo(BaseNodeComponent)
