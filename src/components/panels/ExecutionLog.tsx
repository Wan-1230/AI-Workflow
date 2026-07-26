import { useMemo, useEffect, useRef, useState } from 'react'
import { Terminal, CheckCircle2, AlertCircle, Circle, ChevronRight, ChevronDown, Ban } from 'lucide-react'
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

  const sc: Record<string, { text: string; cls: string }> = {
    idle:      { text: 'idle',    cls: 'text-t-muted' },
    running:   { text: 'run',     cls: 'text-sig-amber' },
    completed: { text: 'done',    cls: 'text-sig-green' },
    error:     { text: 'err',     cls: 'text-sig-red' },
    cancelled: { text: 'cancel',  cls: 'text-t-muted' },
  }
  const s = sc[status] || sc.idle

  return (
    <div className="border-t border-border bg-panel flex flex-col" style={{ minHeight: 140, maxHeight: 280 }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={10} className="text-t-muted" />
          <span className="text-[9px] font-bold text-t-muted uppercase tracking-widest font-mono">log</span>
          {logs.length > 0 && <span className="text-[9px] text-t-faint font-mono">{logs.length}</span>}
        </div>
        <span className={`text-[9px] font-bold font-mono uppercase tracking-wider ${s.cls}`}>{s.text}</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-1.5">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-t-faint">
            <p className="text-[10px] font-mono">awaiting execution</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log, i) => {
              const label = labels[log.nodeId] || log.nodeId
              const isErr = log.message.includes('\u274c')
              const isOk = log.message.includes('\u2705')
              const hasOut = log.output && Object.keys(log.output).length > 0
              const isOpen = expanded.has(i)
              return (
                <div key={i}>
                  <div className={`flex items-start gap-1.5 text-[10px] py-0.5 font-mono ${hasOut ? 'cursor-pointer hover:bg-overlay/50 rounded px-1 -mx-1' : ''}`}
                    onClick={() => hasOut && toggle(i)}>
                    <span className="text-t-faint shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`shrink-0 font-bold ${isErr ? 'text-sig-red' : isOk ? 'text-sig-green' : 'text-accent'}`}>[{label}]</span>
                    <span className={`break-all flex-1 ${isErr ? 'text-sig-red/80' : 'text-t-secondary'}`}>{log.message}</span>
                    {hasOut && <span className="text-t-faint shrink-0">{isOpen ? <ChevronDown size={9} /> : <ChevronRight size={9} />}</span>}
                  </div>
                  {isOpen && log.output && (
                    <div className="ml-14 mb-1 p-1.5 bg-base rounded border border-border text-[9px] font-mono text-t-secondary">
                      {Object.entries(log.output).map(([k, v]) => (
                        <div key={k} className="flex gap-1.5 py-px">
                          <span className="text-accent shrink-0">{k}:</span>
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
