import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Plus, Star, Trash2, Pencil, Search, Wand2, Copy, RefreshCw, XCircle } from 'lucide-react'
import { Button, Modal, ConfirmDialog, Input, Textarea, EmptyState, Spinner, Badge } from '../components/ui'
import { toast } from '../stores/toast-store'
import type { PromptTemplate } from '@shared/prompt'

/** 从模板内容解析 {{varName}} 占位符 */
function parseVars(content: string): string[] {
  const matches = content.match(/\{\{\s*([\w.]+)\s*\}\}/g) || []
  return [...new Set(matches.map(m => m.replace(/[{}]/g, '').trim()))]
}

export function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptTemplate[] | null>(null)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [favoriteOnly, setFavoriteOnly] = useState(false)

  // 编辑弹窗
  const [editing, setEditing] = useState<PromptTemplate | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  // 渲染预览
  const [preview, setPreview] = useState<PromptTemplate | null>(null)

  const [deleting, setDeleting] = useState<PromptTemplate | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const load = useCallback(async () => {
    setPrompts(null)
    setError('')
    try {
      const [listRes, catRes] = await Promise.all([
        window.api.listPrompts(),
        window.api.listPromptCategories()
      ])
      if (listRes.success && listRes.data) setPrompts(listRes.data)
      else { setError(listRes.error || '加载失败'); setPrompts([]) }
      if (catRes.success && catRes.data) setCategories(catRes.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPrompts([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  /** 收藏切换 */
  const handleToggleFavorite = async (p: PromptTemplate) => {
    try {
      const res = await window.api.togglePromptFavorite(p.id)
      if (res.success) {
        setPrompts(prev => prev?.map(x => x.id === p.id ? { ...x, favorite: !x.favorite } : x) || prev)
        toast.success(p.favorite ? '已取消收藏' : '已收藏')
      } else toast.error('操作失败', res.error)
    } catch (err) {
      toast.error('操作失败', err instanceof Error ? err.message : String(err))
    }
  }

  /** 删除 */
  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      const res = await window.api.deletePrompt(deleting.id)
      if (res.success) {
        toast.success('已删除')
        setDeleting(null)
        await load()
      } else toast.error('删除失败', res.error)
    } catch (err) {
      toast.error('删除失败', err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteLoading(false)
    }
  }

  // 过滤
  const filtered = useMemo(() => {
    if (!prompts) return []
    return prompts.filter(p => {
      if (favoriteOnly && !p.favorite) return false
      if (category && p.category !== category) return false
      if (keyword) {
        const q = keyword.toLowerCase()
        return p.name.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
      }
      return true
    })
  }, [prompts, favoriteOnly, category, keyword])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-semibold text-fg">提示词库</h1>
            <p className="text-xs text-fg-muted mt-0.5">复用与管理提示词模板，支持 {'{{"varName"}}'} 占位符渲染</p>
          </div>
          <Button variant="primary" icon={<Plus size={15} />}
            onClick={() => { setEditing(null); setFormOpen(true) }}>
            新建模板
          </Button>
        </div>

        {/* 筛选栏 */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <Input value={keyword} onChange={e => setKeyword(e.target.value)}
              placeholder="搜索名称或内容..." className="pl-8" />
          </div>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-line bg-raised text-xs text-fg-secondary focus:border-accent focus:outline-none"
          >
            <option value="">全部分类</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button
            size="sm"
            variant={favoriteOnly ? 'outline' : 'ghost'}
            icon={<Star size={13} className={favoriteOnly ? 'text-warning' : ''} />}
            onClick={() => setFavoriteOnly(f => !f)}
          >
            仅看收藏
          </Button>
          <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={load}>刷新</Button>
        </div>

        {/* 列表 */}
        {prompts === null ? (
          <div className="flex items-center justify-center py-24"><Spinner label="加载模板中..." /></div>
        ) : error ? (
          <EmptyState icon={<XCircle />} title="加载失败" description={error}
            action={<Button icon={<RefreshCw size={14} />} onClick={load}>重试</Button>} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={prompts.length === 0 ? '还没有提示词模板' : '没有匹配的模板'}
            description={prompts.length === 0
              ? '创建提示词模板，在「提示词模板」节点中按名称引用复用。'
              : '尝试调整搜索关键词或筛选条件。'}
            action={prompts.length === 0
              ? <Button variant="primary" icon={<Plus size={15} />} onClick={() => { setEditing(null); setFormOpen(true) }}>新建模板</Button>
              : undefined}
          />
        ) : (
          <div className="space-y-2.5">
            {filtered.map(p => (
              <div key={p.id} className="bg-raised border border-line rounded-xl p-4 hover:border-line-strong transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
                    <FileText size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-fg">{p.name}</h3>
                      <Badge tone="neutral">{p.category || '未分类'}</Badge>
                      {p.favorite && <Badge tone="warning"><Star size={9} />收藏</Badge>}
                      <span className="text-2xs text-fg-muted ml-auto shrink-0">使用 {p.usageCount} 次</span>
                    </div>
                    {p.description && <p className="text-xs text-fg-muted mt-1">{p.description}</p>}
                    <p className="text-xs text-fg-secondary font-mono mt-2 whitespace-pre-wrap line-clamp-3 leading-relaxed bg-app/60 rounded-lg p-2.5 border border-line/50">
                      {p.content}
                    </p>
                    {p.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.variables.map(v => (
                          <span key={v} className="px-1.5 py-0.5 rounded bg-overlay text-2xs font-mono text-accent">
                            {'{{'}{v}{'}}'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button size="xs" variant="ghost" icon={<Wand2 size={11} />} onClick={() => setPreview(p)}>渲染</Button>
                    <Button size="xs" variant="ghost" icon={<Copy size={11} />}
                      onClick={() => { navigator.clipboard.writeText(p.content); toast.success('已复制到剪贴板') }}>复制</Button>
                    <Button size="xs" variant="ghost" icon={<Star size={11} className={p.favorite ? 'text-warning' : ''} />}
                      onClick={() => handleToggleFavorite(p)}>{p.favorite ? '取消收藏' : '收藏'}</Button>
                    <Button size="xs" variant="ghost" icon={<Pencil size={11} />}
                      onClick={() => { setEditing(p); setFormOpen(true) }}>编辑</Button>
                    <Button size="xs" variant="ghost" icon={<Trash2 size={11} />}
                      className="text-sig-red hover:text-sig-red hover:bg-danger/10"
                      onClick={() => setDeleting(p)}>删除</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      <PromptFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={async () => { setFormOpen(false); await load() }}
      />

      {/* 渲染预览 */}
      <PromptPreviewModal prompt={preview} onClose={() => setPreview(null)} />

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleting !== null}
        title="删除模板"
        message={<>确定删除模板 <span className="font-semibold text-fg">「{deleting?.name}」</span> 吗？</>}
        confirmText="删除"
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

/* =====================================================================
   提示词表单弹窗（新建 / 编辑）
   ===================================================================== */
function PromptFormModal({ open, editing, onClose, onSaved }: {
  open: boolean
  editing: PromptTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const [initialized, setInitialized] = useState(false)
  if (open && !initialized) {
    setName(editing?.name || '')
    setCategory(editing?.category || '通用')
    setDescription(editing?.description || '')
    setContent(editing?.content || '')
    setInitialized(true)
  }
  if (!open && initialized) setInitialized(false)

  const vars = useMemo(() => parseVars(content), [content])

  const handleSubmit = async () => {
    if (!name.trim()) { toast.warning('请填写模板名称'); return }
    if (!content.trim()) { toast.warning('请填写模板内容'); return }
    setSaving(true)
    try {
      const res = await window.api.upsertPrompt({
        id: editing?.id,
        name: name.trim(),
        category: category.trim() || '通用',
        description: description.trim() || undefined,
        content,
        favorite: editing?.favorite
      })
      if (res.success) {
        toast.success(editing ? '模板已更新' : '模板已创建')
        onSaved()
      } else {
        toast.error('保存失败', res.error)
      }
    } catch (err) {
      toast.error('保存失败', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '编辑模板' : '新建模板'}
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={handleSubmit}>保存</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          <Input label="模板名称" value={name} onChange={e => setName(e.target.value)} placeholder="如：周报总结助手" autoFocus />
          <Input label="分类" value={category} onChange={e => setCategory(e.target.value)} placeholder="如：写作 / 分析" />
        </div>
        <Input label="描述（可选）" value={description} onChange={e => setDescription(e.target.value)}
          placeholder="一句话说明模板用途" />
        <Textarea label="模板内容" value={content} onChange={e => setContent(e.target.value)}
          rows={10} minRows={6}
          placeholder={'请帮我总结以下内容：\n{{input}}'}
          className="font-mono text-xs"
        />
        {vars.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap text-2xs text-fg-muted">
            <span>变量：</span>
            {vars.map(v => (
              <span key={v} className="px-1.5 py-0.5 rounded bg-overlay font-mono text-accent">{'{{'}{v}{'}}'}</span>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* =====================================================================
   渲染预览弹窗：填写变量值 → 调用后端渲染
   ===================================================================== */
function PromptPreviewModal({ prompt, onClose }: { prompt: PromptTemplate | null; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [rendered, setRendered] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [rendering, setRendering] = useState(false)

  const [initialized, setInitialized] = useState(false)
  if (prompt && !initialized) {
    setValues(Object.fromEntries(prompt.variables.map(v => [v, ''])))
    setRendered(null)
    setMissing([])
    setInitialized(true)
  }
  if (!prompt && initialized) setInitialized(false)

  const handleRender = async () => {
    if (!prompt) return
    setRendering(true)
    try {
      const res = await window.api.renderPrompt(prompt.id, values)
      if (res.success && res.data) {
        setRendered(res.data.rendered)
        setMissing(res.data.missingVariables)
      } else {
        toast.error('渲染失败', res.error)
      }
    } catch (err) {
      toast.error('渲染失败', err instanceof Error ? err.message : String(err))
    } finally {
      setRendering(false)
    }
  }

  return (
    <Modal
      open={prompt !== null}
      onClose={onClose}
      title={`渲染「${prompt?.name || ''}」`}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>关闭</Button>
          <Button variant="primary" icon={<Wand2 size={13} />} loading={rendering} onClick={handleRender}>渲染</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {/* 变量输入 */}
        <div className="space-y-2.5">
          {(prompt?.variables.length || 0) === 0 && (
            <p className="text-xs text-fg-muted">模板中没有占位符，直接点击「渲染」查看原样输出。</p>
          )}
          {prompt?.variables.map(v => (
            <Input key={v} label={'{{' + v + '}}'} value={values[v] || ''}
              onChange={e => setValues(prev => ({ ...prev, [v]: e.target.value }))}
              placeholder={`输入 ${v} 的值...`} className="font-mono text-xs" />
          ))}
        </div>

        {/* 渲染结果 */}
        {rendered !== null && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-2xs font-semibold uppercase tracking-wider text-fg-muted">渲染结果</span>
              {missing.length > 0 && (
                <Badge tone="warning">缺失变量：{missing.join(', ')}</Badge>
              )}
            </div>
            <pre className="text-xs text-fg-secondary font-mono whitespace-pre-wrap leading-relaxed bg-app/60 rounded-lg p-3 border border-line max-h-52 overflow-y-auto">
              {rendered}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  )
}
