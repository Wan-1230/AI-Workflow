import type { NodeContext, NodeExecuteFn } from '@shared/node'


/**
 * 循环节点：对输入数组逐项执行模板渲染
 * - itemsSource：上游节点输出引用（如 {{http.data}}），解析后须为数组
 * - template：每项渲染模板，支持 {{item}} / {{item.field}} / {{index}} / {{count}}
 * - 输出 results 数组供下游使用，或配合 {{loopNode.results[i]}} 访问单项
 */
export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config

  // 解析数组来源。两条入口此前被写成互斥分支：只填 config.items（目录里明写的
  // 「或直接填数组 (JSON)」）时 itemsSource 为空，整段解析被跳过，
  // 于是循环静默产出 0 项且状态为 success。现改为按优先级依次尝试。
  let items: unknown[] = []
  const raw = config.items

  if (Array.isArray(raw)) {
    items = raw
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) items = parsed
      else ctx.logger('config.items 不是 JSON 数组，已忽略')
    } catch {
      ctx.logger('config.items 不是合法 JSON，已忽略')
    }
  }

  if (items.length === 0 && config.itemsSource) {
    // itemsSource 形如 {{nodeId.data}}，executor 已完成插值
    const source = String(config.itemsSource)
    const key = source.replace(/^\{\{|\}\}$/g, '')
    const fromInputs = ctx.inputs[key] ?? ctx.inputs[Object.keys(ctx.inputs)[0]]

    if (Array.isArray(fromInputs)) {
      items = fromInputs
    } else if (typeof fromInputs === 'string') {
      try {
        const parsed: unknown = JSON.parse(fromInputs)
        if (Array.isArray(parsed)) items = parsed
      } catch { /* 非 JSON，交由下方空结果分支处理 */ }
    }

    if (items.length === 0 && fromInputs !== undefined && source !== '{{input}}') {
      ctx.logger(`itemsSource "${source}" 未解析出数组，循环将不执行任何迭代`)
    }
  }

  if (items.length === 0) {
    ctx.logger('循环输入为空数组，输出空结果')
    return { results: [], count: 0, items: [] }
  }

  const template = String(config.template || '{{item}}')
  const mode = String(config.mode || 'template')

  const results: unknown[] = []
  for (let i = 0; i < items.length; i++) {
    if (ctx.signal?.aborted) throw new Error('执行已取消')

    const item = items[i]
    const itemValue = typeof item === 'object' && item !== null
      ? (item as Record<string, unknown>)
      : { value: item }

    if (mode === 'template') {
      // 渲染模板：支持 {{item}} / {{item.field}} / {{index}} / {{count}}
      let rendered = template
        .replaceAll('{{index}}', String(i))
        .replaceAll('{{count}}', String(items.length))

      const fieldPattern = /\{\{\s*item\.([\w.]+)\s*\}\}/g
      rendered = rendered.replace(fieldPattern, (_m, path: string) => {
        const value = getNested(itemValue, path)
        return value === undefined || value === null ? '' : String(value)
      })
      rendered = rendered.replaceAll('{{item}}', String(itemValue.value ?? item))
      results.push(rendered)
    } else {
      results.push(itemValue.value ?? item)
    }
  }

  ctx.logger(`循环完成：${items.length} 项迭代`)
  return {
    results,
    count: items.length,
    items
  }
}

function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
