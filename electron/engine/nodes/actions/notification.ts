import type { NodeContext, NodeExecuteFn } from '@shared/node'

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
