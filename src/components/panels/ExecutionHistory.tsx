import { useState, useEffect, useCallback } from 'react'
import { History, CheckCircle2, AlertCircle, Ban, Clock, RefreshCw, ChevronRight } from 'lucide-react'
import type { ExecutionRecord } from '../../lib/electron'

const statusConfig: Record<string, { icon: React.ElementType; cls: string; label: string }> = {
  completed: { icon: CheckCircle2, cls: 'text-sig-green', label: 'ok' },
  error: { icon: AlertCircle, cls: 'text-sig-red', label: 'err' },
  cancelled: { icon: Ban, cls: 'text-t-muted', label: 'cancel' },
}

export function ExecutionHistory({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [records, setRecords] = useState<ExecutionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<ExecutionRecord | null>(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.api.getHistory({ limit: 30 })
      if (r.success && r.data) setRecords(r.data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { if (open) loadHistory() }, [open, loadHistory])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="w-[520px] max-h-[65vh] bg-card border border-border rounded shadow-card-hover flex flex-col overflow-hidden animate-fade-up"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <History size={12} className="text-accent" />
            <span className="font-display text-[11px] font-bold text-t-primary">History</span>
            <span className="text-[9px] text-t-faint font-mono">{records.length}</span>
          </div>
          <button onClick={loadHistory} className="w-6 h-6 flex items-center justify-center rounded text-t-muted hover:text-t-primary hover:bg-overlay transition-colors">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-t-faint gap-1">
              <History size={14} className="opacity-30" />
              <p className="text-[10px] font-mono">no records</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {records.map(r => {
                const sc = statusConfig[r.status] || statusConfig.completed
                const Icon = sc.icon
                return (
                  <button key={r.id}
                    onClick={() => setSelected(selected?.id === r.id ? null : r)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded border transition-all text-left
                      ${selected?.id === r.id ? 'border-accent/40 bg-accent-light/30' : 'border-transparent hover:bg-overlay'}`}>
                    <Icon size={12} className={sc.cls} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-t-primary truncate">{r.workflowName}</div>
                      <div className="text-[9px] text-t-muted font-mono">{new Date(r.startedAt).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-[9px] font-mono text-t-muted">
                      <Clock size={9} />
                      <span>{r.duration}ms</span>
                      <span className={`font-bold ${sc.cls}`}>{sc.label}</span>
                    </div>
                    <ChevronRight size={10} className={`text-t-faint transition-transform ${selected?.id === r.id ? 'rotate-90' : ''}`} />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {selected && (
          <div className="border-t border-border p-2 max-h-[160px] overflow-y-auto shrink-0">
            <div className="text-[9px] font-bold text-t-muted uppercase tracking-wider mb-1.5 font-mono">detail</div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
              <div><span className="text-t-muted">id:</span> <span className="text-t-secondary">{selected.id.slice(0, 12)}...</span></div>
              <div><span className="text-t-muted">dur:</span> <span className="text-t-secondary">{selected.duration}ms</span></div>
              <div><span className="text-t-muted">start:</span> <span className="text-t-secondary">{new Date(selected.startedAt).toLocaleTimeString()}</span></div>
              <div><span className="text-t-muted">end:</span> <span className="text-t-secondary">{new Date(selected.finishedAt).toLocaleTimeString()}</span></div>
            </div>
            <div className="mt-1.5 p-1.5 bg-base rounded border border-border text-[9px] font-mono text-t-secondary max-h-[80px] overflow-y-auto">
              <pre className="whitespace-pre-wrap break-all">{formatResults(selected.resultsJson)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatResults(json: string): string {
  try { return JSON.stringify(JSON.parse(json), null, 2) } catch { return json }
}
