import type { NodeContext, NodeExecuteFn } from '@shared/node'

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const left = ctx.config.left ?? ctx.inputs.left ?? ''
  const right = ctx.config.right ?? ctx.inputs.right ?? ''
  const operator = (ctx.config.operator as string) || 'equals'

  ctx.logger(`条件判断: ${String(left)} ${operator} ${String(right)}`)

  let result = false

  switch (operator) {
    case 'equals':
    case '==':
      result = String(left) === String(right)
      break
    case 'not_equals':
    case '!=':
      result = String(left) !== String(right)
      break
    case 'contains':
      result = String(left).includes(String(right))
      break
    case 'greater':
    case '>':
      result = Number(left) > Number(right)
      break
    case 'less':
    case '<':
      result = Number(left) < Number(right)
      break
    case 'greater_or_equal':
    case '>=':
      result = Number(left) >= Number(right)
      break
    case 'less_or_equal':
    case '<=':
      result = Number(left) <= Number(right)
      break
    case 'is_empty':
      result = !left || String(left).trim() === ''
      break
    case 'is_not_empty':
      result = Boolean(left) && String(left).trim() !== ''
      break
    default:
      throw new Error(`不支持的运算符: ${operator}`)
  }

  ctx.logger(`结果: ${result}`)

  return {
    result,
    branch: result ? 'true' : 'false'
  }
}
