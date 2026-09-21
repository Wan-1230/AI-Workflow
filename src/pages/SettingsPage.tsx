import { useCallback, useEffect, useState } from 'react'
import { Settings as SettingsIcon, Sun, Moon, Monitor, Globe, Bug, FolderOpen, Save, RotateCcw } from 'lucide-react'
import { Button, Select, Input, Switch, Spinner, Card } from '../components/ui'
import { toast } from '../stores/toast-store'
import { useThemeStore } from '../stores/theme-store'
import type { AppSettings } from '@shared/settings'

/**
 * 设置页：外观 / 通用 / 高级
 * 与主进程 settings.db 双向同步
 */
export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const themeStore = useThemeStore()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.getSettings()
      if (res.success && res.data) setSettings(res.data)
      else toast.error('加载设置失败', res.error)
    } catch (err) {
      toast.error('加载设置失败', err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const patch = (p: Partial<AppSettings>) => setSettings(prev => prev ? { ...prev, ...p } : prev)

  /** 保存设置（写入主进程；主题同时同步到前端 theme-store） */
  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await window.api.updateSettings(settings)
      if (res.success && res.data) {
        setSettings(res.data)
        // 主题与前端 store 联动
        if (settings.theme) themeStore.setMode(settings.theme)
        toast.success('设置已保存')
      } else {
        toast.error('保存失败', res.error)
      }
    } catch (err) {
      toast.error('保存失败', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading || !settings) {
    return <div className="flex-1 flex items-center justify-center"><Spinner label="加载设置..." /></div>
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-fg">设置</h1>
            <p className="text-xs text-fg-muted mt-0.5">应用外观与运行行为，本地持久化</p>
          </div>
          <Button variant="primary" icon={<Save size={14} />} loading={saving} onClick={save}>保存设置</Button>
        </div>

        <div className="space-y-4">
          {/* 外观 */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <SettingsIcon size={14} className="text-accent" />
              <h2 className="text-sm font-semibold text-fg">外观</h2>
            </div>
            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-medium text-fg-secondary mb-1.5 block">主题模式</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'system', label: '跟随系统', icon: <Monitor size={14} /> },
                    { value: 'light', label: '浅色', icon: <Sun size={14} /> },
                    { value: 'dark', label: '深色', icon: <Moon size={14} /> }
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => patch({ theme: opt.value })}
                      className={`flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-medium transition-all duration-fast ${
                        settings.theme === opt.value
                          ? 'border-accent bg-accent-soft text-accent ring-1 ring-accent/40'
                          : 'border-line bg-raised text-fg-secondary hover:border-line-strong hover:text-fg'
                      }`}
                    >
                      {opt.icon}{opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <Select
                label="界面语言"
                options={[{ value: 'zh-CN', label: '简体中文' }, { value: 'en-US', label: 'English' }]}
                value={settings.language}
                onChange={e => patch({ language: e.target.value as AppSettings['language'] })}
              />
            </div>
          </Card>

          {/* 通用 */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={14} className="text-accent" />
              <h2 className="text-sm font-semibold text-fg">通用</h2>
            </div>
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 text-xs text-fg-secondary">
                <FolderOpen size={13} className="text-fg-muted shrink-0" />
                <span className="text-fg-muted shrink-0">工作流存储目录</span>
                <span className="font-mono text-2xs truncate">{settings.storagePath}</span>
              </div>
              <Switch
                label="保存执行历史"
                hint="每次运行后记录到本地数据库（运行日志页可查看）"
                checked={settings.saveHistory}
                onChange={v => patch({ saveHistory: v })}
              />
            </div>
          </Card>

          {/* 高级 */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bug size={14} className="text-accent" />
              <h2 className="text-sm font-semibold text-fg">高级</h2>
            </div>
            <div className="space-y-3.5">
              <Input
                label="单节点默认超时 (ms)"
                type="number"
                min="1000"
                help="AI / RAG / Agent 类节点另有更高下限，不会被此值掐短"
                value={String(settings.defaultTimeout)}
                onChange={e => patch({ defaultTimeout: Number(e.target.value) || 120000 })}
              />
              <Switch
                label="调试模式"
                hint="输出更详细的运行日志，便于排查问题"
                checked={settings.debugMode}
                onChange={v => patch({ debugMode: v })}
              />
            </div>
          </Card>

          {/* 恢复默认 */}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />}
              onClick={() => { patch({ theme: 'system', language: 'zh-CN', debugMode: false, defaultTimeout: 120000, saveHistory: true }) }}>
              恢复默认值
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
