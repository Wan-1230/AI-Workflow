import { useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { WorkflowCanvas } from './components/canvas/WorkflowCanvas'
import { NodePalette } from './components/panels/NodePalette'
import { NodeConfig } from './components/panels/NodeConfig'
import { ExecutionLog } from './components/panels/ExecutionLog'
import { Toolbar } from './components/panels/Toolbar'

function App() {
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
