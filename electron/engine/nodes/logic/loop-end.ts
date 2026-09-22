import type { NodeExecuteFn } from '@shared/node'

/**
 * 循环终点标记节点。
 *
 * 它本身不做计算：存在意义是让"循环体到哪里结束"在画布上是显式可见、可校验的，
 * 从而支持逐项执行任意节点，而不像旧实现那样只能在节点内部渲染模板。
 * 真正的逐项调度在引擎（executeLoop）里完成。
 */
export const execute: NodeExecuteFn = async ctx => {
  const index = ctx.scope?.index ?? 0
  ctx.logger(`本轮迭代完成（第 ${index + 1} 项）`)
  return { passed: index }
}
