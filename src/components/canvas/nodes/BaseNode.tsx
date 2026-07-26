import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play, Globe, Code2, GitBranch, Bell, Trash2, Copy, RotateCcw } from 'lucide-react'
import { useWorkflowStore, type ExecutionStatus } from '../../../stores/workflow-store'

const iconMap: Record<string, React.ElementType> = { play: Play, globe: Globe, 'code-2': Code2, 'git-branch': GitBranch, bell: Bell }
const catNames: Record<string, string> = { trigger: '触发器', action: '动作', logic: '逻辑', ai: 'AI', agent: 'Agent' }

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

  const st: Record<ExecutionStatus, string> = {
    idle: 'border-border', running: 'border-sig-amber animate-breathe', success: 'border-sig-green', error: 'border-sig-red', cancelled: 'border-t-muted opacity-50',
  }
  const dot: Record<ExecutionStatus, string> = {
    idle: 'bg-t-muted', running: 'bg-sig-amber', success: 'bg-sig-green', error: 'bg-sig-red', cancelled: 'bg-t-faint',
  }

  return (
    <>
      <div className={`relative px-3.5 py-3 rounded-xl border bg-card min-w-[170px] cursor-pointer transition-all duration-200 ${st[status]}
        ${selected ? 'shadow-node-selected' : 'shadow-node hover:shadow-card-hover hover:-translate-y-0.5'}`}
        onClick={e => { e.stopPropagation(); selectNode(id) }} onContextMenu={onCtx}>
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: nd.color + '15', color: nd.color }}>
            <Icon size={14} />
          </div>
          <span className="font-medium text-[13px] text-t-primary truncate tracking-tight">{nd.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${dot[status]}`} />
          <span className="text-3xs px-2 py-0.5 rounded-full font-medium tracking-wider uppercase" style={{ backgroundColor: nd.color + '0f', color: nd.color }}>
            {catNames[nd.category] || nd.category}
          </span>
        </div>

        {/* 输入 handle */}
        <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-t-muted !border-2 !border-card transition-all" />

        {/* 输出 handle：条件节点有两个（true/false），其他节点一个 */}
        {isCondition ? (
          <>
            <Handle type="source" position={Position.Bottom} id="true"
              className="!w-2.5 !h-2.5 !bg-sig-green !border-2 !border-card transition-all" style={{ left: '30%' }} />
            <Handle type="source" position={Position.Bottom} id="false"
              className="!w-2.5 !h-2.5 !bg-sig-red !border-2 !border-card transition-all" style={{ left: '70%' }} />
            {/* 分支标签 */}
            <span className="absolute -bottom-4 left-[20%] text-[8px] text-sig-green font-mono font-bold">T</span>
            <span className="absolute -bottom-4 left-[63%] text-[8px] text-sig-red font-mono font-bold">F</span>
          </>
        ) : (
          <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-sig-green !border-2 !border-card transition-all" />
        )}
      </div>

      {menu && (
        <div ref={menuRef} className="fixed z-[100] bg-panel border border-border rounded-xl shadow-glass py-1.5 min-w-[150px] animate-fade-up overflow-hidden"
          style={{ left: menu.x, top: menu.y }}>
          <div className="px-3 py-1 text-3xs text-t-muted border-b border-border mb-0.5 uppercase tracking-wider">{nd.label}</div>
          <MIcon onClick={() => { addNode(nd.nodeType, { x: (positionAbsoluteX || 0) + 40, y: (positionAbsoluteY || 0) + 60 }); setMenu(null) }}>
            <Copy size={13} /> 复制节点</MIcon>
          <MIcon onClick={() => setMenu(null)}><RotateCcw size={13} /> 重置状态</MIcon>
          <div className="border-t border-border my-0.5" />
          <MIcon onClick={() => { removeNode(id); setMenu(null) }} className="text-sig-red hover:text-sig-red hover:bg-sig-red/5">
            <Trash2 size={13} /> 删除节点</MIcon>
        </div>
      )}
    </>
  )
}

function MIcon({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick: () => void }) {
  return <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-t-secondary hover:text-t-primary hover:bg-overlay transition-colors ${className}`}>{children}</button>
}

export const BaseNode = memo(BaseNodeComponent)
