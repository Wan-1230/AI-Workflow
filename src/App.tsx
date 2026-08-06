import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { TopBar } from './components/shell/TopBar'
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

  // 监听原生菜单事件
  useEffect(() => {
    const unsub = window.api.onMenuEvent((action: string) => {
      const app = useAppStore.getState()
      if (action === 'new') {
        app.setView('home')
      } else if (action === 'open') {
        app.setView('home')
      } else if (action === 'save' && app.view === 'editor') {
        // 编辑器内保存由 EditorPage 处理（经 TopBar 按钮）
      } else if (action === 'help') {
        app.setView('home')
      }
    })
    return unsub
  }, [])

  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen flex flex-col bg-app text-fg overflow-hidden">
        <TopBar />
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
