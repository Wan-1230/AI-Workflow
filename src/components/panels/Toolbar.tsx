import { useCallback, useState } from 'react'
import { FileText, FolderOpen, Save, Play, Pencil, Plus, HelpCircle, Lightbulb, Square, History } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { HelpTutorial } from './HelpTutorial'
import { ExecutionHistory } from './ExecutionHistory'

const statusMeta: Record<string, { label: string; dot: string }> = {
  idle:      { label: 'idle',    dot: 'bg-t-faint' },
  running:   { label: 'running', dot: 'bg-sig-amber animate-breathe' },
  completed: { label: 'done',    dot: 'bg-sig-green' },
  error:     { label: 'error',   dot: 'bg-sig-red' },
  cancelled: { label: 'cancel',  dot: 'bg-t-faint' },
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
    <div className="h-11 min-h-[44px] flex items-center justify-between px-4 border-b border-border bg-panel z-10 relative">
      {/* 左：品牌标识 + 名称 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-sm bg-accent flex items-center justify-center">
            <span className="text-[9px] font-bold text-white font-display tracking-tighter">W</span>
          </div>
          <span className="font-display text-[13px] font-bold text-t-primary tracking-tight">Workflow</span>
        </div>

        <div className="w-px h-4 bg-border" />

        {isEditing ? (
          <input type="text" value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={() => { setWorkflowName(editName); setIsEditing(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { setWorkflowName(editName); setIsEditing(false) }}}
            className="text-[12px] font-medium bg-card border border-accent/50 rounded px-2 py-0.5 text-t-primary focus:outline-none w-40"
            autoFocus />
        ) : (
          <button onClick={() => { setEditName(workflowName); setIsEditing(true) }}
            className="group flex items-center gap-1 text-[12px] font-medium text-t-secondary hover:text-t-primary transition-colors">
            <span>{workflowName}</span>
            <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity text-t-muted" />
          </button>
        )}

        {/* 状态指示器 */}
        {nodes.length > 0 && (
          <div className="flex items-center gap-2 ml-2 text-[10px] font-mono text-t-muted">
            <span>{nodes.length}n</span>
            <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
            <span>{sm.label}</span>
          </div>
        )}
      </div>

      {/* 右：操作 */}
      <div className="flex items-center gap-0.5">
        <TbBtn onClick={handleNew}><Plus size={13} /></TbBtn>
        <TbBtn onClick={handleOpen}><FolderOpen size={13} /></TbBtn>
        <TbBtn onClick={() => { if (!nodes.length || confirm('当前画布不为空，确定加载范例吗？')) loadExample() }}
          className="text-sig-amber"><Lightbulb size={13} /></TbBtn>
        <TbBtn onClick={handleSave}><Save size={13} /></TbBtn>
        <div className="w-px h-4 bg-border mx-1.5" />
        <TbBtn onClick={() => setShowHistory(true)}><History size={13} /></TbBtn>
        <TbBtn onClick={() => setShowHelp(true)}><HelpCircle size={13} /></TbBtn>
        <div className="w-px h-4 bg-border mx-1.5" />
        {isRunning ? (
          <button onClick={handleStop}
            className="press-feedback flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded bg-sig-red text-white transition-all ml-1">
            <Square size={11} /> 停止
          </button>
        ) : (
          <button onClick={handleRun} disabled={nodes.length === 0}
            className={`press-feedback flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded transition-all ml-1
              ${nodes.length === 0 ? 'bg-overlay text-t-faint cursor-not-allowed' : 'bg-accent text-white hover:bg-accent-muted'}`}>
            <Play size={11} /> 运行
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
      className={`press-feedback flex items-center justify-center w-7 h-7 text-t-muted hover:text-t-primary hover:bg-overlay rounded transition-colors ${className}`}>
      {children}
    </button>
  )
}
