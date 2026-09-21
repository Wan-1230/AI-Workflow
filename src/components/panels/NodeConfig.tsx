import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2, Settings2, Variable, ChevronDown, ChevronRight } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { nodeCatalog, type NodeFieldSchema } from '@shared/node-catalog'
import type { NodeErrorStrategy, NodeExecutionConfig } from '@shared/workflow'
import { Input, Textarea, Select, Switch, IconButton, Spinner } from '../../components/ui'
import type { ModelConfig } from '@shared/model'

/**
 * 节点配置面板（schema 驱动）
 * - 依据 @shared/node-catalog 的 fields 定义渲染表单
 * - 字段的动态选项由 field.dataSource 声明（模型库 / 凭证库），不靠键名隐式约定
 * - 提供上游输出引用（变量）快速插入
 */
export function NodeConfig() {
  const {
    nodes, selectedNodeId, updateNodeData, updateNodeConfig,
    updateNodeExecutionConfig, removeNode
  } = useWorkflowStore()
  const selectedNode = nodes.find(n => n.id === selectedNodeId)
  const def = selectedNode ? nodeCatalog[selectedNode.data.nodeType as string] : null

  const [models, setModels] = useState<ModelConfig[] | null>(null)
  const [credentialNames, setCredentialNames] = useState<string[] | null>(null)

  // 动态加载模型与凭证列表（供 dataSource 字段下拉使用）
  useEffect(() => {
    let cancelled = false
    window.api.listModels().then(res => {
      if (!cancelled && res.success && res.data) setModels(res.data)
    }).catch(() => {})
    window.api.getCredentials().then(res => {
      if (!cancelled && res.success && res.data) setCredentialNames(res.data.map(c => c.key))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const config = useMemo(
    () => (selectedNode?.data.config as Record<string, unknown>) || {},
    [selectedNode]
  )

  const updCfg = useCallback((k: string, v: unknown) => {
    if (!selectedNodeId) return
    updateNodeConfig(selectedNodeId, { ...config, [k]: v })
  }, [selectedNodeId, config, updateNodeConfig])

  // 未选中节点：空状态引导
  if (!selectedNode || !def) {
    return (
      <div className="w-72 min-w-72 h-full border-l border-line bg-surface flex flex-col items-center justify-center px-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-overlay flex items-center justify-center mb-3">
          <Settings2 size={18} className="text-fg-faint" />
        </div>
        <p className="text-sm font-medium text-fg-secondary">未选中节点</p>
        <p className="text-xs text-fg-muted mt-1">点击或双击画布中的节点<br />即可配置参数</p>
      </div>
    )
  }

  return (
    <div className="w-72 min-w-72 h-full border-l border-line bg-surface flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-line flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
            style={{ backgroundColor: def.color + '16', color: def.color }}
          >
            {def.icon}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-fg block leading-tight truncate">{def.displayName}</span>
            <span className="text-2xs text-fg-muted font-mono">{def.id}</span>
          </div>
        </div>
        <IconButton variant="danger" tooltip="删除节点" onClick={() => selectedNodeId && removeNode(selectedNodeId)}>
          <Trash2 size={14} />
        </IconButton>
      </div>

      {/* 表单区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 节点名称 */}
        <Input
          label="节点名称"
          value={String(selectedNode.data.label || '')}
          onChange={e => selectedNodeId && updateNodeData(selectedNodeId, { label: e.target.value })}
          placeholder="给节点起个名字..."
        />

        {/* Schema 字段 */}
        {def.fields.length > 0 && (
          <div className="border-t border-line pt-4 space-y-3">
            {def.fields.map(field => (
              <SchemaField
                key={field.key}
                field={field}
                value={config[field.key] !== undefined ? config[field.key] : def.defaultConfig[field.key]}
                models={models}
                credentialNames={credentialNames}
                onChange={v => updCfg(field.key, v)}
              />
            ))}
          </div>
        )}

        {/* 执行策略：超时 / 重试 / 失败处置 */}
        <ExecutionPolicy
          value={(selectedNode.data.executionConfig as NodeExecutionConfig | undefined) ?? {}}
          onChange={v => selectedNodeId && updateNodeExecutionConfig(selectedNodeId, v)}
        />

        {/* 变量引用提示 */}
        {def.fields.length > 0 && (
          <div className="border-t border-line pt-3">
            <VariableReferences
              nodeId={selectedNode.id}
              onPick={expr => {
                // 插入到当前编辑的 textarea（若有焦点），否则提示
                const active = document.activeElement as HTMLTextAreaElement | null
                if (active && active.tagName === 'TEXTAREA') {
                  const start = active.selectionStart ?? active.value.length
                  active.value = active.value.slice(0, start) + expr + active.value.slice(active.selectionEnd ?? start)
                  active.dispatchEvent(new Event('input', { bubbles: true }))
                  active.focus()
                  active.setSelectionRange(start, start + expr.length)
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/* =====================================================================
   Schema 字段渲染：按类型分发
   ===================================================================== */
function SchemaField({
  field,
  value,
  models,
  credentialNames,
  onChange,
}: {
  field: NodeFieldSchema
  value: unknown
  models: ModelConfig[] | null
  credentialNames: string[] | null
  onChange: (v: unknown) => void
}) {
  // 动态选项字段：由 catalog 的 dataSource 声明，不再依赖字段键名的隐式约定
  if (field.dataSource === 'models' || field.dataSource === 'credentials') {
    const isModels = field.dataSource === 'models'
    const loading = isModels ? models === null : credentialNames === null
    const options = isModels
      ? [
          { value: '', label: '默认模型（在「模型」页配置）' },
          ...(models ?? []).map(m => ({ value: m.id, label: `${m.name}${m.isDefault ? '（默认）' : ''} · ${m.model}` }))
        ]
      : [
          { value: '', label: '不使用凭证（改用「模型配置」中的模型）' },
          ...(credentialNames ?? []).map(name => ({ value: name, label: name }))
        ]

    return (
      <div>
        <label className="text-xs font-medium text-fg-secondary mb-1 block">
          {field.label} {field.help && <span className="text-2xs text-fg-muted font-normal">({field.help})</span>}
        </label>
        {loading ? (
          <div className="py-1.5"><Spinner size={12} label={isModels ? '加载模型...' : '加载凭证...'} /></div>
        ) : (
          <Select value={String(value || '')} onChange={e => onChange(e.target.value)} options={options} />
        )}
      </div>
    )
  }

  switch (field.type) {
    case 'textarea':
      return (
        <Textarea
          label={field.label}
          help={field.help}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          rows={field.rows ?? 4}
          placeholder={field.placeholder}
          className="font-mono text-xs"
        />
      )
    case 'number':
      return (
        <Input
          label={field.label}
          help={field.help}
          type="number"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder={field.placeholder}
        />
      )
    case 'select':
      return (
        <div>
          <label className="text-xs font-medium text-fg-secondary mb-1 block">
            {field.label} {field.help && <span className="text-2xs text-fg-muted font-normal">({field.help})</span>}
          </label>
          <Select value={String(value ?? '')} onChange={e => onChange(e.target.value)}
            options={field.options || []} />
        </div>
      )
    case 'boolean':
      return (
        <Switch
          label={field.label}
          hint={field.help}
          checked={Boolean(value)}
          onChange={v => onChange(v)}
        />
      )
    case 'json':
      return (
        <Textarea
          label={field.label}
          help={field.help}
          value={typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          rows={field.rows ?? 3}
          placeholder={field.placeholder}
          className="font-mono text-xs"
        />
      )
    default:
      return (
        <Input
          label={field.label}
          help={field.help}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )
  }
}

/* =====================================================================
   变量引用：列出上游节点可引用字段，点击插入
   ===================================================================== */
function VariableReferences({ nodeId, onPick }: { nodeId: string; onPick: (expr: string) => void }) {
  const { nodes, edges } = useWorkflowStore()
  const [open, setOpen] = useState(false)

  // 收集直接上游节点
  const upstream = useMemo(() => {
    const sourceIds = edges.filter(e => e.target === nodeId).map(e => e.source)
    return nodes.filter(n => sourceIds.includes(n.id))
  }, [nodes, edges, nodeId])

  if (upstream.length === 0) return null

  const upDef = (n: (typeof upstream)[number]) =>
    nodeCatalog[n.data.nodeType as string]

  return (
    <div className="rounded-lg border border-line bg-app/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-2xs font-medium text-fg-secondary hover:text-fg transition-colors"
      >
        <Variable size={11} className="text-accent" />
        引用上游输出（{upstream.length}）
        <span className="ml-auto text-fg-faint">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-line max-h-40 overflow-y-auto p-1.5 space-y-0.5">
          {upstream.map(n => {
            const def = upDef(n)
            return (
              <div key={n.id} className="px-1.5 py-1 rounded">
                <div className="text-2xs text-fg-muted mb-0.5 truncate">
                  <span className="text-fg-secondary font-medium">{def?.icon} {String(n.data.label || '')}</span>
                  <span className="ml-1 font-mono">{n.id}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(def?.outputs ?? []).length > 0 ? def!.outputs.map(out => (
                    <button
                      key={out.name}
                      type="button"
                      onClick={() => onPick(`{{${n.id}.${out.name}}}`)}
                      className="px-1.5 py-0.5 rounded bg-overlay text-2xs font-mono text-accent hover:bg-accent-soft transition-colors"
                      title={`引用 {{${n.id}.${out.name}}}`}
                    >
                      {out.name}
                    </button>
                  )) : (
                    <button
                      type="button"
                      onClick={() => onPick(`{{${n.id}}}`)}
                      className="px-1.5 py-0.5 rounded bg-overlay text-2xs font-mono text-accent hover:bg-accent-soft transition-colors"
                    >
                      整个输出
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* =====================================================================
   执行策略：超时 / 重试 / 失败处置
   这些配置对所有节点同构，因此不走 catalog 的 fields schema
   ===================================================================== */

const STRATEGY_LABELS: Record<NodeErrorStrategy, string> = {
  stop: '中断工作流',
  skip: '跳过并继续',
  'retry-then-skip': '重试后跳过',
  'error-branch': '走错误分支'
}

function buildRetry(maxRetries?: number, interval?: number): NodeExecutionConfig['retry'] {
  if (maxRetries === undefined && interval === undefined) return undefined
  return { maxRetries: maxRetries ?? 0, interval: interval ?? 1000 }
}

function ExecutionPolicy({ value, onChange }: {
  value: NodeExecutionConfig
  onChange: (v: NodeExecutionConfig) => void
}) {
  const [open, setOpen] = useState(false)
  const strategy = value.onError ?? 'stop'
  const patched = (p: Partial<NodeExecutionConfig>) => onChange({ ...value, ...p })

  return (
    <div className="border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-xs font-medium text-fg-secondary hover:text-fg transition-colors"
      >
        <span>执行策略</span>
        <span className="flex items-center gap-1.5">
          <span className="text-2xs text-fg-muted">{STRATEGY_LABELS[strategy]}</span>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <Input
            label="超时 (ms)"
            type="number"
            min="1000"
            placeholder="留空使用全局设置"
            value={value.timeout !== undefined ? String(value.timeout) : ''}
            onChange={e => {
              const n = Number(e.target.value)
              patched({ timeout: Number.isFinite(n) && n > 0 ? n : undefined })
            }}
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="重试次数"
              type="number"
              min="0"
              placeholder="0"
              value={value.retry ? String(value.retry.maxRetries) : ''}
              onChange={e => {
                const n = Number(e.target.value)
                patched({ retry: buildRetry(Number.isFinite(n) && n >= 0 ? n : undefined, value.retry?.interval) })
              }}
            />
            <Input
              label="重试间隔 (ms)"
              type="number"
              min="0"
              placeholder="1000"
              value={value.retry ? String(value.retry.interval) : ''}
              onChange={e => {
                const n = Number(e.target.value)
                patched({ retry: buildRetry(value.retry?.maxRetries, Number.isFinite(n) && n >= 0 ? n : undefined) })
              }}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-fg-secondary mb-1 block">失败处置</label>
            <Select
              value={strategy}
              onChange={e => patched({ onError: e.target.value as NodeErrorStrategy })}
              options={(Object.keys(STRATEGY_LABELS) as NodeErrorStrategy[])
                .map(k => ({ value: k, label: STRATEGY_LABELS[k] }))}
            />
          </div>

          {strategy === 'error-branch' && (
            <Input
              label="错误出口句柄"
              placeholder="error"
              help="连线时需从该出口拉出到错误处理节点"
              value={value.errorHandle ?? ''}
              onChange={e => patched({ errorHandle: e.target.value.trim() || undefined })}
            />
          )}
        </div>
      )}
    </div>
  )
}
