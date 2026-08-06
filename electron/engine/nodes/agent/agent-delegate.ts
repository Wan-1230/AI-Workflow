import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'
import { callLlm } from '../ai/llm-call'

export const definition: NodeDefinition = {
  id: 'agent-delegate',
  category: 'agent',
  displayName: '子 Agent 委派',
  description: '将任务委派给子 Agent（独立 LLM 调用，可附加上下文）',
  icon: '🤝',
  color: '#ef4444',
  inputs: [
    { name: 'task', label: '委派任务', type: 'string' },
    { name: 'contextData', label: '上下文数据', type: 'any' }
  ],
  outputs: [
    { name: 'response', label: 'Agent 回复', type: 'string' },
    { name: 'task', label: '任务描述', type: 'string' },
    { name: 'duration', label: '耗时(ms)', type: 'number' }
  ],
  defaultConfig: {
    task: '请分析以下数据并给出结论',
    contextData: '',
    role: '你是一名专业的分析助手，请基于提供的上下文完成任务。',
    modelId: '',
    baseUrl: '',
    apiKeyRef: '',
    model: '',
    temperature: 0.3,
    maxTokens: 2048
  }
}

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
