import { useState, useEffect, useCallback } from 'react'
import { History, CheckCircle2, AlertCircle, Ban, Clock, RefreshCw, ChevronRight } from 'lucide-react'
import type { ExecutionRecord } from '../../lib/electron'

const statusConfig: Record<string, { icon: React.ElementType; cls: string; label: string }> = {
  completed: { icon: CheckCircle2, cls: 'text-sig-green', label: '成功' },
  error: { icon: AlertCircle, cls: 'text-sig-red', label: '失败' },
  cancelled: { icon: Ban, cls: 'text-t-muted', label: '取消' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[560px] max-h-[70vh] bg-panel border border-border rounded-2xl shadow-glass flex flex-col overflow-hidden animate-fade-up"
        onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <History size={14} className="text-accent" />
            <span className="text-[13px] font-semibold text-t-primary">执行历史</span>
            <span className="text-3xs text-t-muted bg-base rounded-full px-2 py-0.5 font-mono">{records.length}</span>
          </div>
          <button onClick={loadHistory} className="p-1.5 rounded-sm text-t-muted hover:text-t-primary hover:bg-overlay transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto p-3">
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-t-muted gap-2">
              <History size={20} className="opacity-20" />
              <p className="text-xs font-mono">暂无执行记录</p>
            </div>
          ) : (
            <div className="space-y-1">
              {records.map(r => {
                const sc = statusConfig[r.status] || statusConfig.completed
                const Icon = sc.icon
                return (
                  <button key={r.id}
                    onClick={() => setSelected(selected?.id === r.id ? null : r)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left
                      ${selected?.id === r.id ? 'border-accent/40 bg-accent/5 shadow-card' : 'border-border hover:border-accent/30 hover:bg-overlay/40'}`}>
                    <Icon size={14} className={sc.cls} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-t-primary truncate">{r.workflowName}</div>
                      <div className="text-[10px] text-t-muted font-mono mt-0.5">
                        {new Date(r.startedAt).toLocaleString()} · {r.nodeCount} 节点
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Clock size={10} className="text-t-faint" />
                      <span className="text-[10px] text-t-muted font-mono">{r.duration}ms</span>
                      <span className={`text-[10px] font-semibold ${sc.cls}`}>{sc.label}</span>
                    </div>
                    <ChevronRight size={12} className={`text-t-faint transition-transform ${selected?.id === r.id ? 'rotate-90' : ''}`} />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 详情展开 */}
        {selected && (
          <div className="border-t border-border p-3 max-h-[200px] overflow-y-auto shrink-0">
            <div className="text-[10px] font-semibold text-t-muted uppercase tracking-wider mb-2">执行详情</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="text-t-muted">ID:</span> <span className="text-t-secondary font-mono">{selected.id.slice(0, 16)}...</span></div>
              <div><span className="text-t-muted">耗时:</span> <span className="text-t-secondary font-mono">{selected.duration}ms</span></div>
              <div><span className="text-t-muted">开始:</span> <span className="text-t-secondary font-mono">{new Date(selected.startedAt).toLocaleTimeString()}</span></div>
              <div><span className="text-t-muted">结束:</span> <span className="text-t-secondary font-mono">{new Date(selected.finishedAt).toLocaleTimeString()}</span></div>
            </div>
            <div className="mt-2 p-2 bg-base rounded-md border border-border text-[10px] font-mono text-t-secondary max-h-[100px] overflow-y-auto">
              <pre className="whitespace-pre-wrap break-all">{formatResults(selected.resultsJson)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatResults(json: string): string {
  try {
    const obj = JSON.parse(json)
    return JSON.stringify(obj, null, 2)
  } catch {
    return json
  }
}
