import { useCallback, useState } from 'react'
import { FileText, FolderOpen, Save, Play, Loader, Pencil, Plus, HelpCircle, Lightbulb } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { HelpTutorial } from './HelpTutorial'

export function Toolbar() {
  const { workflowName, setWorkflowName, execute, resetExecution, clearCanvas, toWorkflowJSON, fromWorkflowJSON, execution, loadExample, nodes } = useWorkflowStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(workflowName)
  const [showHelp, setShowHelp] = useState(false)

  const handleRun = useCallback(() => { resetExecution(); execute() }, [execute, resetExecution])

  const handleSave = useCallback(async () => {
    const json = toWorkflowJSON()
    const result = await window.api.dialogSave(`${workflowName}.json`, JSON.stringify(json, null, 2))
    if (result.success && result.path) setWorkflowName(result.path.split(/[\\/]/).pop()?.replace('.json', '') || workflowName)
  }, [workflowName, toWorkflowJSON, setWorkflowName])

  const handleLoad = useCallback(async () => {
    try { const r = await window.api.dialogOpen(); if (r.success && r.data) fromWorkflowJSON(r.data) } catch {}
  }, [fromWorkflowJSON])

  const handleNew = useCallback(() => { if (confirm('确定要清空画布吗？未保存的内容将丢失。')) clearCanvas() }, [clearCanvas])
  const isRunning = execution.status === 'running'

  return (
    <div className="h-11 min-h-[44px] flex items-center justify-between px-4 border-b border-border glass-surface z-10 relative">
      {/* 左侧 */}
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center">
          <FileText size={13} className="text-accent" />
        </div>
        {isEditing ? (
          <input type="text" value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={() => { setWorkflowName(editName); setIsEditing(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { setWorkflowName(editName); setIsEditing(false) }}}
            className="text-[13px] font-medium bg-card border border-accent/30 rounded-sm px-2.5 py-1 text-t-primary focus:outline-none w-48"
            autoFocus />
        ) : (
          <button onClick={() => { setEditName(workflowName); setIsEditing(true) }}
            className="group flex items-center gap-1.5 text-[13px] font-medium text-t-secondary hover:text-t-primary transition-colors">
            <span>{workflowName}</span>
            <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity text-t-muted" />
          </button>
        )}
      </div>

      {/* 右侧 */}
      <div className="flex items-center gap-1">
        <TbBtn onClick={handleNew}><Plus size={13} /><span>新建</span></TbBtn>
        <TbBtn onClick={handleLoad}><FolderOpen size={13} /><span>打开</span></TbBtn>
        <TbBtn onClick={() => { if (!nodes.length || confirm('当前画布不为空，确定加载范例吗？')) loadExample() }}
          className="text-sig-amber hover:text-sig-amber hover:bg-sig-amber/5"><Lightbulb size={13} /><span>范例</span></TbBtn>
        <TbBtn onClick={handleSave}><Save size={13} /><span>保存</span></TbBtn>
        <div className="w-px h-5 bg-border mx-2" />
        <TbBtn onClick={() => setShowHelp(true)}><HelpCircle size={13} /><span>帮助</span></TbBtn>
        <button onClick={handleRun} disabled={isRunning}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-sm transition-all ml-1
            ${isRunning ? 'bg-sig-amber/10 text-sig-amber cursor-wait animate-breathe' : 'bg-sig-green text-white hover:brightness-110 shadow-sm shadow-sig-green/10 scale-100 active:scale-[0.98]'}`}>
          {isRunning ? <Loader size={13} className="animate-spin" /> : <Play size={13} />}
          <span>{isRunning ? '运行中' : '运行'}</span>
        </button>
      </div>
      <HelpTutorial open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  )
}

function TbBtn({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-t-secondary hover:text-t-primary hover:bg-overlay rounded-sm transition-colors ${className}`}>
      {children}
    </button>
  )
}
