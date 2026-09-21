import type { NodeContext, NodeExecuteFn } from '@shared/node'

export const execute: NodeExecuteFn = async (_ctx: NodeContext) => {
  return {
    triggered: true,
    timestamp: Date.now(),
    isoTime: new Date().toISOString()
  }
}
