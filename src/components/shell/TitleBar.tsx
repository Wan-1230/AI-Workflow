import { useEffect, useRef, useState } from 'react'
import {
  Zap, Menu as MenuIcon, Minus, Square, Copy, X,
  FilePlus2, FolderOpen, Save, LogOut, Undo2, Redo2,
  RotateCw, Bug, ZoomIn, ZoomOut, Maximize, Moon, Sun, HelpCircle, Info,
} from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useThemeStore } from '../../stores/theme-store'
import { toast } from '../../stores/toast-store'

/* =====================================================================
   一体化标题栏（Codex 风格）：
   Logo+软件名 | 汉堡主菜单（文件/编辑/视图/帮助） | 窗口控制按钮
   背景与页面一致（bg-app），无独立白条；整条可拖拽移动窗口
   ===================================================================== */

interface MenuEntry {
  label: string
  icon: React.ReactNode
  shortcut?: string
  disabled?: boolean
  onClick: () => void
}

export function TitleBar() {
  const { view, currentProject, setView, setHelpOpen } = useAppStore()
  const { canUndo, canRedo, undo, redo, saveToProject } = useWorkflowStore()
  const { resolved, toggle } = useThemeStore()

  const [menuOpen, setMenuOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isEditor = view === 'editor'
  const canSave = isEditor && !!currentProject

  // 初始化窗口状态 + 监听最大化变化
  useEffect(() => {
    window.api.windowControls.isMaximized().then(setMaximized).catch(() => undefined)
    const unsub = window.api.windowControls.onMaximizedChange(setMaximized)
    return () => unsub()
  }, [])

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  // 全局快捷键（Ctrl+S / Ctrl+Z 等由画布处理，这里只保留全局导航类）
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setView('home')
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        setView('home')
      } else if (e.key === 'F1') {
        e.preventDefault()
        setHelpOpen(true)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [setView, setHelpOpen])

  const handleSave = () => {
    setMenuOpen(false)
    if (!canSave) {
      toast.info('当前没有可保存的项目', '请先在首页打开或新建项目')
      return
    }
    void saveToProject()
  }

  const menus: { title: string; entries: MenuEntry[] }[] = [
    {
      title: '文件',
      entries: [
        { label: '新建工作流', icon: <FilePlus2 size={14} />, shortcut: 'Ctrl+N', onClick: () => { setMenuOpen(false); setView('home') } },
        { label: '打开项目', icon: <FolderOpen size={14} />, shortcut: 'Ctrl+O', onClick: () => { setMenuOpen(false); setView('home') } },
        { label: '保存', icon: <Save size={14} />, shortcut: 'Ctrl+S', disabled: !canSave, onClick: handleSave },
        { label: '退出', icon: <LogOut size={14} />, onClick: () => { setMenuOpen(false); void window.api.windowControls.close() } },
      ]
    },
    {
      title: '编辑',
      entries: [
        { label: '撤销', icon: <Undo2 size={14} />, shortcut: 'Ctrl+Z', disabled: !isEditor || !canUndo, onClick: () => { setMenuOpen(false); undo() } },
        { label: '重做', icon: <Redo2 size={14} />, shortcut: 'Ctrl+Shift+Z', disabled: !isEditor || !canRedo, onClick: () => { setMenuOpen(false); redo() } },
      ]
    },
    {
      title: '视图',
      entries: [
        { label: '刷新', icon: <RotateCw size={14} />, onClick: () => { setMenuOpen(false); void window.api.appActions.reload() } },
        { label: '开发者工具', icon: <Bug size={14} />, onClick: () => { setMenuOpen(false); void window.api.appActions.toggleDevTools() } },
        { label: '放大', icon: <ZoomIn size={14} />, shortcut: 'Ctrl+=', onClick: () => { setMenuOpen(false); void window.api.appActions.zoomIn() } },
        { label: '缩小', icon: <ZoomOut size={14} />, shortcut: 'Ctrl+-', onClick: () => { setMenuOpen(false); void window.api.appActions.zoomOut() } },
        { label: '重置缩放', icon: <Maximize size={14} />, shortcut: 'Ctrl+0', onClick: () => { setMenuOpen(false); void window.api.appActions.resetZoom() } },
        { label: resolved === 'dark' ? '切换到浅色模式' : '切换到深色模式', icon: resolved === 'dark' ? <Sun size={14} /> : <Moon size={14} />, onClick: () => { setMenuOpen(false); toggle() } },
      ]
    },
    {
      title: '帮助',
      entries: [
        { label: '使用教程', icon: <HelpCircle size={14} />, shortcut: 'F1', onClick: () => { setMenuOpen(false); setHelpOpen(true) } },
        { label: '关于 AI Workflow', icon: <Info size={14} />, onClick: () => { setMenuOpen(false); toast.info('AI Workflow v1.0', '本地优先的 AI 工作流编排工具') } },
      ]
    },
  ]

  return (
    <div className="h-11 shrink-0 bg-app titlebar-drag flex items-center select-none relative">
      {/* 左侧：Logo + 软件名称 */}
      <div className="flex items-center gap-2.5 pl-4 min-w-0">
        <div className="w-6 h-6 rounded-md bg-accent/10 text-accent flex items-center justify-center shrink-0">
          <Zap size={13} />
        </div>
        <span className="text-[13px] font-semibold text-fg tracking-tight whitespace-nowrap">AI Workflow</span>
      </div>

      {/* 汉堡主菜单 */}
      <div ref={menuRef} className="titlebar-no-drag relative ml-1">
        <button
          type="button"
          aria-label="主菜单"
          title="主菜单"
          onClick={() => setMenuOpen(o => !o)}
          className={`flex items-center justify-center h-7 w-7 rounded-md transition-all duration-fast
            ${menuOpen ? 'bg-overlay text-fg' : 'text-fg-secondary hover:bg-overlay/70 hover:text-fg'}`}
        >
          <MenuIcon size={15} />
        </button>

        {menuOpen && (
          <div className="absolute left-0 top-8 z-50 w-60 bg-surface border border-line rounded-lg shadow-modal py-1.5 animate-scale-in overflow-hidden titlebar-no-drag">
            {/* 当前项目信息（编辑器内展示，不占标题栏空间） */}
            {isEditor && currentProject && (
              <div className="px-3 pb-1.5 mb-0.5 border-b border-line/70">
                <div className="text-2xs text-fg-muted">当前项目</div>
                <div className="text-xs text-fg truncate mt-0.5">{currentProject.name}</div>
              </div>
            )}
            {menus.map(group => (
              <div key={group.title} className="mb-0.5">
                <div className="px-3 pt-1.5 pb-0.5 text-2xs font-medium text-fg-muted uppercase tracking-wider">
                  {group.title}
                </div>
                {group.entries.map(entry => (
                  <button
                    key={entry.label}
                    type="button"
                    disabled={entry.disabled}
                    onClick={entry.onClick}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors duration-fast
                      ${entry.disabled
                        ? 'text-fg-faint cursor-not-allowed'
                        : 'text-fg-secondary hover:text-fg hover:bg-overlay'}`}
                  >
                    <span className="shrink-0">{entry.icon}</span>
                    <span className="flex-1 text-left whitespace-nowrap">{entry.label}</span>
                    {entry.shortcut && (
                      <span className="text-2xs text-fg-faint font-mono whitespace-nowrap">{entry.shortcut}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 中间留白（与页面融为一体） */}
      <div className="flex-1" />

      {/* 右侧：窗口控制按钮 */}
      <div className="titlebar-no-drag flex items-center h-full">
        <WinButton label="最小化" onClick={() => void window.api.windowControls.minimize()}>
          <Minus size={14} />
        </WinButton>
        <WinButton label={maximized ? '还原' : '最大化'} onClick={() => void window.api.windowControls.toggleMaximize()}>
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </WinButton>
        <WinButton label="关闭" danger onClick={() => void window.api.windowControls.close()}>
          <X size={14} />
        </WinButton>
      </div>
    </div>
  )
}

/** 窗口控制按钮（hover 细腻过渡，关闭按钮悬停红色） */
function WinButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex items-center justify-center w-11 h-full transition-colors duration-fast
        ${danger ? 'text-fg-secondary hover:bg-sig-red hover:text-white' : 'text-fg-secondary hover:bg-overlay hover:text-fg'}`}
    >
      {children}
    </button>
  )
}
