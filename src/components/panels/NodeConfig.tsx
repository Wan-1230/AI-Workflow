import { useCallback } from 'react'
import { Trash2, Settings, Info } from 'lucide-react'
import { Play, Globe, Code2, GitBranch, Bell } from 'lucide-react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { nodeDefinitions, configLabels } from '../../stores/node-definitions'

const icons: Record<string, React.ElementType> = { play: Play, globe: Globe, 'code-2': Code2, 'git-branch': GitBranch, bell: Bell }

const configHelp: Record<string, Record<string, string>> = {
  'http-request': { url: 'Full URL including protocol', method: 'GET, POST, PUT, DELETE', headers: 'JSON object of key-value pairs', body: 'Request body (for POST/PUT)' },
  'code-exec': { code: 'JavaScript. Use `input` for upstream data, `return` for output.' },
  'condition': { left: 'Left operand or {{nodeId.field}}', right: 'Right operand to compare against', operator: 'Comparison operator' },
  'notification': { message: 'Supports {{nodeId.field}} interpolation', level: 'info, warning, or error' },
}

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
      <div className="w-[280px] min-w-[280px] h-full border-l border-border bg-panel flex flex-col items-center justify-center px-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-overlay flex items-center justify-center mb-3">
          <Settings size={18} className="text-t-faint" />
        </div>
        <p className="text-[13px] font-medium text-t-secondary">No node selected</p>
        <p className="text-[11px] text-t-muted mt-1">Click a node on the canvas to view its configuration</p>
      </div>
    )
  }

  const config = (selectedNode.data.config as Record<string, unknown>) || {}
  const labels = configLabels[def.type] || {}
  const helps = configHelp[def.type] || {}

  return (
    <div className="w-[280px] min-w-[280px] h-full border-l border-border bg-panel flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: def.color + '12', color: def.color }}>
            <Icon size={15} />
          </div>
          <div>
            <span className="text-[13px] font-semibold text-t-primary block leading-tight">{def.displayName}</span>
            <span className="text-[10px] text-t-muted font-mono">{def.type}</span>
          </div>
        </div>
        <button onClick={() => selectedNodeId && removeNode(selectedNodeId)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-t-faint hover:text-sig-red hover:bg-red-50 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Name field */}
        <div>
          <label className="text-[11px] font-medium text-t-secondary mb-1.5 block">Name</label>
          <input type="text" value={String(selectedNode.data.label)}
            onChange={e => selectedNodeId && updateNodeData(selectedNodeId, { label: e.target.value })}
            placeholder="Node name..."
            className="w-full px-3 py-2 text-[12px] bg-base border border-border rounded-lg text-t-primary placeholder:text-t-faint focus:outline-none transition-colors" />
        </div>

        {/* Config fields */}
        {Object.keys(def.defaultConfig).length > 0 && (
          <div className="border-t border-border pt-4">
            <label className="text-[11px] font-medium text-t-secondary mb-3 block">Configuration</label>
            <div className="space-y-3">
              {Object.entries(def.defaultConfig).map(([k, dv]) => {
                const val = config[k] !== undefined ? config[k] : dv
                const isCode = k === 'code'
                const isLong = typeof dv === 'string' && dv.length > 50
                const help = helps[k]
                return (
                  <div key={k}>
                    <label className="text-[11px] font-medium text-t-secondary mb-1 block">{labels[k] || k}</label>
                    {isCode || isLong ? (
                      <textarea value={String(val)} onChange={e => updCfg(k, e.target.value)} rows={isCode ? 8 : 3}
                        className="w-full px-3 py-2 text-[12px] bg-base border border-border rounded-lg text-t-primary font-mono focus:outline-none resize-y transition-colors"
                        spellCheck={false} placeholder={help || ''} />
                    ) : (
                      <input type="text" value={String(val)} onChange={e => updCfg(k, e.target.value)}
                        className="w-full px-3 py-2 text-[12px] bg-base border border-border rounded-lg text-t-primary placeholder:text-t-faint focus:outline-none transition-colors"
                        placeholder={help || ''} />
                    )}
                    {help && !isCode && (
                      <p className="flex items-center gap-1 mt-1 text-[10px] text-t-muted">
                        <Info size={9} className="shrink-0" />{help}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
