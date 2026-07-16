import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'

export const definition: NodeDefinition = {
  id: 'notification',
  category: 'action',
  displayName: '通知输出',
  description: '在工作流日志中输出通知消息',
  icon: '🔔',
  color: '#22c55e',
  inputs: [
    { name: 'message', label: '消息内容', type: 'string' },
    { name: 'level', label: '级别', type: 'string' }
  ],
  outputs: [
    { name: 'sent', label: '已发送', type: 'boolean' },
    { name: 'message', label: '消息', type: 'string' }
  ],
  defaultConfig: {
    message: '工作流执行完成！',
    level: 'info'
  }
}

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const message = (ctx.config.message as string) || '通知消息'
  const level = (ctx.config.level as string) || 'info'

  const timestamp = new Date().toLocaleTimeString()
  const prefix = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : '📢'

  ctx.logger(`${prefix} [${timestamp}] ${message}`)

  return {
    sent: true,
    message: `${prefix} ${message}`,
    timestamp,
    level
  }
}
