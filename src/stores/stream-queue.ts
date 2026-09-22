/**
 * LLM 流式增量的按帧合并。
 *
 * 模型是逐 token 推事件的，直接每个 token set 一次 store，等于让整张画布
 * 每出现一个字就重渲染一次。文本累积本身是幂等的（引擎给的是 full 全量），
 * 所以同一帧内只保留最后一次，视觉上完全无损。
 */

export interface StreamUpdate {
  nodeId: string
  /** 累计全文，不是增量 */
  full: string
  done?: boolean
}

export type Scheduler = (run: () => void) => void

/** 测试与无 rAF 环境下用微任务；浏览器里用 requestAnimationFrame */
export const microtaskSchedule: Scheduler = run => {
  void Promise.resolve().then(run)
}

export const rafSchedule: Scheduler = run => {
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame
  if (typeof raf === 'function') raf(run)
  else void Promise.resolve().then(run)
}

export interface StreamQueue {
  push(update: StreamUpdate): void
  /** 立即结算（运行结束、取消、组件卸载时必须调用，否则最后一帧会丢） */
  flush(): void
  size(): number
}

export function createStreamQueue(
  commit: (updates: StreamUpdate[]) => void,
  schedule: Scheduler = rafSchedule
): StreamQueue {
  const pending = new Map<string, StreamUpdate>()
  let scheduled = false

  const drain = (): void => {
    scheduled = false
    if (pending.size === 0) return
    const batch = [...pending.values()]
    pending.clear()
    commit(batch)
  }

  return {
    push(update) {
      const existing = pending.get(update.nodeId)
      // done 必须保留：它是"这条流结束了"的信号，不能被后到的中间态覆盖掉
      pending.set(update.nodeId, existing
        ? { nodeId: update.nodeId, full: update.full, done: update.done || existing.done }
        : update)
      if (update.done || !scheduled) {
        scheduled = true
        schedule(drain)
      }
    },
    flush: drain,
    size: () => pending.size
  }
}
