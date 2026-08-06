import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'

export const definition: NodeDefinition = {
  id: 'variable-set',
  category: 'logic',
  displayName: '变量设置',
  description: '将任意值写入全局变量（后续节点通过 {{global.KEY}} 引用）',
  icon: '🔧',
  color: '#f59e0b',
  inputs: [
    { name: 'key', label: '变量名', type: 'string' },
    { name: 'value', label: '变量值', type: 'any' }
  ],
  outputs: [
    { name: 'key', label: '变量名', type: 'string' },
    { name: 'value', label: '写入的值', type: 'any' }
  ],
  defaultConfig: {
    key: 'myVar',
    value: ''
  }
}

/**
 * 变量设置节点
 * 将值写入 ExecutionContext.variables，后续节点通过 {{global.KEY}} 引用。
 * 注：全局变量在单次执行会话内共享（画布外配置的全局变量作为初始值）。
 */
export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const key = String(ctx.config.key || '').trim()
  if (!key) throw new Error('变量名为空，请填写 key')

  const value = ctx.config.value ?? ''
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value)

  // 写入共享变量表（NodeContext.variables 为引用，引擎内共享）
  ctx.variables[key] = stringValue
  ctx.logger(`设置全局变量 ${key} = ${stringValue.slice(0, 80)}`)

  return {
    key,
    value: stringValue,
    set: true
  }
}
