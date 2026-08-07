import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { TitleBar } from './components/shell/TitleBar'
import { BottomNav } from './components/shell/BottomNav'
import { ToastViewport } from './components/ui/Toast'
import { useAppStore } from './stores/app-store'
import { useThemeStore } from './stores/theme-store'
import { HomePage } from './pages/HomePage'
import { EditorPage } from './pages/EditorPage'
import { ModelsPage } from './pages/ModelsPage'
import { PromptsPage } from './pages/PromptsPage'
import { LogsPage } from './pages/LogsPage'
import { SettingsPage } from './pages/SettingsPage'

function App() {
  const view = useAppStore(s => s.view)

  // 主题初始化（防闪烁脚本已在内联处理，这里同步 store 状态）
  useEffect(() => {
    useThemeStore.getState().init()
  }, [])

  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen flex flex-col bg-app text-fg overflow-hidden">
        <TitleBar />
        <main className="flex-1 flex flex-col overflow-hidden">
          {view === 'home' && <HomePage />}
          {view === 'editor' && <EditorPage />}
          {view === 'models' && <ModelsPage />}
          {view === 'prompts' && <PromptsPage />}
          {view === 'logs' && <LogsPage />}
          {view === 'settings' && <SettingsPage />}
        </main>
        <BottomNav />
        <ToastViewport />
      </div>
    </ReactFlowProvider>
  )
}

export default App
