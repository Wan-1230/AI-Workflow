import { useCallback, useState } from 'react'
import { FolderOpen, Save, Play, Pencil, Plus, HelpCircle, Lightbulb, Square, History, Zap } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { HelpTutorial } from './HelpTutorial'
import { ExecutionHistory } from './ExecutionHistory'

const statusMeta: Record<string, { label: string; dot: string; text: string }> = {
  idle:      { label: 'Ready',     dot: 'bg-slate-300',          text: 'text-t-muted' },
  running:   { label: 'Running',   dot: 'bg-sig-amber animate-breathe', text: 'text-sig-amber' },
  completed: { label: 'Completed', dot: 'bg-sig-green',          text: 'text-sig-green' },
  error:     { label: 'Error',     dot: 'bg-sig-red',            text: 'text-sig-red' },
  cancelled: { label: 'Cancelled', dot: 'bg-slate-300',          text: 'text-t-muted' },
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
    <div className="h-12 min-h-[48px] flex items-center justify-between px-4 border-b border-border bg-panel z-10 relative">
      {/* Left: Brand + Name + Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shadow-sm">
            <Zap size={14} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display text-[14px] font-semibold text-t-primary tracking-tight">Workflow</span>
        </div>

        <div className="w-px h-5 bg-border" />

        {isEditing ? (
          <input type="text" value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={() => { setWorkflowName(editName); setIsEditing(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { setWorkflowName(editName); setIsEditing(false) }}}
            className="text-[13px] font-medium bg-card border border-accent rounded-md px-2.5 py-1 text-t-primary focus:outline-none w-44"
            autoFocus />
        ) : (
          <button onClick={() => { setEditName(workflowName); setIsEditing(true) }}
            className="group flex items-center gap-1.5 text-[13px] font-medium text-t-secondary hover:text-t-primary transition-colors">
            <span>{workflowName}</span>
            <Pencil size={11} className="opacity-0 group-hover:opacity-50 transition-opacity text-t-muted" />
          </button>
        )}

        {/* Status pill */}
        {nodes.length > 0 && (
          <div className="flex items-center gap-2 ml-1 px-2.5 py-1 rounded-full bg-overlay border border-border">
            <span className={`w-2 h-2 rounded-full ${sm.dot}`} />
            <span className={`text-[11px] font-medium ${sm.text}`}>{sm.label}</span>
            <span className="text-[11px] text-t-muted font-mono">{nodes.length} nodes</span>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <TbBtn onClick={handleNew} label="New"><Plus size={14} /></TbBtn>
        <TbBtn onClick={handleOpen} label="Open"><FolderOpen size={14} /></TbBtn>
        <TbBtn onClick={handleSave} label="Save"><Save size={14} /></TbBtn>
        <TbBtn onClick={() => { if (!nodes.length || confirm('当前画布不为空，确定加载范例吗？')) loadExample() }}
          label="Example" className="text-sig-amber hover:text-sig-amber"><Lightbulb size={14} /></TbBtn>

        <div className="w-px h-5 bg-border mx-2" />

        <TbBtn onClick={() => setShowHistory(true)} label="History"><History size={14} /></TbBtn>
        <TbBtn onClick={() => setShowHelp(true)} label="Help"><HelpCircle size={14} /></TbBtn>

        <div className="w-px h-5 bg-border mx-2" />

        {isRunning ? (
          <button onClick={handleStop}
            className="press-feedback flex items-center gap-2 px-4 py-2 text-[12px] font-semibold rounded-lg bg-sig-red text-white hover:bg-red-600 transition-all shadow-sm">
            <Square size={12} /> Stop
          </button>
        ) : (
          <button onClick={handleRun} disabled={nodes.length === 0}
            className={`press-feedback flex items-center gap-2 px-4 py-2 text-[12px] font-semibold rounded-lg transition-all shadow-sm
              ${nodes.length === 0 ? 'bg-overlay text-t-faint cursor-not-allowed shadow-none border border-border' : 'bg-accent text-white hover:bg-accent-muted'}`}>
            <Play size={12} /> Run
          </button>
        )}
      </div>

      <HelpTutorial open={showHelp} onClose={() => setShowHelp(false)} />
      <ExecutionHistory open={showHistory} onClose={() => setShowHistory(false)} />
    </div>
  )
}

function TbBtn({ children, className = '', onClick, label }: { children: React.ReactNode; className?: string; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} title={label}
      className={`press-feedback flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-t-secondary hover:text-t-primary hover:bg-overlay rounded-lg transition-colors ${className}`}>
      {children}
      <span className="hidden xl:inline">{label}</span>
    </button>
  )
}
