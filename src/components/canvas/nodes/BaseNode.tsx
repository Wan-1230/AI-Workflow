import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play, Globe, Code2, GitBranch, Bell, Trash2, Copy, RotateCcw } from 'lucide-react'
import { useWorkflowStore, type ExecutionStatus } from '../../../stores/workflow-store'

const iconMap: Record<string, React.ElementType> = { play: Play, globe: Globe, 'code-2': Code2, 'git-branch': GitBranch, bell: Bell }

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

  const borderSt: Record<ExecutionStatus, string> = {
    idle: 'border-border', running: 'border-sig-amber', success: 'border-sig-green', error: 'border-sig-red', cancelled: 'border-t-faint opacity-50',
  }
  const dotSt: Record<ExecutionStatus, string> = {
    idle: 'bg-t-faint', running: 'bg-sig-amber animate-breathe', success: 'bg-sig-green', error: 'bg-sig-red', cancelled: 'bg-t-faint',
  }

  return (
    <>
      <div className={`relative px-3 py-2.5 rounded border bg-card min-w-[150px] cursor-pointer transition-all duration-100 ${borderSt[status]}
        ${selected ? 'shadow-node-selected' : 'shadow-node hover:shadow-card-hover'}`}
        onClick={e => { e.stopPropagation(); selectNode(id) }} onContextMenu={onCtx}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-sm flex items-center justify-center shrink-0" style={{ backgroundColor: nd.color + '12', color: nd.color }}>
            <Icon size={11} />
          </div>
          <span className="font-medium text-[11px] text-t-primary truncate">{nd.label}</span>
          <div className={`w-1.5 h-1.5 rounded-full ml-auto shrink-0 ${dotSt[status]}`} />
        </div>

        {/* 输入 handle */}
        <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-t-muted !border-2 !border-card" />

        {/* 输出 handle */}
        {isCondition ? (
          <>
            <Handle type="source" position={Position.Bottom} id="true"
              className="!w-2 !h-2 !bg-sig-green !border-2 !border-card" style={{ left: '30%' }} />
            <Handle type="source" position={Position.Bottom} id="false"
              className="!w-2 !h-2 !bg-sig-red !border-2 !border-card" style={{ left: '70%' }} />
            <span className="absolute -bottom-3.5 left-[22%] text-[7px] text-sig-green font-mono font-bold">T</span>
            <span className="absolute -bottom-3.5 left-[63%] text-[7px] text-sig-red font-mono font-bold">F</span>
          </>
        ) : (
          <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-t-muted !border-2 !border-card" />
        )}
      </div>

      {menu && (
        <div ref={menuRef} className="fixed z-[100] bg-card border border-border rounded shadow-card-hover py-1 min-w-[130px] animate-fade-up overflow-hidden"
          style={{ left: menu.x, top: menu.y }}>
          <CtxItem onClick={() => { addNode(nd.nodeType, { x: (positionAbsoluteX || 0) + 30, y: (positionAbsoluteY || 0) + 50 }); setMenu(null) }}>
            <Copy size={11} /> duplicate</CtxItem>
          <CtxItem onClick={() => setMenu(null)}><RotateCcw size={11} /> reset</CtxItem>
          <div className="border-t border-border my-0.5" />
          <CtxItem onClick={() => { removeNode(id); setMenu(null) }} className="text-sig-red">
            <Trash2 size={11} /> delete</CtxItem>
        </div>
      )}
    </>
  )
}

function CtxItem({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick: () => void }) {
  return <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-1 text-[10px] text-t-secondary hover:text-t-primary hover:bg-overlay transition-colors font-mono ${className}`}>{children}</button>
}

export const BaseNode = memo(BaseNodeComponent)
