import { useCallback, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { WorkflowCanvas } from './components/canvas/WorkflowCanvas'
import { NodePalette } from './components/panels/NodePalette'
import { NodeConfig } from './components/panels/NodeConfig'
import { ExecutionLog } from './components/panels/ExecutionLog'
import { Toolbar } from './components/panels/Toolbar'
import { useWorkflowStore } from './stores/workflow-store'

function App() {
  // 监听原生菜单事件
  useEffect(() => {
    const unsub = window.api.onMenuEvent((action: string) => {
      const s = useWorkflowStore.getState()
      switch (action) {
        case 'new':  s.handleNew();  break
        case 'open': s.handleOpen(); break
        case 'save': s.handleSave(); break
        case 'help': s.toggleHelp(); break
      }
    })
    return unsub
  }, [])
  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen flex flex-col">
        {/* 顶部工具栏 */}
        <Toolbar />

        {/* 主体区域 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧节点面板 */}
          <NodePalette />

          {/* 中央画布 */}
          <div className="flex-1 flex flex-col">
            <WorkflowCanvas />
            <ExecutionLog />
          </div>

          {/* 右侧配置面板 */}
          <NodeConfig />
        </div>
      </div>
    </ReactFlowProvider>
  )
}

export default App
