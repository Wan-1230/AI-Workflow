import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'

export const definition: NodeDefinition = {
  id: 'text-process',
  category: 'action',
  displayName: '文本处理',
  description: '文本转换：替换/切分/拼接/大小写/截取/去空白',
  icon: '🔤',
  color: '#22c55e',
  inputs: [
    { name: 'text', label: '输入文本', type: 'string' },
    { name: 'operation', label: '操作', type: 'string' }
  ],
  outputs: [
    { name: 'text', label: '结果文本', type: 'string' },
    { name: 'parts', label: '切分结果', type: 'object' },
    { name: 'length', label: '长度', type: 'number' }
  ],
  defaultConfig: {
    text: '',
    operation: 'trim',
    search: '',
    replacement: '',
    separator: ',',
    start: 0,
    end: 100,
    uppercase: false
  }
}

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config
  const text = String(config.text || '')

  // 操作集合（互斥组合，按优先级执行）
  const ops: string[] = []
  const addOp = (name: string, condition: boolean) => {
    if (condition) ops.push(name)
  }

  addOp('upper', config.uppercase === true)
  addOp('lower', config.lowercase === true)
  addOp('trim', config.trim === true)

  let result = text
  let parts: string[] | undefined

  const operation = String(config.operation || '')

  if (operation === 'replace') {
    const search = String(config.search || '')
    if (!search) throw new Error('替换操作需要填写 search（查找内容）')
    const replacement = String(config.replacement ?? '')
    result = result.split(search).join(replacement)
    ctx.logger(`替换 "${search}" → "${replacement}"`)
  } else if (operation === 'split') {
    const separator = String(config.separator || ',')
    parts = result.split(separator)
    result = parts.join(separator)
    ctx.logger(`按 "${separator}" 切分为 ${parts.length} 段`)
  } else if (operation === 'slice') {
    const start = Number(config.start ?? 0)
    const end = Number(config.end ?? result.length)
    result = result.slice(start, end)
    ctx.logger(`截取 [${start}, ${end})`)
  } else if (operation === 'join') {
    // 输入为数组时拼接
    const inputArr = ctx.inputs[Object.keys(ctx.inputs)[0]] as unknown
    const separator = String(config.separator || '')
    if (Array.isArray(inputArr)) {
      result = inputArr.map(String).join(separator)
    } else {
      throw new Error('join 操作需要上游输入为数组')
    }
  } else if (operation === 'regex') {
    const pattern = String(config.pattern || '')
    const flags = String(config.flags || 'g')
    if (!pattern) throw new Error('正则操作需要填写 pattern')
    try {
      const re = new RegExp(pattern, flags)
      const matches = result.match(re)
      parts = matches || []
      result = matches ? matches.join('\n') : ''
      ctx.logger(`正则匹配 ${matches?.length ?? 0} 处`)
    } catch (err) {
      throw new Error(`正则表达式无效: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else if (operation !== 'trim' && operation !== 'none') {
    throw new Error(`未知的操作类型: ${operation}`)
  }

  if (ops.includes('upper')) result = result.toUpperCase()
  if (ops.includes('lower')) result = result.toLowerCase()
  if (ops.includes('trim')) result = result.trim()

  return {
    text: result,
    parts,
    length: result.length
  }
}
