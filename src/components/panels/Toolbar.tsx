import { useCallback, useState } from 'react'
import { FileText, FolderOpen, Save, Play, Pencil, Plus, HelpCircle, Lightbulb, Square, History } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { HelpTutorial } from './HelpTutorial'
import { ExecutionHistory } from './ExecutionHistory'

const statusMeta: Record<string, { label: string; dot: string }> = {
  idle:      { label: '就绪',   dot: 'bg-t-faint' },
  running:   { label: '运行中', dot: 'bg-sig-amber animate-breathe' },
  completed: { label: '完成',   dot: 'bg-sig-green' },
  error:     { label: '出错',   dot: 'bg-sig-red' },
  cancelled: { label: '已取消', dot: 'bg-t-faint' },
}

export function Toolbar() {
  const { workflowName, setWorkflowName, execute, resetExecution, handleNew, handleOpen, handleSave, execution, loadExample, nodes } = useWorkflowStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(workflowName)
  const [showHelp, setShowHelp] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const handleRun = useCallback(() => { resetExecution(); execute() }, [execute, resetExecution])
  const handleStop = useCallback(async () => {
    try { await window.api.cancelExecution() } catch { /* ignore */ }
  }, [])
  const isRunning = execution.status === 'running'
  const sm = statusMeta[execution.status] || statusMeta.idle

  return (
    <div className="h-12 min-h-[48px] flex items-center justify-between px-5 border-b border-border glass-surface z-10 relative">
      {/* 左侧：品牌 + 名称 + 统计胶囊 */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #7c5cf0 0%, #5b5bd6 100%)' }}>
          <FileText size={14} className="text-white" />
        </div>
        {isEditing ? (
          <input type="text" value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={() => { setWorkflowName(editName); setIsEditing(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { setWorkflowName(editName); setIsEditing(false) }}}
            className="text-[13px] font-medium bg-card border border-accent/40 rounded-md px-2.5 py-1 text-t-primary focus:outline-none w-48"
            autoFocus />
        ) : (
          <button onClick={() => { setEditName(workflowName); setIsEditing(true) }}
            className="group flex items-center gap-1.5 text-[13px] font-semibold text-t-primary tracking-tight hover:text-accent transition-colors">
            <span>{workflowName}</span>
            <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity text-t-muted" />
          </button>
        )}

        {/* Mercor 式分段统计胶囊 */}
        {nodes.length > 0 && (
          <div className="hidden sm:flex items-center rounded-full border border-border bg-card overflow-hidden text-[11px]">
            <div className="flex items-center gap-1.5 px-3 py-1">
              <span className="text-t-muted">节点</span>
              <span className="font-semibold text-t-primary tabular-nums">{nodes.length}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5 px-3 py-1">
              <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
              <span className="font-medium text-t-secondary">{sm.label}</span>
            </div>
          </div>
        )}
      </div>

      {/* 右侧：操作 */}
      <div className="flex items-center gap-1">
        <TbBtn onClick={handleNew}><Plus size={14} /><span>新建</span></TbBtn>
        <TbBtn onClick={handleOpen}><FolderOpen size={14} /><span>打开</span></TbBtn>
        <TbBtn onClick={() => { if (!nodes.length || confirm('当前画布不为空，确定加载范例吗？')) loadExample() }}
          className="text-sig-amber hover:text-sig-amber hover:bg-sig-amber/10"><Lightbulb size={14} /><span>范例</span></TbBtn>
        <TbBtn onClick={handleSave}><Save size={14} /><span>保存</span></TbBtn>
        <div className="w-px h-5 bg-border mx-1.5" />
        <TbBtn onClick={() => setShowHistory(true)}><History size={14} /><span>历史</span></TbBtn>
        <TbBtn onClick={() => setShowHelp(true)}><HelpCircle size={14} /><span>帮助</span></TbBtn>
        {isRunning ? (
          <button onClick={handleStop}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ml-1.5
              bg-sig-red text-white hover:brightness-105 shadow-sm active:scale-[0.98]">
            <Square size={13} />
            <span>停止</span>
          </button>
        ) : (
          <button onClick={handleRun} disabled={nodes.length === 0}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ml-1.5
              ${nodes.length === 0 ? 'bg-overlay text-t-faint cursor-not-allowed' : 'bg-accent text-white hover:bg-accent-muted shadow-sm shadow-accent/20 active:scale-[0.98]'}`}>
            <Play size={13} />
            <span>运行</span>
          </button>
        )}
      </div>
      <HelpTutorial open={showHelp} onClose={() => setShowHelp(false)} />
      <ExecutionHistory open={showHistory} onClose={() => setShowHistory(false)} />
    </div>
  )
}

function TbBtn({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-t-secondary hover:text-t-primary hover:bg-overlay rounded-lg transition-colors ${className}`}>
      {children}
    </button>
  )
}
