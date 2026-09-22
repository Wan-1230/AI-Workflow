import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { Terminal, ChevronRight, Trash2, ChevronsDownUp, ChevronsUpDown, Loader2, CheckCircle2, XCircle, Ban, Play } from 'lucide-react'
import { useWorkflowStore, type ExecutionPhase } from '../../stores/workflow-store'
import { visibleRange, shouldFollowBottom } from '../../stores/virtual-range'
import type { LogLine } from '../../stores/log-buffer'
import { Tabs, IconButton, Badge, type BadgeTone } from '../ui'

/**
 * 运行面板（编辑器底部）
 * - 日志 Tab：定高虚拟列表（以前每次事件都要重排全部日志行）
 * - 流式 Tab：LLM 节点实时流式输出
 * - 输出明细放在列表下方的固定区域：展开行会破坏虚拟列表的定高前提
 */

/** 与 .logRow 的行高一致；改样式时两处一起改 */
const ROW_HEIGHT = 28
const VIEWPORT_HEIGHT = 160

export function ExecutionLog() {
  const execution = useWorkflowStore(s => s.execution)
  const nodes = useWorkflowStore(s => s.nodes)
  const resetExecution = useWorkflowStore(s => s.resetExecution)

  const [tab, setTab] = useState<'logs' | 'stream'>('logs')
  const [collapsed, setCollapsed] = useState(false)
  const [selected, setSelected] = useState<{ line: LogLine; index: number } | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** 用户往上翻了就停止跟随底部，否则新日志会把他拽回去 */
  const followBottom = useRef(true)

  const labels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const n of nodes) m[n.id] = String(n.data?.label || '')
    return m
  }, [nodes])

  const logs = execution.logs
  const total = logs.length

  useEffect(() => {
    const el = scrollRef.current
    if (!el || tab !== 'logs') return
    if (followBottom.current) el.scrollTop = el.scrollHeight
  }, [total, tab])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    setScrollTop(el.scrollTop)
    followBottom.current = shouldFollowBottom(el.scrollTop, el.scrollHeight, el.clientHeight)
  }, [])

  const range = useMemo(
    () => visibleRange(scrollTop, VIEWPORT_HEIGHT, total, ROW_HEIGHT),
    [scrollTop, total]
  )

  const statusMeta: Record<ExecutionPhase, { label: string; tone: BadgeTone; icon: React.ReactNode }> = {
    idle: { label: '就绪', tone: 'neutral', icon: <Play size={10} /> },
    running: { label: '运行中', tone: 'warning', icon: <Loader2 size={10} className="animate-spin" /> },
    completed: { label: '已完成', tone: 'success', icon: <CheckCircle2 size={10} /> },
    error: { label: '失败', tone: 'danger', icon: <XCircle size={10} /> },
    cancelled: { label: '已取消', tone: 'neutral', icon: <Ban size={10} /> }
  }
  const sm = statusMeta[execution.status]

  const doneCount = Object.values(execution.nodeStatuses).filter(s => s === 'success').length
  const errCount = Object.values(execution.nodeStatuses).filter(s => s === 'error').length
  const nodeTotal = nodes.length
  const streamEntries = Object.entries(execution.streamTexts)
  const hasStream = streamEntries.length > 0

  const selectLine = (line: LogLine, index: number): void => {
    if (!line.outputPreview) return
    setSelected(prev => (prev && prev.index === index ? null : { line, index }))
  }

  return (
    <div className="border-t border-line bg-surface flex flex-col shrink-0">
      <div className="flex items-center gap-2 px-3 h-10 border-b border-line shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Terminal size={13} className="text-fg-muted shrink-0" />
          <span className="text-xs font-medium text-fg shrink-0">运行面板</span>
          <Badge tone={sm.tone} className="shrink-0">{sm.icon}{sm.label}</Badge>
          {execution.duration !== null && execution.status !== 'idle' && execution.status !== 'running' && (
            <span className="text-2xs text-fg-muted font-mono shrink-0">{(execution.duration / 1000).toFixed(2)}s</span>
          )}
        </div>

        {execution.status === 'running' && nodeTotal > 0 && (
          <span className="text-2xs text-fg-muted hidden md:inline">
            节点 {doneCount}/{nodeTotal} 完成{errCount > 0 && <span className="text-sig-red"> · {errCount} 失败</span>}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Tabs
            items={[
              { value: 'logs', label: '日志', badge: total },
              { value: 'stream', label: '流式输出', badge: hasStream ? streamEntries.length : null }
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
            disabled={total === 0 && !hasStream}
            onClick={() => { resetExecution(); setSelected(null) }}
          >
            <Trash2 size={13} />
          </IconButton>
          <IconButton size="sm" tooltip={collapsed ? '展开面板' : '折叠面板'} onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
          </IconButton>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 py-2 flex flex-col gap-2">
          {tab === 'logs' ? (
            total === 0 ? (
              <EmptyPanel
                title={execution.status === 'running' ? '正在执行...' : '暂无运行日志'}
                description="点击工具栏「运行」按钮执行工作流，日志将实时显示在这里"
              />
            ) : (
              <>
                <div
                  ref={scrollRef}
                  onScroll={onScroll}
                  className="overflow-y-auto font-mono text-xs"
                  style={{ height: VIEWPORT_HEIGHT }}
                >
                  <div style={{ height: range.padTop }} />
                  {logs.slice(range.first, range.last + 1).map((log, offset) => {
                    const i = range.first + offset
                    const label = labels[log.nodeId] || log.nodeId.slice(0, 8)
                    const isErr = log.message.includes('失败') || log.message.includes('错误')
                    const open = selected?.index === i
                    return (
                      <div
                        key={`${i}-${log.timestamp}`}
                        className={`logRow flex items-center gap-2 rounded px-1.5 hover:bg-overlay/50 transition-colors ${log.outputPreview ? 'cursor-pointer' : ''}`}
                        onClick={() => selectLine(log, i)}
                      >
                        <span className="text-fg-faint shrink-0 tabular-nums">
                          {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                        </span>
                        <span className={`shrink-0 font-medium ${isErr ? 'text-sig-red' : 'text-accent'}`}>[{label}]</span>
                        <span className={`break-all flex-1 truncate ${isErr ? 'text-sig-red/80' : 'text-fg-secondary'}`}>{log.message}</span>
                        {log.outputPreview && (
                          <span className={`text-fg-faint shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
                            <ChevronRight size={11} />
                          </span>
                        )}
                      </div>
                    )
                  })}
                  <div style={{ height: range.padBottom }} />
                </div>

                {execution.droppedLogs > 0 && (
                  <p className="text-2xs text-fg-faint">为控制内存，已丢弃更早的 {execution.droppedLogs} 条日志</p>
                )}

                {selected?.line.outputPreview && (
                  <div className="max-h-28 overflow-y-auto p-2 bg-raised rounded-md border border-line text-[11px] text-fg-secondary">
                    <p className="font-mono break-all whitespace-pre-wrap">{selected.line.outputPreview}</p>
                    {selected.line.truncated && (
                      <p className="text-2xs text-fg-faint mt-1">输出过长，此处仅保留前 2048 字符；完整结果见该节点的运行记录。</p>
                    )}
                  </div>
                )}
              </>
            )
          ) : !hasStream ? (
            <EmptyPanel
              title="暂无流式输出"
              description="LLM 节点开启「流式输出」后，回复内容将实时显示在这里"
            />
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {streamEntries.map(([nodeId, text]) => (
                <div key={nodeId} className="rounded-lg border border-line bg-raised p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Loader2 size={11} className="text-accent animate-spin" />
                    <span className="text-xs font-medium text-fg-secondary">{labels[nodeId] || nodeId.slice(0, 8)}</span>
                    <span className="text-2xs text-fg-muted font-mono ml-auto">{text.length} 字符</span>
                  </div>
                  <p className="text-xs text-fg-secondary whitespace-pre-wrap leading-relaxed font-mono">
                    {text}
                    {execution.streamingNodeId === nodeId && (
                      <span className="inline-block w-1.5 h-3.5 bg-accent ml-0.5 align-middle animate-pulse" />
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 面板空状态（紧凑版） */
function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-center gap-1.5">
      <Terminal size={18} className="text-fg-faint opacity-40" />
      <p className="text-xs text-fg-muted">{title}</p>
      <p className="text-2xs text-fg-faint">{description}</p>
    </div>
  )
}
