/**
 * 定高列表的可视区间计算。
 *
 * 运行日志以前是全量 .map：一次长运行几千行时，每次事件都要重排几千个 DOM。
 * 这里只算"该渲染哪几行"，不引第三方虚拟列表 —— 日志行本来就是定高的。
 */

export interface VirtualWindow {
  first: number
  last: number
  /** 顶部垫高，让滚动条长度与总行数一致 */
  padTop: number
  padBottom: number
}

export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  total: number,
  rowHeight: number,
  /** 上下各多渲染几行，快速滚动时不出现空白 */
  overscan = 6
): VirtualWindow {
  if (total <= 0 || rowHeight <= 0) {
    return { first: 0, last: -1, padTop: 0, padBottom: 0 }
  }
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2
  const last = Math.min(total - 1, first + visibleCount - 1)
  return {
    first,
    last,
    padTop: first * rowHeight,
    padBottom: Math.max(0, (total - 1 - last) * rowHeight)
  }
}

/**
 * 是否应当自动滚到底。
 *
 * 用户往上翻看早期日志时，新日志不该把他拽回底部 —— 以前的实现是无条件跟随。
 */
export function shouldFollowBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  tolerance = 48
): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= tolerance
}
