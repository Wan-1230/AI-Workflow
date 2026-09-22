/**
 * 焦点陷阱与菜单键盘导航的纯计算部分。
 *
 * DOM 事件本身不值得为它引入 jsdom，但"下一个该聚焦谁"是会写错的逻辑：
 * Tab 在末尾要回到开头、Shift+Tab 在开头要到末尾、空列表不能 NaN。
 */

export const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

/** 环形前进：shift 为反向；空列表返回 -1 */
export function nextIndex(total: number, current: number, shift: boolean): number {
  if (total <= 0) return -1
  if (current < 0) return shift ? total - 1 : 0
  return shift ? (current - 1 + total) % total : (current + 1) % total
}

/**
 * 判断一次 keydown 是否需要由陷阱接管。
 * 返回 'trap' 表示焦点应环形移动，'escape' 表示应关闭，null 表示放行。
 */
export function trapDecision(
  key: string,
  shiftKey: boolean,
  inside: boolean
): 'trap' | 'escape' | null {
  if (key === 'Escape') return 'escape'
  if (key !== 'Tab') return null
  // 焦点已经跑到弹层外面（例如浏览器地址栏）时，把它拉回来
  return inside ? null : 'trap'
}

/** 菜单的方向键索引：ArrowDown/Up 逐格，Home/End 跳首尾 */
export function menuIndexMove(
  key: string,
  current: number,
  total: number
): number | null {
  if (total <= 0) return null
  switch (key) {
    case 'ArrowDown': return nextIndex(total, current, false)
    case 'ArrowUp': return nextIndex(total, current, true)
    case 'Home': return 0
    case 'End': return total - 1
    default: return null
  }
}
