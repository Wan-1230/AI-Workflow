import { useCallback, useEffect, useState } from 'react'
import { FolderPlus, Copy, Pencil, Trash2, Play, Layers, Share2, Clock } from 'lucide-react'
import { Button, Modal, ConfirmDialog, Input, Textarea, EmptyState, Spinner, Badge } from '../components/ui'
import { useAppStore } from '../stores/app-store'
import { useShallow } from 'zustand/react/shallow'
import { useWorkflowStore } from '../stores/workflow-store'
import { toast } from '../stores/toast-store'
import type { ProjectSummary, WorkflowTemplate } from '@shared/project'

/** 相对时间格式化 */
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

export function HomePage() {
  const { projects, projectsLoaded, refreshProjects, openProject } = useAppStore(useShallow(s => ({
    projects: s.projects, projectsLoaded: s.projectsLoaded, refreshProjects: s.refreshProjects, openProject: s.openProject
  })))
  const loadWorkflow = useWorkflowStore(s => s.loadWorkflow)

  const [loading, setLoading] = useState(!projectsLoaded)
  const [templates, setTemplates] = useState<Pick<WorkflowTemplate, 'id' | 'name' | 'description' | 'icon' | 'category'>[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  // 重命名 / 删除
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // 加载项目列表 + 模板
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [tplRes] = await Promise.all([window.api.listTemplates()])
        if (!cancelled && tplRes.success && tplRes.data) setTemplates(tplRes.data)
      } catch { /* 忽略 */ }
      await refreshProjects()
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [refreshProjects])

  /** 打开项目：拉取完整工作流 → 载入画布 → 进入编辑器 */
  const handleOpen = useCallback(async (project: ProjectSummary) => {
    try {
      const res = await window.api.getProject(project.id)
      if (res.success && res.data) {
        loadWorkflow(res.data.workflow)
        openProject(res.data.summary)
        toast.success(`已打开「${project.name}」`)
      } else {
        toast.error('打开项目失败', res.error || '项目数据损坏')
      }
    } catch (err) {
      toast.error('打开项目失败', err instanceof Error ? err.message : String(err))
    }
  }, [loadWorkflow, openProject])

  /** 创建项目（基于模板） */
  const handleCreate = useCallback(async (templateId: string, name: string, description?: string) => {
    setCreateLoading(true)
    try {
      const res = await window.api.createProject({
        name: name.trim() || '未命名工作流',
        description: description?.trim(),
        templateId
      })
      if (res.success && res.data) {
        toast.success(`项目「${res.data.name}」创建成功`)
        setCreateOpen(false)
        await refreshProjects()
        await handleOpen(res.data)
      } else {
        toast.error('创建失败', res.error)
      }
    } catch (err) {
      toast.error('创建失败', err instanceof Error ? err.message : String(err))
    } finally {
      setCreateLoading(false)
    }
  }, [handleOpen, refreshProjects])

  /** 复制项目 */
  const handleDuplicate = useCallback(async (project: ProjectSummary) => {
    try {
      const res = await window.api.createProject({ name: `${project.name} 副本`, copyFromId: project.id })
      if (res.success && res.data) {
        toast.success(`已复制为「${res.data.name}」`)
        await refreshProjects()
      } else {
        toast.error('复制失败', res.error)
      }
    } catch (err) {
      toast.error('复制失败', err instanceof Error ? err.message : String(err))
    }
  }, [refreshProjects])

  /** 重命名 */
  const handleRename = useCallback(async () => {
    if (!renameTarget || !renameName.trim()) return
    setRenameLoading(true)
    try {
      const res = await window.api.updateProjectMeta(renameTarget.id, { name: renameName.trim() })
      if (res.success) {
        toast.success('已重命名')
        setRenameTarget(null)
        await refreshProjects()
      } else {
        toast.error('重命名失败', res.error)
      }
    } catch (err) {
      toast.error('重命名失败', err instanceof Error ? err.message : String(err))
    } finally {
      setRenameLoading(false)
    }
  }, [renameTarget, renameName, refreshProjects])

  /** 删除 */
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      const res = await window.api.deleteProject(deleteTarget.id)
      if (res.success) {
        toast.success(`已删除「${deleteTarget.name}」`)
        setDeleteTarget(null)
        await refreshProjects()
      } else {
        toast.error('删除失败', res.error)
      }
    } catch (err) {
      toast.error('删除失败', err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteLoading(false)
    }
  }, [deleteTarget, refreshProjects])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-fg">我的项目</h1>
            <p className="text-xs text-fg-muted mt-0.5">创建、管理与编排你的 AI 工作流</p>
          </div>
          <Button variant="primary" icon={<FolderPlus size={15} />} onClick={() => setCreateOpen(true)}>
            新建项目
          </Button>
        </div>

        {/* 项目网格 */}
        {loading ? (
          <div className="flex items-center justify-center py-24"><Spinner label="加载项目中..." /></div>
        ) : projects.length === 0 ? (
          <EmptyState
            title="暂无项目"
            description="点击右上角「新建项目」，开始编排你的第一个工作流。"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map(project => (
              <div
                key={project.id}
                onClick={() => handleOpen(project)}
                className="group bg-raised border border-line rounded-xl p-4 cursor-pointer transition-all duration-fast hover:border-line-strong hover:shadow-card-hover flex flex-col gap-3"
              >
                {/* 图标 + 状态 */}
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                    <Share2 size={18} />
                  </div>
                  {project.template && <Badge tone="accent">{project.template}</Badge>}
                </div>

                {/* 名称 + 描述 */}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-fg truncate group-hover:text-accent transition-colors">
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="text-xs text-fg-muted mt-1 line-clamp-2 leading-relaxed">{project.description}</p>
                  )}
                </div>

                {/* 统计 + 时间 */}
                <div className="flex items-center gap-3 text-2xs text-fg-muted">
                  <span className="flex items-center gap-1"><Layers size={11} />{project.nodeCount} 节点</span>
                  {project.edgeCount > 0 && <span>{project.edgeCount} 连接</span>}
                  <span className="flex items-center gap-1 ml-auto"><Clock size={11} />{formatRelative(project.updatedAt)}</span>
                </div>

                {/* 操作区（hover 显示） */}
                <div className="flex items-center gap-1 pt-2 border-t border-line/60 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => e.stopPropagation()}>
                  <Button size="xs" variant="ghost" icon={<Play size={11} />} onClick={() => handleOpen(project)}>打开</Button>
                  <Button size="xs" variant="ghost" icon={<Copy size={11} />} onClick={() => handleDuplicate(project)}>复制</Button>
                  <Button size="xs" variant="ghost" icon={<Pencil size={11} />}
                    onClick={() => { setRenameTarget(project); setRenameName(project.name) }}>重命名</Button>
                  <Button size="xs" variant="ghost" icon={<Trash2 size={11} />}
                    className="text-sig-red hover:text-sig-red hover:bg-danger/10"
                    onClick={() => setDeleteTarget(project)}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 底部提示 */}
        <p className="text-center text-2xs text-fg-faint mt-8">
          数据保存在本地 · 支持 JSON 导入导出
        </p>
      </div>

      {/* 新建项目弹窗 */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建项目"
        width={560}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
          </>
        }
      >
        <CreateProjectForm
          templates={templates}
          loading={createLoading}
          onCreate={handleCreate}
        />
      </Modal>

      {/* 重命名弹窗 */}
      <Modal
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title="重命名项目"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>取消</Button>
            <Button variant="primary" loading={renameLoading} disabled={!renameName.trim()}
              onClick={handleRename}>确定</Button>
          </>
        }
      >
        <Input label="项目名称" value={renameName} onChange={e => setRenameName(e.target.value)}
          placeholder="输入新名称..." autoFocus />
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除项目"
        message={
          <>
            确定要删除项目 <span className="font-semibold text-fg">「{deleteTarget?.name}」</span> 吗？
            其中的工作流与配置将一并移除，此操作不可恢复。
          </>
        }
        confirmText="删除"
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

/* =====================================================================
   新建项目表单：模板选择 + 名称/描述
   ===================================================================== */
function CreateProjectForm({
  templates,
  loading,
  onCreate,
}: {
  templates: Pick<WorkflowTemplate, 'id' | 'name' | 'description' | 'icon' | 'category'>[]
  loading: boolean
  onCreate: (templateId: string, name: string, description?: string) => void
}) {
  const [templateId, setTemplateId] = useState('blank')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const selected = templates.find(t => t.id === templateId)

  return (
    <div className="space-y-4">
      {/* 模板选择 */}
      <div>
        <label className="text-xs font-medium text-fg-secondary block mb-2">选择模板</label>
        <div className="grid grid-cols-2 gap-2">
          {templates.length === 0 && <div className="col-span-2 text-xs text-fg-muted">模板加载中...</div>}
          {templates.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              className={`text-left rounded-lg border p-3 transition-all duration-fast flex gap-2.5
                ${templateId === t.id
                  ? 'border-accent bg-accent-soft/50 ring-1 ring-accent/40'
                  : 'border-line bg-raised hover:border-line-strong'}`}
            >
              <span className="text-lg leading-none mt-0.5">{t.icon}</span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-fg truncate">{t.name}</span>
                <span className="block text-2xs text-fg-muted mt-0.5 line-clamp-2 leading-relaxed">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
        {selected?.category === 'example' && (
          <p className="text-2xs text-fg-muted mt-1.5">
            示例模板包含预置节点与连线，可直接运行体验。
          </p>
        )}
      </div>

      {/* 名称 + 描述 */}
      <Input label="项目名称" value={name} onChange={e => setName(e.target.value)}
        placeholder="如：客户评论分析" autoFocus />
      <Textarea label="项目描述（可选）" value={description} onChange={e => setDescription(e.target.value)}
        rows={2} placeholder="一句话说明这个工作流的用途" />

      <div className="flex justify-end">
        <Button
          variant="primary"
          loading={loading}
          disabled={!name.trim() || loading}
          onClick={() => onCreate(templateId, name || (selected?.name || '未命名工作流'), description)}
        >
          创建并打开
        </Button>
      </div>
    </div>
  )
}
