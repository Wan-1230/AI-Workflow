import { useCallback, useEffect, useState } from 'react'
import { Cpu, Plus, Plug, Trash2, Pencil, Star, RefreshCw, KeyRound, XCircle, Loader2 } from 'lucide-react'
import { Button, Modal, ConfirmDialog, Input, Select, Switch, EmptyState, Spinner, Badge, Card } from '../components/ui'
import { toast } from '../stores/toast-store'
import type { ModelConfig, ModelProvider } from '@shared/model'

/** 模型提供商预设（OpenAI 兼容接口） */
const PROVIDER_PRESETS: { id: ModelProvider; name: string; baseUrl: string; defaultModel: string }[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus' },
  { id: 'moonshot', name: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k' },
  { id: 'custom', name: '自定义', baseUrl: '', defaultModel: '' }
]

const providerName = (id: ModelProvider) => PROVIDER_PRESETS.find(p => p.id === id)?.name || id

export function ModelsPage() {
  const [models, setModels] = useState<ModelConfig[] | null>(null)
  const [error, setError] = useState('')

  // 编辑弹窗状态
  const [editing, setEditing] = useState<ModelConfig | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<ModelConfig | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  // 测试中模型 id
  const [testingId, setTestingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setModels(null)
    setError('')
    try {
      const res = await window.api.listModels()
      if (res.success && res.data) setModels(res.data)
      else { setError(res.error || '加载失败'); setModels([]) }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setModels([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  /** 设为默认 */
  const handleSetDefault = async (id: string) => {
    try {
      const res = await window.api.setDefaultModel(id)
      if (res.success) {
        toast.success('已设为默认模型')
        await load()
      } else toast.error('设置失败', res.error)
    } catch (err) {
      toast.error('设置失败', err instanceof Error ? err.message : String(err))
    }
  }

  /** 连通性测试 */
  const handleTest = async (model: ModelConfig) => {
    setTestingId(model.id)
    try {
      const res = await window.api.testModel(model.id)
      if (res.success && res.data) {
        if (res.data.success) {
          toast.success('连接成功', `耗时 ${res.data.latency}ms${res.data.respondedModel ? ` · ${res.data.respondedModel}` : ''}`)
        } else {
          toast.error('连接失败', res.data.message)
        }
      } else {
        toast.error('测试失败', res.error)
      }
    } catch (err) {
      toast.error('测试异常', err instanceof Error ? err.message : String(err))
    } finally {
      setTestingId(null)
    }
  }

  /** 删除模型 */
  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      const res = await window.api.deleteModel(deleting.id)
      if (res.success) {
        toast.success(`已删除「${deleting.name}」`)
        setDeleting(null)
        await load()
      } else toast.error('删除失败', res.error)
    } catch (err) {
      toast.error('删除失败', err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-fg">模型配置</h1>
            <p className="text-xs text-fg-muted mt-0.5">管理 OpenAI 兼容接口的模型，API Key 加密存储于本地</p>
          </div>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => { setEditing(null); setFormOpen(true) }}>
            添加模型
          </Button>
        </div>

        {/* 列表 */}
        {models === null ? (
          <div className="flex items-center justify-center py-24"><Spinner label="加载模型中..." /></div>
        ) : error ? (
          <EmptyState icon={<XCircle />} title="加载失败" description={error}
            action={<Button icon={<RefreshCw size={14} />} onClick={load}>重试</Button>} />
        ) : models.length === 0 ? (
          <EmptyState
            icon={<Cpu />}
            title="还没有模型配置"
            description="添加一个 OpenAI 兼容模型（如 DeepSeek / 通义千问 / OpenAI），工作流中的 LLM 节点即可调用。"
            action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => { setEditing(null); setFormOpen(true) }}>添加模型</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {models.map(m => (
              <Card key={m.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
                      <Cpu size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-fg truncate">{m.name}</h3>
                        {m.isDefault && <Badge tone="accent">默认</Badge>}
                      </div>
                      <p className="text-2xs text-fg-muted font-mono truncate mt-0.5">{m.model}</p>
                    </div>
                  </div>
                  <Badge tone="neutral">{providerName(m.provider)}</Badge>
                </div>

                <div className="space-y-1 text-2xs text-fg-muted">
                  <div className="truncate font-mono">{m.baseUrl || '（未设置 Base URL）'}</div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <KeyRound size={10} className={m.hasApiKey ? 'text-sig-green' : 'text-fg-faint'} />
                      {m.hasApiKey ? '已配置 Key' : '未配置 Key'}
                    </span>
                    <span>温度 {m.temperature}</span>
                    <span>Token {m.maxTokens}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 pt-2 border-t border-line/60">
                  <Button size="xs" variant="ghost" icon={testingId === m.id ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />}
                    disabled={!m.hasApiKey || testingId !== null}
                    onClick={() => handleTest(m)}>
                    {testingId === m.id ? '测试中' : '测试'}
                  </Button>
                  {!m.isDefault && (
                    <Button size="xs" variant="ghost" icon={<Star size={11} />} onClick={() => handleSetDefault(m.id)}>设为默认</Button>
                  )}
                  <div className="ml-auto flex gap-1">
                    <Button size="xs" variant="ghost" icon={<Pencil size={11} />}
                      onClick={() => { setEditing(m); setFormOpen(true) }}>编辑</Button>
                    <Button size="xs" variant="ghost" icon={<Trash2 size={11} />}
                      className="text-sig-red hover:text-sig-red hover:bg-danger/10"
                      onClick={() => setDeleting(m)}>删除</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      <ModelFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={async () => { setFormOpen(false); await load() }}
      />

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleting !== null}
        title="删除模型"
        message={<>确定删除模型 <span className="font-semibold text-fg">「{deleting?.name}」</span> 吗？工作流中引用该模型的节点将回退到默认模型。</>}
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
   模型表单弹窗（新建 / 编辑）
   ===================================================================== */
function ModelFormModal({ open, editing, onClose, onSaved }: {
  open: boolean
  editing: ModelConfig | null
  onClose: () => void
  onSaved: () => void
}) {
  const [provider, setProvider] = useState<ModelProvider>('openai')
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [temperature, setTemperature] = useState('0.7')
  const [maxTokens, setMaxTokens] = useState('2048')
  const [isDefault, setIsDefault] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  // 打开时初始化表单
  const [initialized, setInitialized] = useState(false)
  if (open && !initialized) {
    if (editing) {
      setProvider(editing.provider)
      setName(editing.name)
      setBaseUrl(editing.baseUrl)
      setModel(editing.model)
      setApiKey('')
      setTemperature(String(editing.temperature))
      setMaxTokens(String(editing.maxTokens))
      setIsDefault(editing.isDefault)
    } else {
      const preset = PROVIDER_PRESETS[0]
      setProvider(preset.id)
      setName('')
      setBaseUrl(preset.baseUrl)
      setModel(preset.defaultModel)
      setApiKey('')
      setTemperature('0.7')
      setMaxTokens('2048')
      setIsDefault(false)
    }
    setInitialized(true)
  }
  if (!open && initialized) setInitialized(false)

  /** 切换提供商时自动填充预设 */
  const changeProvider = (p: ModelProvider) => {
    setProvider(p)
    const preset = PROVIDER_PRESETS.find(x => x.id === p)
    if (preset) {
      if (!editing || (editing.provider !== p)) {
        setBaseUrl(preset.baseUrl)
        setModel(preset.defaultModel)
      }
    }
  }

  const handleSubmit = async () => {
    if (!name.trim() || !model.trim()) {
      toast.warning('请填写名称与模型名')
      return
    }
    if (!editing && !apiKey.trim()) {
      toast.warning('请填写 API Key')
      return
    }
    setSubmitLoading(true)
    try {
      const input = {
        name: name.trim(),
        provider,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: model.trim(),
        temperature: Number(temperature) || 0.7,
        maxTokens: Number(maxTokens) || 2048,
        isDefault
      }
      const res = editing
        ? await window.api.updateModel(editing.id, input)
        : await window.api.createModel(input)
      if (res.success) {
        toast.success(editing ? '模型已更新' : '模型已添加')
        onSaved()
      } else {
        toast.error(editing ? '更新失败' : '添加失败', res.error)
      }
    } catch (err) {
      toast.error('保存失败', err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '编辑模型' : '添加模型'}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={submitLoading} onClick={handleSubmit}>保存</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Select
          label="提供商"
          options={PROVIDER_PRESETS.map(p => ({ value: p.id, label: p.name }))}
          value={provider}
          onChange={e => changeProvider(e.target.value as ModelProvider)}
        />
        <Input label="显示名称" value={name} onChange={e => setName(e.target.value)}
          placeholder="如：DeepSeek 主模型" autoFocus />
        <Input label="API Base URL" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
          placeholder="https://api.deepseek.com/v1" className="font-mono text-xs" />
        <Input label="模型名" value={model} onChange={e => setModel(e.target.value)}
          placeholder="deepseek-chat" className="font-mono text-xs" />
        <Input
          label={editing ? 'API Key（留空保持不变）' : 'API Key'}
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={editing ? '••••••••' : 'sk-...'}
          hint="使用系统安全存储加密保存，前端不保留明文"
          className="font-mono text-xs"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="温度 (0~2)" type="number" step="0.1" min="0" max="2"
            value={temperature} onChange={e => setTemperature(e.target.value)} />
          <Input label="最大 Token" type="number" min="1"
            value={maxTokens} onChange={e => setMaxTokens(e.target.value)} />
        </div>
        <Switch label="设为默认模型" hint="LLM 节点未指定模型时使用默认模型"
          checked={isDefault} onChange={setIsDefault} />
      </div>
    </Modal>
  )
}
