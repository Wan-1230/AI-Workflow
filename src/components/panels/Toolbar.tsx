import { useCallback, useState } from 'react'
import { Undo2, Redo2, LayoutGrid, Download, Upload, Trash2, Play, Square, HelpCircle, Variable } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { IconButton, Button, ConfirmDialog } from '../ui'
import { toast } from '../../stores/toast-store'
import { HelpTutorial } from './HelpTutorial'
import { GlobalVariablesModal } from './GlobalVariables'
import type { WorkflowDefinition } from '@shared/workflow'

/**
 * 画布工具栏：撤销/重做、自动布局、导入导出、清空、变量、运行/停止
 */
export function Toolbar() {
  const {
    canUndo, canRedo, undo, redo,
    autoLayout, clearCanvas,
    execute, cancelExecution, resetExecution,
    execution, nodes,
    toWorkflowJSONString, loadWorkflow
  } = useWorkflowStore()

  const [showHelp, setShowHelp] = useState(false)
  const [showVars, setShowVars] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const isRunning = execution.status === 'running'

  const handleRun = useCallback(() => {
    resetExecution()
    execute()
  }, [resetExecution, execute])

  const handleStop = useCallback(() => {
    cancelExecution()
  }, [cancelExecution])

  /** 导出当前工作流为 JSON 文件 */
  const handleExport = useCallback(async () => {
    try {
      const res = await window.api.dialogSave('workflow.json', toWorkflowJSONString())
      if (res.success && res.path) toast.success(`已导出到 ${res.path}`)
    } catch (err) {
      toast.error('导出失败', err instanceof Error ? err.message : String(err))
    }
  }, [toWorkflowJSONString])

  /** 从 JSON 文件导入工作流（覆盖当前画布） */
  const handleImport = useCallback(async () => {
    try {
      const res = await window.api.dialogOpen()
      if (res.success && res.data) {
        const wf = res.data as WorkflowDefinition
        if (!Array.isArray(wf.nodes)) {
          toast.error('导入失败', '文件格式不正确：缺少 nodes 数组')
          return
        }
        loadWorkflow(wf)
        toast.success(`已导入「${wf.name || '未命名工作流'}」`)
      } else if (res.error) {
        toast.error('导入失败', res.error)
      }
    } catch (err) {
      toast.error('导入失败', err instanceof Error ? err.message : String(err))
    }
  }, [loadWorkflow])

  return (
    <div className="h-11 shrink-0 border-b border-line bg-surface flex items-center gap-1 px-3 select-none">
      {/* 编辑操作组 */}
      <div className="flex items-center gap-0.5">
        <IconButton tooltip="撤销 (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 size={14} />
        </IconButton>
        <IconButton tooltip="重做 (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <Redo2 size={14} />
        </IconButton>
      </div>

      <div className="w-px h-4 bg-line mx-1.5" />

      {/* 布局与文件 */}
      <div className="flex items-center gap-0.5">
        <IconButton tooltip="自动布局（按依赖层级排列）" disabled={nodes.length === 0} onClick={autoLayout}>
          <LayoutGrid size={14} />
        </IconButton>
        <IconButton tooltip="导入 JSON" onClick={handleImport}>
          <Upload size={14} />
        </IconButton>
        <IconButton tooltip="导出 JSON" disabled={nodes.length === 0} onClick={handleExport}>
          <Download size={14} />
        </IconButton>
        <IconButton tooltip="清空画布" disabled={nodes.length === 0} onClick={() => setConfirmClear(true)}>
          <Trash2 size={14} />
        </IconButton>
      </div>

      <div className="w-px h-4 bg-line mx-1.5" />

      {/* 变量与帮助 */}
      <div className="flex items-center gap-0.5">
        <IconButton tooltip="全局变量（{{global.KEY}} 引用）" onClick={() => setShowVars(true)}>
          <Variable size={14} />
        </IconButton>
        <IconButton tooltip="快捷键与帮助" onClick={() => setShowHelp(true)}>
          <HelpCircle size={14} />
        </IconButton>
      </div>

      {/* 运行区 */}
      <div className="ml-auto flex items-center gap-2">
        {isRunning ? (
          <Button variant="danger" size="sm" icon={<Square size={12} />} onClick={handleStop}>
            停止
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon={<Play size={12} />}
            disabled={nodes.length === 0}
            onClick={handleRun}
          >
            运行
          </Button>
        )}
      </div>

      {/* 弹窗 */}
      <HelpTutorial open={showHelp} onClose={() => setShowHelp(false)} />
      <GlobalVariablesModal open={showVars} onClose={() => setShowVars(false)} />
      <ConfirmDialog
        open={confirmClear}
        title="清空画布"
        message="将移除所有节点与连线，此操作不可撤销。建议先导出 JSON 备份。"
        confirmText="清空"
        variant="danger"
        onConfirm={() => { clearCanvas(); setConfirmClear(false); toast.info('画布已清空') }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}
