/**
 * 运行日志缓冲。
 *
 * 以前是一条无界数组，而且每个 node:complete 把整个输出对象挂在行上：
 * 一次长运行（尤其带循环）能把渲染进程内存吃掉一大截，而界面只显示几百行。
 * 这里同时改掉两件事：限行数、只留截断预览。
 */

export const MAX_LOG_LINES = 2000
export const OUTPUT_PREVIEW_CHARS = 2048

export interface LogLine {
  nodeId: string
  message: string
  timestamp: number
  /** 完整输出不再驻留内存，只留截断预览 */
  outputPreview?: string
  truncated?: boolean
}

export interface LogBuffer {
  lines: LogLine[]
  /** 被丢弃的最旧行数；用于在界面上说明"前面还有 N 条" */
  dropped: number
}

export const EMPTY_LOG: LogBuffer = { lines: [], dropped: 0 }

/** 预览序列化：循环引用与超大对象都不能把日志缓冲拖垮 */
export function previewOf(output: unknown, limit = OUTPUT_PREVIEW_CHARS): { text: string; truncated: boolean } {
  let text: string
  try {
    text = typeof output === 'string' ? output : JSON.stringify(output) ?? String(output)
  } catch {
    text = '[无法序列化的输出]'
  }
  if (text.length <= limit) return { text, truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

export function appendLog(buffer: LogBuffer, line: LogLine, cap = MAX_LOG_LINES): LogBuffer {
  const lines = [...buffer.lines, line]
  if (lines.length <= cap) return { lines, dropped: buffer.dropped }
  const overflow = lines.length - cap
  return { lines: lines.slice(overflow), dropped: buffer.dropped + overflow }
}

/** 追加一条系统行（无 nodeId）；用于截断提示这类"关于日志的日志" */
export function systemLine(message: string, timestamp = Date.now()): LogLine {
  return { nodeId: '', message, timestamp }
}
