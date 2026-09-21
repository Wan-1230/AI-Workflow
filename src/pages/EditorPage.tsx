import { useEffect } from 'react'
import { WorkflowCanvas } from '../components/canvas/WorkflowCanvas'
import { NodePalette } from '../components/panels/NodePalette'
import { NodeConfig } from '../components/panels/NodeConfig'
import { ExecutionLog } from '../components/panels/ExecutionLog'
import { Toolbar } from '../components/panels/Toolbar'
import { useAppStore } from '../stores/app-store'
import { useWorkflowStore } from '../stores/workflow-store'
import { toast } from '../stores/toast-store'

/**
 * 编辑器页：三栏布局（节点面板 + 画布 + 配置面板）+ 底部运行面板
 * - 进入时校验已打开项目，否则回到首页
 * - 离开时自动保存工作流到项目库
 */
export function EditorPage() {
  const currentProject = useAppStore(s => s.currentProject)
  const setView = useAppStore(s => s.setView)

  // 未打开项目时回到首页
  useEffect(() => {
    if (!useAppStore.getState().currentProject) {
      setView('home')
      toast.info('请先打开一个项目', '编辑器需要加载项目工作流')
    }
  }, [setView])

  // 卸载时自动保存（防数据丢失）
  useEffect(() => {
    const current = useAppStore.getState().currentProject
    if (!current) return
    return () => {
      const nodes = useWorkflowStore.getState().nodes
      if (nodes.length > 0) {
        // fire-and-forget：窗口仍在，IPC 可完成
        void useWorkflowStore.getState().saveToProject()
      }
    }
  }, [])

  if (!currentProject) return null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 画布工具条 */}
      <Toolbar />

      {/* 三栏主体 */}
      <div className="flex-1 flex min-h-0">
        <NodePalette />
        <div className="flex-1 min-w-0">
          <WorkflowCanvas />
        </div>
        <NodeConfig />
      </div>

      {/* 底部运行面板 */}
      <ExecutionLog />
    </div>
  )
}
