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

  const sc: Record<string, { text: string; Icon: React.ElementType; cls: string }> = {
    idle:      { text: '就绪',     Icon: Circle,        cls: 'text-t-muted bg-t-muted/5' },
    running:   { text: '执行中',   Icon: Terminal,      cls: 'text-sig-amber bg-sig-amber/5' },
    completed: { text: '完成',     Icon: CheckCircle2,  cls: 'text-sig-green bg-sig-green/5' },
    error:     { text: '出错',     Icon: AlertCircle,   cls: 'text-sig-red bg-sig-red/5' },
    cancelled: { text: '已取消',   Icon: Ban,           cls: 'text-t-muted bg-t-muted/5' },
  }
  const s = sc[status] || sc.idle; const Si = s.Icon

  return (
    <div className="border-t border-border bg-panel flex flex-col" style={{ minHeight: 160, maxHeight: 340 }}>
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-t-muted" />
          <span className="text-[10px] font-semibold text-t-muted uppercase tracking-widest">日志</span>
          {logs.length > 0 && <span className="text-3xs text-t-muted bg-base rounded-full px-1.5 py-px font-mono">{logs.length}</span>}
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-sm ${s.cls}`}>
          <Si size={10} /><span>{s.text}</span>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-2">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-t-muted gap-1">
            <Terminal size={14} className="opacity-20" />
            <p className="text-[10px] font-mono">待执行</p>
          </div>
        ) : (
          <div className="space-y-0.5 pl-0.5 border-l border-border ml-1">
            {logs.map((log, i) => {
              const label = labels[log.nodeId] || log.nodeId
              const isErr = log.message.includes('❌')
              const isOk = log.message.includes('✅')
              const hasOut = log.output && Object.keys(log.output).length > 0
              const isOpen = expanded.has(i)
              return (
                <div key={i} className="animate-fade-up">
                  <div className={`flex items-start gap-2 text-[11px] py-0.5 ${hasOut ? 'cursor-pointer hover:bg-overlay/50 rounded-sm px-1 -mx-1' : ''}`}
                    onClick={() => hasOut && toggle(i)}>
                    <div className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${isErr ? 'bg-sig-red' : isOk ? 'bg-sig-green' : 'bg-accent'}`} />
                    <span className="text-t-faint shrink-0 font-mono mt-px">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`shrink-0 font-medium ${isErr ? 'text-sig-red' : isOk ? 'text-sig-green' : 'text-accent'}`}>[{label}]</span>
                    <span className={`break-all flex-1 ${isErr ? 'text-sig-red/70' : 'text-t-secondary'}`}>{log.message}</span>
                    {hasOut && <span className="text-t-faint shrink-0 mt-px">{isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}</span>}
                  </div>
                  {isOpen && log.output && (
                    <div className="ml-12 mb-1.5 p-2 bg-base rounded-md border border-border text-[10px] font-mono text-t-secondary">
                      {Object.entries(log.output).map(([k, v]) => (
                        <div key={k} className="flex gap-2 py-px">
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
