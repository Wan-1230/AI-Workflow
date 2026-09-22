import type { NodeContext, NodeExecuteFn } from '@shared/node'


/**
 * 解析循环的数组来源。
 *
 * 导出给引擎的新式逐项执行复用，避免"配置怎么变成一个数组"这件事存在两份实现。
 * 两条入口此前被写成互斥分支：只填 config.items 时 itemsSource 为空，整段解析被跳过，
 * 于是循环静默产出 0 项且状态为 success。现改为按优先级依次尝试。
 */
export function resolveLoopItems(
  config: Record<string, unknown>,
  inputs: Record<string, unknown>,
  logger: (msg: string) => void
): unknown[] {
  let items: unknown[] = []
  const raw = config.items

  if (Array.isArray(raw)) {
    items = raw
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) items = parsed
      else logger('config.items 不是 JSON 数组，已忽略')
    } catch {
      logger('config.items 不是合法 JSON，已忽略')
    }
  }

  if (items.length === 0 && config.itemsSource) {
    // itemsSource 形如 {{nodeId.data}}，executor 已完成插值
    const source = String(config.itemsSource)
    const key = source.replace(/^\{\{|\}\}$/g, '')
    const fromInputs = inputs[key] ?? inputs[Object.keys(inputs)[0]]

    if (Array.isArray(fromInputs)) {
      items = fromInputs
    } else if (typeof fromInputs === 'string') {
      try {
        const parsed: unknown = JSON.parse(fromInputs)
        if (Array.isArray(parsed)) items = parsed
      } catch { /* 非 JSON，交由下方空结果分支处理 */ }
    } else if (fromInputs && typeof fromInputs === 'object') {
      // 插值结果可能是已解析的对象：单值按一项处理，避免"看着有数据却循环 0 次"
      items = [fromInputs]
    }

    if (items.length === 0 && fromInputs !== undefined && source !== '{{input}}') {
      logger(`itemsSource "${source}" 未解析出数组，循环将不执行任何迭代`)
    }
  }

  return items
}

/**
 * 旧式循环节点：画布上没有循环体时引擎才会走到这里，等价于"逐项渲染模板"。
 * 有循环体时由 `engine/index.ts#executeLoop` 逐项驱动子图，本函数不参与。
 */
export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config

  const items = resolveLoopItems(config, ctx.inputs, msg => ctx.logger(msg))

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
