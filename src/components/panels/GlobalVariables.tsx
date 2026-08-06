import { useState } from 'react'
import { Plus, Trash2, Info } from 'lucide-react'
import { Modal, Button, IconButton, Input } from '../ui'
import { useWorkflowStore } from '../../stores/workflow-store'
import type { GlobalVariable } from '@shared/workflow'

/**
 * 全局变量管理弹窗
 * 变量在节点配置中通过 {{global.KEY}} 引用，跨节点共享
 */
export function GlobalVariablesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { variables, setVariables } = useWorkflowStore()
  const [draft, setDraft] = useState<GlobalVariable[]>([])

  // 打开时同步草稿
  const [synced, setSynced] = useState(false)
  if (open && !synced) {
    setDraft(variables.map(v => ({ ...v })))
    setSynced(true)
  }
  if (!open && synced) setSynced(false)

  const update = (i: number, patch: Partial<GlobalVariable>) => {
    setDraft(prev => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)))
  }

  const save = () => {
    // 过滤掉 key 为空的行
    const cleaned = draft
      .filter(v => v.key.trim() !== '')
      .map(v => ({ ...v, key: v.key.trim() }))
    setVariables(cleaned)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="全局变量"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={save}>保存变量</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-2xs text-fg-muted bg-overlay/60 rounded-lg p-2.5 leading-relaxed">
          <Info size={13} className="text-accent shrink-0 mt-0.5" />
          <span>
            变量可在任意节点配置中通过 <code className="font-mono text-accent">{"{{global.KEY}}"}</code> 引用，
            例如在 LLM 节点提示词中插入 <code className="font-mono text-accent">{"{{global.myVar}}"}</code>。
          </span>
        </div>

        {/* 变量列表 */}
        <div className="space-y-2">
          {draft.length === 0 && (
            <p className="text-center text-xs text-fg-muted py-6">还没有变量，点击下方「添加变量」创建</p>
          )}
          {draft.map((v, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-[1fr_1.6fr] gap-2">
                <Input
                  placeholder="变量名，如 myVar"
                  value={v.key}
                  onChange={e => update(i, { key: e.target.value })}
                  className="font-mono text-xs"
                />
                <Input
                  placeholder="变量值（支持 {{nodeId.field}} 插值）"
                  value={v.value}
                  onChange={e => update(i, { value: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
              <IconButton size="sm" variant="danger" tooltip="删除变量"
                onClick={() => setDraft(prev => prev.filter((_, idx) => idx !== i))}>
                <Trash2 size={13} />
              </IconButton>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" icon={<Plus size={13} />}
          onClick={() => setDraft(prev => [...prev, { key: '', value: '' }])}>
          添加变量
        </Button>
      </div>
    </Modal>
  )
}
