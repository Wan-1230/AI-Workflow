import type { ExecutionStatus } from './workflow-store'
import { appendLog, previewOf, type LogBuffer, type LogLine } from './log-buffer'

/**
 * 运行事件的归约。
 *
 * 原来一个 node:start 会连做两次 set（改状态 + 加日志），画布上每个节点
 * 又都订阅整个 store，于是一次运行把整张图重渲染 2N 次。归约成"一个事件
 * 一个新状态"之后，事件通道只提交一次；再配合窄选择器才真正止住重渲染。
 */

export interface ExecutionSnapshot {
  nodeStatuses: Record<string, ExecutionStatus>
  logBuffer: LogBuffer
  streamTexts: Record<string, string>
  streamingNodeId: string | null
}

/** 与 window.api.onExecutionUpdate 的事件形状对齐，避免依赖 preload 类型 */
export interface RuntimeEvent {
  type: string
  nodeId?: string
  data?: unknown
  timestamp?: number
}

export const INITIAL_SNAPSHOT: ExecutionSnapshot = {
  nodeStatuses: {},
  logBuffer: { lines: [], dropped: 0 },
  streamTexts: {},
  streamingNodeId: null
}

export function emptyStatuses(nodeIds: string[]): Record<string, ExecutionStatus> {
  return Object.fromEntries(nodeIds.map(id => [id, 'idle' as ExecutionStatus]))
}

function messageOf(event: RuntimeEvent): string | undefined {
  const data = event.data as { message?: string; error?: string } | undefined
  return data?.message ?? data?.error
}

/**
 * 归约一个事件，返回新快照；不需要变更时返回 null（避免无意义的 set）。
 * node:stream 不在这里处理 —— 它要按帧合并，见 stream-queue.ts。
 */
export function reduceEvent(
  snap: ExecutionSnapshot,
  event: RuntimeEvent
): ExecutionSnapshot | null {
  const id = event.nodeId
  if (!id) return null

  switch (event.type) {
    case 'node:start':
      return withLog(
        { ...snap, nodeStatuses: { ...snap.nodeStatuses, [id]: 'running' } },
        id,
        '开始执行...',
        event.timestamp
      )
    case 'node:complete': {
      const output = event.data as Record<string, unknown> | undefined
      return withLog(
        { ...snap, nodeStatuses: { ...snap.nodeStatuses, [id]: 'success' } },
        id,
        '执行成功',
        event.timestamp,
        output
      )
    }
    case 'node:error':
      return withLog(
        { ...snap, nodeStatuses: { ...snap.nodeStatuses, [id]: 'error' } },
        id,
        `执行失败: ${messageOf(event) || '未知错误'}`,
        event.timestamp
      )
    case 'node:cancelled':
      return withLog(
        { ...snap, nodeStatuses: { ...snap.nodeStatuses, [id]: 'cancelled' } },
        id,
        '已取消',
        event.timestamp
      )
    case 'node:skipped': {
      // 分支未命中或按 skip 策略降级：必须落到终态，否则节点永远停在 running
      const reason = (event.data as { error?: string } | undefined)?.error
      return withLog(
        { ...snap, nodeStatuses: { ...snap.nodeStatuses, [id]: 'skipped' } },
        id,
        reason ? `已跳过：${reason}` : '已跳过',
        event.timestamp
      )
    }
    case 'node:log': {
      const msg = messageOf(event)
      return msg ? withLog(snap, id, msg, event.timestamp) : null
    }
    default:
      return null
  }
}

function withLog(
  snap: ExecutionSnapshot,
  nodeId: string,
  message: string,
  timestamp: number | undefined,
  output?: Record<string, unknown>
): ExecutionSnapshot {
  const line: LogLine = { nodeId, message, timestamp: timestamp ?? Date.now() }
  if (output) {
    const preview = previewOf(output)
    line.outputPreview = preview.text
    if (preview.truncated) line.truncated = true
  }
  return { ...snap, logBuffer: appendLog(snap.logBuffer, line) }
}
