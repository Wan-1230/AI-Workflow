import { useMemo, useEffect, useRef, useState } from 'react'
import { Terminal, ChevronRight, ChevronDown } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'

export function ExecutionLog() {
  const execution = useWorkflowStore(s => s.execution)
  const nodes = useWorkflowStore(s => s.nodes)
  const { logs, status } = execution
  const scrollRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const labels = useMemo(() => {
    const m: Record<string, string> = {}; for (const n of nodes) m[n.id] = (n.data?.label as string) || n.id; return m
  }, [nodes])

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [logs])

  const toggle = (i: number) => setExpanded(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n })

  const statusConfig: Record<string, { label: string; cls: string }> = {
    idle:      { label: 'Idle',      cls: 'text-t-muted' },
    running:   { label: 'Running',   cls: 'text-sig-amber' },
    completed: { label: 'Completed', cls: 'text-sig-green' },
    error:     { label: 'Error',     cls: 'text-sig-red' },
    cancelled: { label: 'Cancelled', cls: 'text-t-muted' },
  }
  const sc = statusConfig[status] || statusConfig.idle

  return (
    <div className="border-t border-border bg-panel flex flex-col" style={{ minHeight: 160, maxHeight: 320 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={13} className="text-t-muted" />
          <span className="text-[12px] font-medium text-t-primary">Execution Log</span>
          {logs.length > 0 && (
            <span className="text-[10px] text-t-muted bg-overlay rounded-full px-2 py-0.5 font-mono">{logs.length}</span>
          )}
        </div>
        <span className={`text-[11px] font-medium ${sc.cls}`}>{sc.label}</span>
      </div>

      {/* Log content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-t-faint gap-2">
            <Terminal size={18} className="opacity-30" />
            <p className="text-[12px]">No execution yet</p>
            <p className="text-[10px] text-t-faint">Run a workflow to see logs here</p>
          </div>
        ) : (
          <div className="space-y-0.5 font-mono">
            {logs.map((log, i) => {
              const label = labels[log.nodeId] || log.nodeId
              const isErr = log.message.includes('\u274c')
              const isOk = log.message.includes('\u2705')
              const hasOut = log.output && Object.keys(log.output).length > 0
              const isOpen = expanded.has(i)
              return (
                <div key={i} className="animate-fade-in">
                  <div className={`flex items-start gap-2 text-[11px] py-1 rounded px-1 -mx-1 ${hasOut ? 'cursor-pointer hover:bg-overlay/60' : ''}`}
                    onClick={() => hasOut && toggle(i)}>
                    <span className="text-t-faint shrink-0 tabular-nums">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`shrink-0 font-semibold ${isErr ? 'text-sig-red' : isOk ? 'text-sig-green' : 'text-accent'}`}>[{label}]</span>
                    <span className={`break-all flex-1 ${isErr ? 'text-sig-red/80' : 'text-t-secondary'}`}>{log.message}</span>
                    {hasOut && <span className="text-t-faint shrink-0 mt-0.5">{isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}</span>}
                  </div>
                  {isOpen && log.output && (
                    <div className="ml-20 mb-1.5 p-2.5 bg-base rounded-lg border border-border text-[10px] text-t-secondary">
                      {Object.entries(log.output).map(([k, v]) => (
                        <div key={k} className="flex gap-2 py-0.5">
                          <span className="text-accent shrink-0 font-medium">{k}:</span>
                          <span className="text-t-muted break-all">{typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
