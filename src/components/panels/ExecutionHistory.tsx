import { useState, useEffect, useCallback } from 'react'
import { History, CheckCircle2, AlertCircle, Ban, Clock, RefreshCw, ChevronRight, X } from 'lucide-react'
import type { ExecutionRecord } from '../../lib/electron'

const statusConfig: Record<string, { icon: React.ElementType; cls: string; label: string; bg: string }> = {
  completed: { icon: CheckCircle2, cls: 'text-sig-green', label: 'Success', bg: 'bg-green-50' },
  error: { icon: AlertCircle, cls: 'text-sig-red', label: 'Failed', bg: 'bg-red-50' },
  cancelled: { icon: Ban, cls: 'text-t-muted', label: 'Cancelled', bg: 'bg-slate-50' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-[560px] max-h-[70vh] bg-card border border-border rounded-xl shadow-modal flex flex-col overflow-hidden animate-fade-up"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center">
              <History size={15} className="text-accent" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-t-primary">Execution History</h2>
              <p className="text-[11px] text-t-muted">{records.length} records</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={loadHistory} className="w-8 h-8 flex items-center justify-center rounded-lg text-t-muted hover:text-t-primary hover:bg-overlay transition-colors">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-t-muted hover:text-t-primary hover:bg-overlay transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-t-faint gap-2">
              <History size={24} className="opacity-30" />
              <p className="text-[13px] font-medium text-t-muted">No execution history</p>
              <p className="text-[11px]">Run a workflow to see past executions here</p>
            </div>
          ) : (
            <div className="space-y-1">
              {records.map(r => {
                const sc = statusConfig[r.status] || statusConfig.completed
                const Icon = sc.icon
                return (
                  <button key={r.id}
                    onClick={() => setSelected(selected?.id === r.id ? null : r)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg border transition-all text-left
                      ${selected?.id === r.id ? 'border-accent/40 bg-accent-light/40 shadow-card' : 'border-transparent hover:bg-overlay hover:border-border'}`}>
                    <div className={`w-8 h-8 rounded-lg ${sc.bg} flex items-center justify-center shrink-0`}>
                      <Icon size={14} className={sc.cls} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-t-primary truncate">{r.workflowName}</div>
                      <div className="text-[11px] text-t-muted mt-0.5">{new Date(r.startedAt).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1 text-[11px] text-t-muted">
                        <Clock size={11} />
                        <span className="font-mono">{r.duration}ms</span>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${sc.bg} ${sc.cls}`}>{sc.label}</span>
                      <ChevronRight size={14} className={`text-t-faint transition-transform ${selected?.id === r.id ? 'rotate-90' : ''}`} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="border-t border-border p-4 max-h-[200px] overflow-y-auto shrink-0 bg-base">
            <div className="text-[11px] font-semibold text-t-muted uppercase tracking-wider mb-2">Details</div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div><span className="text-t-muted">ID:</span> <span className="text-t-secondary font-mono text-[11px]">{selected.id.slice(0, 16)}...</span></div>
              <div><span className="text-t-muted">Duration:</span> <span className="text-t-secondary font-mono">{selected.duration}ms</span></div>
              <div><span className="text-t-muted">Started:</span> <span className="text-t-secondary">{new Date(selected.startedAt).toLocaleTimeString()}</span></div>
              <div><span className="text-t-muted">Finished:</span> <span className="text-t-secondary">{new Date(selected.finishedAt).toLocaleTimeString()}</span></div>
            </div>
            <div className="mt-3 p-3 bg-card rounded-lg border border-border text-[11px] font-mono text-t-secondary max-h-[100px] overflow-y-auto">
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
