import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'

export const definition: NodeDefinition = {
  id: 'manual-trigger',
  category: 'trigger',
  displayName: '手动触发',
  description: '点击运行按钮来启动工作流',
  icon: '▶️',
  color: '#3b82f6',
  inputs: [],
  outputs: [{ name: 'triggered', label: '触发信号', type: 'boolean' }],
  defaultConfig: {}
}

export const execute: NodeExecuteFn = async (_ctx: NodeContext) => {
  return {
    triggered: true,
    timestamp: Date.now(),
    isoTime: new Date().toISOString()
  }
}
