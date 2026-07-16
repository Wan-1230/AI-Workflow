import { useCallback } from 'react'
import { Trash2, Settings } from 'lucide-react'
import { Play, Globe, Code2, GitBranch, Bell } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { nodeDefinitions, configLabels } from '../../stores/node-definitions'

const icons: Record<string, React.ElementType> = { play: Play, globe: Globe, 'code-2': Code2, 'git-branch': GitBranch, bell: Bell }

export function NodeConfig() {
  const { nodes, selectedNodeId, updateNodeData, removeNode } = useWorkflowStore()
  const selectedNode = nodes.find(n => n.id === selectedNodeId)
  const def = selectedNode ? nodeDefinitions[selectedNode.data.nodeType as string] : null
  const Icon = def ? (icons[def.icon] || Settings) : Settings

  const updCfg = useCallback((k: string, v: unknown) => {
    if (!selectedNodeId) return
    updateNodeData(selectedNodeId, { config: { ...(selectedNode?.data?.config || {}), [k]: v } })
  }, [selectedNodeId, selectedNode, updateNodeData])

  if (!selectedNode || !def) {
    return (
      <div className="w-64 min-w-[256px] h-full border-l border-border bg-panel overflow-y-auto animate-slide-r">
        <div className="flex flex-col items-center justify-center h-full px-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-card flex items-center justify-center mb-3">
            <Settings size={20} className="text-t-faint" />
          </div>
          <p className="text-sm text-t-secondary font-medium">未选中节点</p>
          <p className="text-xs text-t-muted mt-1 font-mono">点击节点查看配置</p>
        </div>
      </div>
    )
  }

  const config = (selectedNode.data.config as Record<string, unknown>) || {}
  const labels = configLabels[def.type] || {}

  return (
    <div className="w-64 min-w-[256px] h-full border-l border-border bg-panel overflow-y-auto animate-slide-r">
      <div className="p-3.5">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: def.color + '14', color: def.color }}>
              <Icon size={15} />
            </div>
            <div><span className="font-semibold text-[13px] text-t-primary block tracking-tight">{def.displayName}</span>
              <span className="text-3xs text-t-muted font-mono uppercase">{def.type}</span></div>
          </div>
          <button onClick={() => removeNode(selectedNodeId)}
            className="w-7 h-7 flex items-center justify-center rounded-sm text-t-muted hover:text-sig-red hover:bg-sig-red/5 transition-colors">
            <Trash2 size={14} /></button>
        </div>

        {/* 名称 */}
        <div className="mb-3">
          <label className="text-[10px] font-semibold text-t-muted uppercase tracking-wider mb-1.5 block">名称</label>
          <input type="text" value={String(selectedNode.data.label)} onChange={e => updateNodeData(selectedNodeId, { label: e.target.value })}
            className="w-full px-2.5 py-1.5 text-[12px] bg-card border border-border rounded-sm text-t-primary placeholder:text-t-faint focus:border-accent/40 focus:outline-none transition-colors" />
        </div>

        {/* 配置 */}
        <div className="border-t border-border pt-3.5">
          <label className="text-[10px] font-semibold text-t-muted uppercase tracking-wider mb-3 block">参数</label>
          {Object.keys(def.defaultConfig).length === 0 && <p className="text-xs text-t-muted font-mono">—</p>}
          <div className="space-y-3">
            {Object.entries(def.defaultConfig).map(([k, dv]) => {
              const val = config[k] !== undefined ? config[k] : dv
              const isCode = k === 'code'
              const isLong = typeof dv === 'string' && dv.length > 50
              return (
                <div key={k}>
                  <label className="text-[10px] font-semibold text-t-muted uppercase tracking-wider mb-1.5 block">{labels[k] || k}</label>
                  {isCode || isLong ? (
                    <textarea value={String(val)} onChange={e => updCfg(k, e.target.value)} rows={isCode ? 6 : 3}
                      className="w-full px-2.5 py-2 text-[12px] bg-card border border-border rounded-sm text-t-primary font-mono focus:border-accent/40 focus:outline-none resize-y transition-colors"
                      spellCheck={false} />
                  ) : (
                    <input type="text" value={String(val)} onChange={e => updCfg(k, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[12px] bg-card border border-border rounded-sm text-t-primary placeholder:text-t-faint focus:border-accent/40 focus:outline-none transition-colors" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
