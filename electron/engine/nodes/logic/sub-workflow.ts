import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'

export const definition: NodeDefinition = {
  id: 'sub-workflow',
  category: 'logic',
  displayName: '子工作流',
  description: '嵌套调用子工作流（内嵌 JSON），支持输入输出传递',
  icon: '📂',
  color: '#f59e0b',
  inputs: [
    { name: 'workflowJson', label: '子工作流 JSON', type: 'object' },
    { name: 'input', label: '输入数据', type: 'any' }
  ],
  outputs: [
    { name: 'results', label: '子工作流结果', type: 'object' },
    { name: 'status', label: '执行状态', type: 'string' }
  ],
  defaultConfig: {
    workflowJson: '{}',
    input: ''
  }
}

/**
 * 子工作流节点
 * 实际递归执行由引擎处理（engine.executeSingleNode 中检测 sub-workflow 类型）。
 * 此处为注册表占位实现，直接执行会提示需引擎支持。
 */
export const execute: NodeExecuteFn = async () => {
  throw new Error('子工作流节点需要由引擎递归执行（当前执行器不支持）')
}
