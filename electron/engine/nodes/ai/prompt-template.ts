import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'
import { parseTemplateVariables } from '../../storage/prompts'

export const definition: NodeDefinition = {
  id: 'prompt-template',
  category: 'ai',
  displayName: '提示词模板',
  description: '渲染提示词模板（支持 {{变量}} 占位符）',
  icon: '📝',
  color: '#8b5cf6',
  inputs: [
    { name: 'template', label: '模板内容', type: 'string' },
    { name: 'variables', label: '变量', type: 'object' }
  ],
  outputs: [
    { name: 'text', label: '渲染结果', type: 'string' },
    { name: 'variables', label: '变量列表', type: 'object' },
    { name: 'missing', label: '缺失变量', type: 'object' }
  ],
  defaultConfig: {
    template: '请帮我总结以下内容：\n{{input.text}}',
    variables: '{"input.text": "要总结的文本"}'
  }
}

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const template = String(ctx.config.template || '')
  if (!template.trim()) {
    throw new Error('模板内容为空')
  }

  // 变量来源优先级：variables 配置(JSON) > 上游输入 > 全局变量
  let variables: Record<string, unknown> = {}
  const rawVars = String(ctx.config.variables || '')
  if (rawVars.trim()) {
    try {
      variables = JSON.parse(rawVars) as Record<string, unknown>
    } catch {
      throw new Error('variables 配置不是合法的 JSON 对象')
    }
  }

  const missing: string[] = []
  let rendered = template
  for (const varName of parseTemplateVariables(template)) {
    let value: unknown = undefined
    // 1. 配置变量
    if (varName in variables) value = variables[varName]
    // 2. 上游输入（{{nodeId.field}} 已由 executor 解析）
    else if (varName in ctx.inputs) value = ctx.inputs[varName]
    // 3. 全局变量
    else if (varName.startsWith('global.')) value = ctx.variables[varName.slice(7)]
    // 4. 上游节点输出直接引用
    else if (ctx.config[varName] !== undefined) value = ctx.config[varName]

    if (value === undefined || value === null) {
      missing.push(varName)
    } else {
      const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
      rendered = rendered.replaceAll(`{{${varName}}}`, str)
    }
  }

  ctx.logger(`模板渲染完成，缺失变量: ${missing.length > 0 ? missing.join(', ') : '无'}`)

  return {
    text: rendered,
    variables: parseTemplateVariables(template),
    missing,
    length: rendered.length
  }
}
