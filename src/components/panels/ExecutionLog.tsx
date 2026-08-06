import { useMemo, useEffect, useRef, useState } from 'react'
import { Terminal, ChevronRight, ChevronDown, Trash2, ChevronsDownUp, ChevronsUpDown, Loader2, CheckCircle2, XCircle, Ban, Play } from 'lucide-react'
import { useWorkflowStore, type ExecutionPhase } from '../../stores/workflow-store'
import { Tabs, IconButton, Badge, type BadgeTone } from '../ui'

/**
 * 运行面板（编辑器底部）
 * - 日志 Tab：节点级执行日志（时间 / 节点 / 消息 / 输出展开）
 * - 流式 Tab：LLM 节点实时流式输出（打字机效果）
 * - 头部显示运行状态与总耗时，支持清空与折叠
 */
export function ExecutionLog() {
  const execution = useWorkflowStore(s => s.execution)
  const nodes = useWorkflowStore(s => s.nodes)
  const resetExecution = useWorkflowStore(s => s.resetExecution)

  const [tab, setTab] = useState<'logs' | 'stream'>('logs')
  const [collapsed, setCollapsed] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  // 节点 id → 名称映射
  const labels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const n of nodes) m[n.id] = String(n.data?.label || '')
    return m
  }, [nodes])

  // 新日志自动滚到底部
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [execution.logs.length, tab])

  const statusMeta: Record<ExecutionPhase, { label: string; tone: BadgeTone; icon: React.ReactNode }> = {
    idle: { label: '就绪', tone: 'neutral', icon: <Play size={10} /> },
    running: { label: '运行中', tone: 'warning', icon: <Loader2 size={10} className="animate-spin" /> },
    completed: { label: '已完成', tone: 'success', icon: <CheckCircle2 size={10} /> },
    error: { label: '失败', tone: 'danger', icon: <XCircle size={10} /> },
    cancelled: { label: '已取消', tone: 'neutral', icon: <Ban size={10} /> }
  }
  const sm = statusMeta[execution.status]

  // 节点状态统计（供进度展示）
  const doneCount = Object.values(execution.nodeStatuses).filter(s => s === 'success').length
  const errCount = Object.values(execution.nodeStatuses).filter(s => s === 'error').length
  const nodeTotal = nodes.length

  const toggleLog = (i: number) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  const hasStream = Object.keys(execution.streamTexts).length > 0

  return (
    <div className="border-t border-line bg-surface flex flex-col shrink-0">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-line shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Terminal size={13} className="text-fg-muted shrink-0" />
          <span className="text-xs font-medium text-fg shrink-0">运行面板</span>
          <Badge tone={sm.tone} className="shrink-0">{sm.icon}{sm.label}</Badge>
          {execution.duration !== null && execution.status !== 'idle' && execution.status !== 'running' && (
            <span className="text-2xs text-fg-muted font-mono shrink-0">{(execution.duration / 1000).toFixed(2)}s</span>
          )}
        </div>

        {/* 节点进度 */}
        {execution.status === 'running' && nodeTotal > 0 && (
          <span className="text-2xs text-fg-muted hidden md:inline">
            节点 {doneCount}/{nodeTotal} 完成{errCount > 0 && <span className="text-sig-red"> · {errCount} 失败</span>}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Tabs
            items={[
              { value: 'logs', label: '日志', badge: execution.logs.length },
              { value: 'stream', label: '流式输出', badge: hasStream ? Object.keys(execution.streamTexts).length : null }
            ]}
            value={tab}
            onChange={v => setTab(v as 'logs' | 'stream')}
            variant="underline"
            className="[&>button]:h-7 [&>button]:px-2 [&>button]:text-xs"
          />
          <div className="w-px h-4 bg-line mx-1" />
          <IconButton
            size="sm"
            tooltip="清空日志"
            disabled={execution.logs.length === 0 && !hasStream}
            onClick={() => resetExecution()}
          >
            <Trash2 size={13} />
          </IconButton>
          <IconButton size="sm" tooltip={collapsed ? '展开面板' : '折叠面板'} onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
          </IconButton>
        </div>
      </div>

      {/* 内容区 */}
      {!collapsed && (
        <div className="h-52 overflow-y-auto px-3 py-2" ref={scrollRef}>
          {tab === 'logs' ? (
            execution.logs.length === 0 ? (
              <EmptyPanel
                title={execution.status === 'running' ? '正在执行...' : '暂无运行日志'}
                description="点击工具栏「运行」按钮执行工作流，日志将实时显示在这里"
              />
            ) : (
              <div className="space-y-0.5 font-mono text-xs">
                {execution.logs.map((log, i) => {
                  const label = labels[log.nodeId] || log.nodeId.slice(0, 8)
                  const hasOut = log.output && Object.keys(log.output).length > 0
                  const isOpen = expanded.has(i)
                  const isErr = log.message.includes('失败') || log.message.includes('错误')
                  return (
                    <div key={i} className="animate-fade-in">
                      <div
                        className={`flex items-start gap-2 rounded px-1.5 py-1 hover:bg-overlay/50 transition-colors ${hasOut ? 'cursor-pointer' : ''}`}
                        onClick={() => hasOut && toggleLog(i)}
                      >
                        <span className="text-fg-faint shrink-0 tabular-nums">
                          {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                        </span>
                        <span className={`shrink-0 font-medium ${isErr ? 'text-sig-red' : 'text-accent'}`}>[{label}]</span>
                        <span className={`break-all flex-1 ${isErr ? 'text-sig-red/80' : 'text-fg-secondary'}`}>{log.message}</span>
                        {hasOut && (
                          <span className="text-fg-faint shrink-0 mt-0.5">
                            {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          </span>
                        )}
                      </div>
                      {isOpen && log.output && (
                        <div className="ml-16 mb-1.5 p-2 bg-raised rounded-md border border-line text-[11px] text-fg-secondary">
                          {Object.entries(log.output).map(([k, v]) => (
                            <div key={k} className="flex gap-2 py-0.5">
                              <span className="text-accent shrink-0 font-medium">{k}:</span>
                              <span className="text-fg-muted break-all">
                                {typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            hasStream ? (
              <div className="space-y-2">
                {Object.entries(execution.streamTexts).map(([nodeId, text]) => (
                  <div key={nodeId} className="rounded-lg border border-line bg-raised p-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Loader2 size={11} className="text-accent animate-spin" />
                      <span className="text-xs font-medium text-fg-secondary">
                        {labels[nodeId] || nodeId.slice(0, 8)}
                      </span>
                      <span className="text-2xs text-fg-muted font-mono ml-auto">{text.length} 字符</span>
                    </div>
                    <p className="text-xs text-fg-secondary whitespace-pre-wrap leading-relaxed font-mono">
                      {text}
                      {execution.streamingNodeId === nodeId && <span className="inline-block w-1.5 h-3.5 bg-accent ml-0.5 align-middle animate-pulse" />}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel
                title="暂无流式输出"
                description="LLM 节点开启「流式输出」后，回复内容将实时显示在这里"
              />
            )
          )}
        </div>
      )}
    </div>
  )
}

/** 面板空状态（紧凑版） */
function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-1.5">
      <Terminal size={18} className="text-fg-faint opacity-40" />
      <p className="text-xs text-fg-muted">{title}</p>
      <p className="text-2xs text-fg-faint">{description}</p>
    </div>
  )
}
