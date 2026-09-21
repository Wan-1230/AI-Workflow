import type { NodeExecuteFn } from '@shared/node'


/**
 * 子工作流节点
 * 实际递归执行由引擎处理（engine.executeSingleNode 中检测 sub-workflow 类型）。
 * 此处为注册表占位实现，直接执行会提示需引擎支持。
 */
export const execute: NodeExecuteFn = async () => {
  throw new Error('子工作流节点需要由引擎递归执行（当前执行器不支持）')
}
