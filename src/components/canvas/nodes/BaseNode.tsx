import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Copy, Trash2, RotateCcw } from 'lucide-react'
import { useWorkflowStore, type ExecutionStatus } from '../../../stores/workflow-store'

interface BaseNodeData {
  label: string
  nodeType: string
  category: string
  color: string
  icon: string
  config: Record<string, unknown>
}

const catLabels: Record<string, string> = {
  trigger: '触发',
  action: '动作',
  logic: '逻辑',
  ai: 'AI',
  agent: 'Agent',
  rag: 'RAG'
}

function BaseNodeComponent({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const { selectNode, execution, removeNode, duplicateNode } = useWorkflowStore()
  const nd = data as unknown as BaseNodeData
  const status: ExecutionStatus = execution.nodeStatuses[id] || 'idle'
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isCondition = nd.nodeType === 'condition'
  const isLoop = nd.nodeType === 'loop'

  useEffect(() => {
    if (!menu) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menu])

  const onCtx = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    selectNode(id)
    setMenu({ x: e.clientX, y: e.clientY })
  }, [id, selectNode])

  // 状态驱动的左侧色条与状态点
  const barColor: Record<ExecutionStatus, string> = {
    idle: nd.color,
    running: 'var(--c-sig-amber)',
    success: 'var(--c-sig-green)',
    error: 'var(--c-sig-red)',
    cancelled: 'var(--c-fg-faint)'
  }
  const dotClass: Record<ExecutionStatus, string> = {
    idle: 'bg-fg-faint',
    running: 'bg-sig-amber animate-pulse',
    success: 'bg-sig-green',
    error: 'bg-sig-red',
    cancelled: 'bg-fg-faint'
  }
  const boxClass: Record<ExecutionStatus, string> = {
    idle: '',
    running: 'ring-2 ring-sig-amber/40',
    success: 'ring-1 ring-sig-green/50',
    error: 'bg-danger/8 ring-1 ring-sig-red/50',
    cancelled: 'opacity-50'
  }

  return (
    <>
      <div
        className={`relative min-w-44 rounded-lg border bg-surface overflow-hidden cursor-pointer transition-all duration-fast
          ${selected ? 'shadow-card-hover border-accent/60 ring-1 ring-accent/40' : 'shadow-card hover:shadow-card-hover border-line'}
          ${boxClass[status]}`}
        onClick={e => { e.stopPropagation(); selectNode(id) }}
        onDoubleClick={e => { e.stopPropagation(); selectNode(id) }}
        onContextMenu={onCtx}
      >
        {/* 左侧状态色条 */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-150"
          style={{ backgroundColor: barColor[status] }}
        />

        <div className="pl-3.5 pr-3 py-2.5">
          {/* 第一行：图标 + 名称 + 状态点 */}
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[13px]"
              style={{ backgroundColor: nd.color + '18', color: nd.color }}
            >
              {nd.icon || '📦'}
            </div>
            <span className="text-xs font-medium text-fg truncate flex-1">{nd.label}</span>
            <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass[status]}`} />
          </div>
          {/* 第二行：类型 + 分类 */}
          <div className="flex items-center gap-2 pl-8">
            <span className="text-2xs text-fg-muted font-mono">{nd.nodeType}</span>
            <span className="text-2xs px-1.5 py-0.5 rounded bg-overlay text-fg-muted font-medium">
              {catLabels[nd.category] || nd.category}
            </span>
          </div>
        </div>

        {/* 连接点 */}
        <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-fg-faint !border-2 !border-surface" />
        {isCondition ? (
          <>
            <Handle type="source" position={Position.Bottom} id="true"
              className="!w-2.5 !h-2.5 !bg-sig-green !border-2 !border-surface" style={{ left: '30%' }} />
            <Handle type="source" position={Position.Bottom} id="false"
              className="!w-2.5 !h-2.5 !bg-sig-red !border-2 !border-surface" style={{ left: '70%' }} />
            <span className="absolute -bottom-4 left-[22%] text-2xs text-sig-green font-mono font-bold">T</span>
            <span className="absolute -bottom-4 left-[63%] text-2xs text-sig-red font-mono font-bold">F</span>
          </>
        ) : (
          <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-fg-faint !border-2 !border-surface" />
        )}
      </div>

      {/* 右键菜单 */}
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-surface border border-line rounded-lg shadow-modal py-1 min-w-36 animate-scale-in overflow-hidden"
          style={{ left: menu.x, top: menu.y }}
        >
          <CtxItem onClick={() => { duplicateNode(id); setMenu(null) }}>
            <Copy size={12} /> 复制节点
          </CtxItem>
          <CtxItem onClick={() => { selectNode(null); setMenu(null) }}>
            <RotateCcw size={12} /> 取消选中
          </CtxItem>
          <div className="border-t border-line my-1" />
          <CtxItem danger onClick={() => { removeNode(id); setMenu(null) }}>
            <Trash2 size={12} /> 删除节点
          </CtxItem>
        </div>
      )}
    </>
  )
}

function CtxItem({
  children,
  danger = false,
  className = '',
  onClick,
}: {
  children: React.ReactNode
  danger?: boolean
  className?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors
        ${danger ? 'text-sig-red hover:bg-danger/10' : 'text-fg-secondary hover:text-fg hover:bg-overlay'} ${className}`}
    >
      {children}
    </button>
  )
}

export const BaseNode = memo(BaseNodeComponent)
