import { Home, Workflow, Cpu, FileText, ScrollText, Settings } from 'lucide-react'
import { Tabs, type TabItem } from '../ui/Tabs'
import { useAppStore, type AppView } from '../../stores/app-store'
import { useShallow } from 'zustand/react/shallow'
import { toast } from '../../stores/toast-store'

/**
 * 底部 Tab 药丸导航：对比色高亮 + 滑块动效
 * 编辑器 Tab 需先打开项目
 */
export function BottomNav() {
  const { view, setView, currentProject } = useAppStore(useShallow(s => ({ view: s.view, setView: s.setView, currentProject: s.currentProject })))

  const items: TabItem<AppView>[] = [
    { value: 'home', label: '首页', icon: <Home size={16} /> },
    {
      value: 'editor',
      label: '编辑器',
      icon: <Workflow size={16} />,
      disabled: !currentProject
    },
    { value: 'models', label: '模型', icon: <Cpu size={16} /> },
    { value: 'prompts', label: '提示词', icon: <FileText size={16} /> },
    { value: 'logs', label: '日志', icon: <ScrollText size={16} /> },
    { value: 'settings', label: '设置', icon: <Settings size={16} /> }
  ]

  const handleChange = (value: AppView) => {
    if (value === 'editor' && !currentProject) {
      toast.info('请先在首页打开或新建一个项目', '编辑器需要加载项目工作流')
      return
    }
    setView(value)
  }

  return (
    <div className="h-12 shrink-0 bg-app flex items-center justify-center px-4 select-none">
      <Tabs<AppView>
        items={items}
        value={view === 'editor' ? 'editor' : view}
        onChange={handleChange}
        variant="pill"
        duration={260}
      />
    </div>
  )
}
