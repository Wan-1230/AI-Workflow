import { useCallback, useEffect, useState } from 'react'
import { ScrollText, RefreshCw, CheckCircle2, XCircle, Ban, Clock, Layers, ChevronRight } from 'lucide-react'
import { Button, Modal, EmptyState, Spinner, Badge, Card } from '../components/ui'
import { toast } from '../stores/toast-store'
import type { ExecutionRecord } from '../lib/electron'
import type { NodeResult } from '@shared/workflow'

/** 解析记录中的节点结果 */
function parseResults(record: ExecutionRecord): Record<string, NodeResult> {
  try {
    const parsed = JSON.parse(record.resultsJson)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function LogsPage() {
  const [records, setRecords] = useState<ExecutionRecord[] | null>(null)
  const [stats, setStats] = useState<{ total: number; completed: number; error: number; avgDuration: number } | null>(null)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ExecutionRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setRecords(null)
    setError('')
    try {
      const [listRes, statsRes] = await Promise.all([
        window.api.getHistory({ limit: 50 }),
        window.api.getHistoryStats()
      ])
      if (listRes.success && listRes.data) setRecords(listRes.data)
      else { setError(listRes.error || '加载失败'); setRecords([]) }
      if (statsRes.success && statsRes.data) setStats(statsRes.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRecords([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  /** 打开详情（拉取完整执行数据） */
  const handleDetail = async (record: ExecutionRecord) => {
    setDetailLoading(true)
    setDetail(record)
    try {
      const res = await window.api.getExecutionDetail(record.id)
      if (res.success && res.data) {
        setDetail(res.data)
      } else {
        toast.error('加载详情失败', res.error)
        setDetail(null)
      }
    } catch (err) {
      toast.error('加载详情失败', err instanceof Error ? err.message : String(err))
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const statusMeta = {
    completed: { label: '成功', tone: 'success' as const, icon: <CheckCircle2 size={11} /> },
    error: { label: '失败', tone: 'danger' as const, icon: <XCircle size={11} /> },
    cancelled: { label: '已取消', tone: 'neutral' as const, icon: <Ban size={11} /> }
  }

  const statCards = [
    { label: '总执行次数', value: stats?.total ?? '-', icon: <ScrollText size={15} />, cls: 'text-accent bg-accent-soft' },
    { label: '成功', value: stats?.completed ?? '-', icon: <CheckCircle2 size={15} />, cls: 'text-success bg-success/12' },
    { label: '失败', value: stats?.error ?? '-', icon: <XCircle size={15} />, cls: 'text-danger bg-danger/12' },
    { label: '平均耗时', value: stats && stats.total > 0 ? `${(stats.avgDuration / 1000).toFixed(1)}s` : '-', icon: <Clock size={15} />, cls: 'text-info bg-info/12' }
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-semibold text-fg">运行日志</h1>
            <p className="text-xs text-fg-muted mt-0.5">历史执行记录与节点级结果，保存在本地数据库</p>
          </div>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} onClick={load}>刷新</Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {statCards.map(s => (
            <Card key={s.label} className="p-3.5 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.cls}`}>{s.icon}</div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-fg leading-tight tabular-nums">{s.value}</div>
                <div className="text-2xs text-fg-muted">{s.label}</div>
              </div>
            </Card>
          ))}
        </div>

        {/* 记录列表 */}
        {records === null ? (
          <div className="flex items-center justify-center py-24"><Spinner label="加载日志中..." /></div>
        ) : error ? (
          <EmptyState icon={<XCircle />} title="加载失败" description={error}
            action={<Button icon={<RefreshCw size={14} />} onClick={load}>重试</Button>} />
        ) : records.length === 0 ? (
          <EmptyState
            icon={<ScrollText />}
            title="暂无运行记录"
            description="在编辑器中运行工作流后，执行记录会出现在这里，可查看每个节点的输入输出。"
          />
        ) : (
          <div className="space-y-2">
            {records.map(r => {
              const sm = statusMeta[r.status] || statusMeta.cancelled
              return (
                <div key={r.id} className="bg-raised border border-line rounded-xl px-4 py-3 flex items-center gap-3 hover:border-line-strong transition-colors cursor-pointer"
                  onClick={() => handleDetail(r)}>
                  <Badge tone={sm.tone}>{sm.icon}{sm.label}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg truncate">{r.workflowName || '未命名工作流'}</div>
                    <div className="text-2xs text-fg-muted font-mono truncate mt-0.5">
                      {new Date(r.startedAt).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-2xs text-fg-muted shrink-0">
                    <span className="flex items-center gap-1"><Clock size={11} />{(r.duration / 1000).toFixed(2)}s</span>
                    <span className="flex items-center gap-1"><Layers size={11} />{r.nodeCount} 节点</span>
                  </div>
                  <ChevronRight size={14} className="text-fg-faint shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={`执行详情${detail ? ` · ${detail.workflowName}` : ''}`}
        width={640}
        footer={<Button variant="ghost" onClick={() => setDetail(null)}>关闭</Button>}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12"><Spinner label="加载详情..." /></div>
        ) : detail ? (
          <ExecutionDetailView record={detail} />
        ) : null}
      </Modal>
    </div>
  )
}

/** 执行详情：节点结果表 */
function ExecutionDetailView({ record }: { record: ExecutionRecord }) {
  const results = parseResults(record)
  const entries = Object.entries(results)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-2xs text-fg-muted flex-wrap">
        <span>开始 {new Date(record.startedAt).toLocaleString('zh-CN', { hour12: false })}</span>
        <span>·</span>
        <span>结束 {new Date(record.finishedAt).toLocaleString('zh-CN', { hour12: false })}</span>
        <span>·</span>
        <span>总耗时 {(record.duration / 1000).toFixed(2)}s</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-fg-muted text-center py-8">该记录没有节点级数据</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([nodeId, result]) => (
            <NodeResultCard key={nodeId} nodeId={nodeId} result={result} />
          ))}
        </div>
      )}
    </div>
  )
}

/** 单节点结果卡片 */
function NodeResultCard({ nodeId, result }: { nodeId: string; result: NodeResult }) {
  const [open, setOpen] = useState(false)
  const statusMeta = {
    success: { label: '成功', cls: 'text-sig-green' },
    error: { label: '失败', cls: 'text-sig-red' },
    cancelled: { label: '已取消', cls: 'text-fg-muted' },
    skipped: { label: '跳过', cls: 'text-fg-faint' }
  }[result.status]

  return (
    <div className="rounded-lg border border-line bg-app/60 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-overlay/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`text-2xs font-medium ${statusMeta.cls}`}>{statusMeta.label}</span>
        <span className="text-xs font-medium text-fg-secondary font-mono truncate">{nodeId}</span>
        {result.error && <span className="text-2xs text-sig-red truncate flex-1">{result.error}</span>}
        <span className="text-2xs text-fg-muted font-mono ml-auto shrink-0">{(result.duration / 1000).toFixed(2)}s</span>
        <ChevronRight size={12} className={`text-fg-faint shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2.5">
          {result.error && (
            <div className="mb-2 p-2 rounded bg-danger/8 border border-danger/20 text-2xs text-sig-red whitespace-pre-wrap leading-relaxed">
              {result.error}
            </div>
          )}
          <div className="space-y-1.5">
            {Object.entries(result.output || {}).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-2xs text-accent font-mono shrink-0 w-24 truncate">{k}</span>
                <span className="text-2xs text-fg-secondary font-mono break-all whitespace-pre-wrap">
                  {typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
