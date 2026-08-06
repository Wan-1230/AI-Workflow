import { ArrowLeft, Save, Sun, Moon, Zap } from 'lucide-react'
import { IconButton } from '../ui/Button'
import { useAppStore } from '../../stores/app-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useThemeStore } from '../../stores/theme-store'
import { toast } from '../../stores/toast-store'

/** 各视图标题 */
const VIEW_TITLES: Record<string, string> = {
  home: '工作流项目',
  editor: '工作流编辑器',
  models: '模型配置',
  prompts: '提示词库',
  logs: '运行日志',
  settings: '设置'
}

/**
 * 应用顶栏：返回 + 标题 + 项目信息 + 保存/主题切换
 * 编辑器内额外显示运行状态
 */
export function TopBar() {
  const { view, setView, currentProject } = useAppStore()
  const { workflowName, execution, saveToProject } = useWorkflowStore()
  const { resolved, toggle } = useThemeStore()

  const isEditor = view === 'editor'
  const isRunning = execution.status === 'running'

  return (
    <div className="h-12 shrink-0 border-b border-line bg-app/80 backdrop-blur flex items-center gap-3 px-4 select-none">
      {/* Logo + 返回 */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-accent/12 text-accent flex items-center justify-center shrink-0">
          <Zap size={15} />
        </div>
        {isEditor && (
          <IconButton tooltip="返回首页" onClick={() => setView('home')}>
            <ArrowLeft size={15} />
          </IconButton>
        )}
        <span className="text-[13px] font-semibold text-fg truncate">
          {VIEW_TITLES[view] || 'AI Workflow'}
        </span>
      </div>

      {/* 编辑器：项目名 + 运行状态 */}
      {isEditor && (
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[12px] text-fg-secondary truncate">
            {currentProject?.name || workflowName}
          </span>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-[11px] text-sig-amber shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-sig-amber animate-pulse" />
              运行中
            </span>
          )}
          {execution.status === 'completed' && (
            <span className="text-[11px] text-sig-green shrink-0">✓ 已完成</span>
          )}
          {execution.status === 'error' && (
            <span className="text-[11px] text-sig-red shrink-0">✕ 失败</span>
          )}
          {execution.duration !== null && execution.status !== 'running' && execution.status !== 'idle' && (
            <span className="text-[11px] text-fg-muted font-mono shrink-0">
              {(execution.duration / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      )}

      {/* 右侧操作 */}
      <div className="flex items-center gap-1.5 ml-auto">
        {isEditor && (
          <button
            onClick={async () => {
              await saveToProject()
            }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-overlay transition-colors"
          >
            <Save size={14} />
            保存
          </button>
        )}
        <IconButton tooltip={resolved === 'dark' ? '切换浅色模式' : '切换深色模式'} onClick={toggle}>
          {resolved === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </IconButton>
        {!isEditor && (
          <button
            onClick={() => toast.info('AI Workflow', '本地优先的 AI 工作流编排工具')}
            className="text-[11px] text-fg-muted hover:text-fg-secondary transition-colors"
          >
            v1.0
          </button>
        )}
      </div>
    </div>
  )
}
