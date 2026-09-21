import type { NodeContext, NodeExecuteFn } from '@shared/node'
import { callLlm } from '../ai/llm-call'


/**
 * 子 Agent 委派节点
 * 以独立角色提示词调用 LLM 完成委派任务（单轮 Agent 模式），
 * 结果作为本节点输出供主流程继续编排。
 */
export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config
  const task = String(config.task || '').trim()
  if (!task) throw new Error('委派任务为空，请填写 task')

  const role = String(config.role || '你是一名专业的分析助手。')
  const contextData = config.contextData ?? ''
  const contextStr = typeof contextData === 'object'
    ? JSON.stringify(contextData, null, 2)
    : String(contextData)

  const prompt = contextStr
    ? `${role}\n\n## 任务\n${task}\n\n## 上下文数据\n${contextStr}`
    : `${role}\n\n## 任务\n${task}`

  const startedAt = Date.now()
  ctx.logger(`委派任务给子 Agent...`)

  const response = await callLlm(ctx, config, prompt)

  ctx.logger(`子 Agent 完成，耗时 ${Date.now() - startedAt}ms`)

  return {
    response,
    task,
    duration: Date.now() - startedAt
  }
}
