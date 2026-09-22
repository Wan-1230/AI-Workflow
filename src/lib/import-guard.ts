import { validateWorkflow } from '@shared/validator'
import type { WorkflowDefinition } from '@shared/workflow'

/**
 * 导入判定。
 *
 * 以前导入只看有没有 nodes 数组，坏结构会一路走进画布：未知类型被兜底成通用节点、
 * 悬空连线照原样接收，最后在某次运行时才炸 —— 那时已经看不出是导入的问题了。
 * 校验器早就存在（执行前会用），这里只是把它提前到"落地画布之前"。
 */

export const MAX_REPORT_ITEMS = 6

export interface ImportVerdict {
  ok: boolean
  /** 直接可用于提示层的标题 */
  title: string
  /** 结构错误的可读清单（已截断） */
  detail: string
  /** 通过但有提醒时给出，不阻断导入 */
  warnings: string
  /** 解析后的定义，仅在 ok 时有值 */
  workflow: WorkflowDefinition | null
}

export function reportOf(messages: string[], cap = MAX_REPORT_ITEMS): string {
  if (messages.length === 0) return ''
  const shown = messages.slice(0, cap)
  const rest = messages.length - shown.length
  return rest > 0 ? `${shown.join('；')}（另有 ${rest} 条）` : shown.join('；')
}

export function judgeImport(raw: unknown): ImportVerdict {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, title: '导入失败', detail: '文件内容不是一个工作流对象', warnings: '', workflow: null }
  }
  const candidate = raw as WorkflowDefinition
  if (!Array.isArray(candidate.nodes)) {
    return { ok: false, title: '导入失败', detail: '缺少 nodes 数组，可能不是本工具导出的文件', warnings: '', workflow: null }
  }

  const result = validateWorkflow(candidate)
  if (!result.valid) {
    const lines = result.errors.map(i =>
      [i.nodeId ? `节点 ${i.nodeId}` : '', i.field ? `字段 ${i.field}` : '', i.message]
        .filter(Boolean)
        .join(' · ')
    )
    return {
      ok: false,
      title: `工作流结构不合法（${result.errors.length} 处），已拒绝导入`,
      detail: reportOf(lines),
      warnings: '',
      workflow: null
    }
  }

  return {
    ok: true,
    title: `已导入「${candidate.name || '未命名工作流'}」`,
    detail: '',
    warnings: result.warnings.length
      ? `${result.warnings.length} 条提醒：${reportOf(result.warnings.map(i =>
          [i.nodeId ? `节点 ${i.nodeId}` : '', i.message].filter(Boolean).join(' · ')
        ), 3)}`
      : '',
    workflow: candidate
  }
}
