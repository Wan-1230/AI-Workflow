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
      <div className="w-60 min-w-[240px] h-full border-l border-border bg-panel overflow-y-auto">
        <div className="flex flex-col items-center justify-center h-full px-4 text-center">
          <Settings size={16} className="text-t-faint mb-2" />
          <p className="text-[11px] text-t-muted font-mono">no selection</p>
        </div>
      </div>
    )
  }

  const config = (selectedNode.data.config as Record<string, unknown>) || {}
  const labels = configLabels[def.type] || {}

  return (
    <div className="w-60 min-w-[240px] h-full border-l border-border bg-panel overflow-y-auto">
      <div className="p-3">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-sm flex items-center justify-center" style={{ backgroundColor: def.color + '12', color: def.color }}>
              <Icon size={12} />
            </div>
            <div>
              <span className="font-display text-[12px] font-bold text-t-primary block">{def.displayName}</span>
              <span className="text-[9px] text-t-muted font-mono">{def.type}</span>
            </div>
          </div>
          <button onClick={() => selectedNodeId && removeNode(selectedNodeId)}
            className="w-6 h-6 flex items-center justify-center rounded text-t-faint hover:text-sig-red hover:bg-sig-red/5 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>

        {/* 名称 */}
        <div className="mb-3">
          <label className="text-[9px] font-bold text-t-muted uppercase tracking-wider mb-1 block font-mono">label</label>
          <input type="text" value={String(selectedNode.data.label)} onChange={e => selectedNodeId && updateNodeData(selectedNodeId, { label: e.target.value })}
            className="w-full px-2 py-1 text-[11px] bg-card border border-border rounded text-t-primary focus:outline-none transition-colors" />
        </div>

        {/* 配置 */}
        <div className="border-t border-border pt-3">
          <label className="text-[9px] font-bold text-t-muted uppercase tracking-wider mb-2 block font-mono">config</label>
          {Object.keys(def.defaultConfig).length === 0 && <p className="text-[10px] text-t-faint font-mono">--</p>}
          <div className="space-y-2.5">
            {Object.entries(def.defaultConfig).map(([k, dv]) => {
              const val = config[k] !== undefined ? config[k] : dv
              const isCode = k === 'code'
              const isLong = typeof dv === 'string' && dv.length > 50
              return (
                <div key={k}>
                  <label className="text-[9px] font-bold text-t-muted uppercase tracking-wider mb-1 block font-mono">{labels[k] || k}</label>
                  {isCode || isLong ? (
                    <textarea value={String(val)} onChange={e => updCfg(k, e.target.value)} rows={isCode ? 6 : 3}
                      className="w-full px-2 py-1.5 text-[11px] bg-card border border-border rounded text-t-primary font-mono focus:outline-none resize-y transition-colors"
                      spellCheck={false} />
                  ) : (
                    <input type="text" value={String(val)} onChange={e => updCfg(k, e.target.value)}
                      className="w-full px-2 py-1 text-[11px] bg-card border border-border rounded text-t-primary focus:outline-none transition-colors" />
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
