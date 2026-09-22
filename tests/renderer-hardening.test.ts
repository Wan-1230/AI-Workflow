import { describe, it, expect } from 'vitest'
import { appendLog, previewOf, EMPTY_LOG, MAX_LOG_LINES, type LogLine } from '../src/stores/log-buffer'
import { reduceEvent, INITIAL_SNAPSHOT, emptyStatuses, type ExecutionSnapshot } from '../src/stores/execution-events'
import { createStreamQueue, microtaskSchedule } from '../src/stores/stream-queue'
import { visibleRange, shouldFollowBottom } from '../src/stores/virtual-range'
import { nextIndex, menuIndexMove, trapDecision, FOCUSABLE } from '../src/lib/focus-trap'
import { judgeImport, reportOf } from '../src/lib/import-guard'

/**
 * 渲染层里被下沉成纯函数的那部分逻辑。
 *
 * 引入 jsdom 只为测一个 focus() 不值得；但这些逻辑确实会写错：
 * 环形索引在空列表上返回 -1、日志封顶丢错方向、自动跟随把用户拽回底部，
 * 都是"看起来正常、用起来怪"的那类问题。
 */

const line = (message: string): LogLine => ({ nodeId: 'n1', message, timestamp: 1000 })

describe('日志缓冲', () => {
  it('未触顶时原样追加，dropped 保持 0', () => {
    const next = appendLog(EMPTY_LOG, line('a'))
    expect(next.lines.map(l => l.message)).toEqual(['a'])
    expect(next.dropped).toBe(0)
  })

  it('触顶后丢最旧，并累计被丢弃的条数', () => {
    let buf = EMPTY_LOG
    for (let i = 0; i < MAX_LOG_LINES + 25; i++) buf = appendLog(buf, line(`m${i}`))
    expect(buf.lines).toHaveLength(MAX_LOG_LINES)
    expect(buf.dropped).toBe(25)
    expect(buf.lines[0].message).toBe('m25')
    expect(buf.lines.at(-1)?.message).toBe(`m${MAX_LOG_LINES + 24}`)
  })

  it('输出预览截断到会显示的长度，并标记 truncated', () => {
    const big = previewOf({ text: 'x'.repeat(9000) })
    expect(big.text.length).toBeLessThanOrEqual(2048)
    expect(big.truncated).toBe(true)
  })

  it('循环引用的对象不把日志层拖崩', () => {
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    const p = previewOf(cyclic)
    expect(typeof p.text).toBe('string')
    expect(p.text.length).toBeGreaterThan(0)
  })

  it('字符串输出原样预览，不再套一层 JSON 引号', () => {
    expect(previewOf('plain').text).toBe('plain')
  })
})

describe('事件归约', () => {
  it('一个事件同时落状态与日志，只产出一份新快照', () => {
    const next = reduceEvent(INITIAL_SNAPSHOT, { type: 'node:start', nodeId: 'a', timestamp: 5 })
    expect(next?.nodeStatuses.a).toBe('running')
    expect(next?.logBuffer.lines).toHaveLength(1)
    expect(next?.logBuffer.lines[0]?.message).toBe('开始执行...')
  })

  it('node:complete 只留输出预览，不留对象', () => {
    const next = reduceEvent(INITIAL_SNAPSHOT, {
      type: 'node:complete', nodeId: 'a', timestamp: 6, data: { text: 'hi' }
    })
    const l = next?.logBuffer.lines[0]
    expect(l?.outputPreview).toContain('hi')
    expect('output' in (l ?? {})).toBe(false)
  })

  it('skipped 带原因，cancelled 与 error 各归其位', () => {
    const base: ExecutionSnapshot = { ...INITIAL_SNAPSHOT, nodeStatuses: emptyStatuses(['a', 'b', 'c']) }
    expect(reduceEvent(base, { type: 'node:skipped', nodeId: 'a', data: { error: '上游失败' } })
      ?.logBuffer.lines[0]?.message).toBe('已跳过：上游失败')
    expect(reduceEvent(base, { type: 'node:cancelled', nodeId: 'b' })?.nodeStatuses.b).toBe('cancelled')
    expect(reduceEvent(base, { type: 'node:error', nodeId: 'c', data: { error: 'boom' } })
      ?.logBuffer.lines[0]?.message).toBe('执行失败: boom')
  })

  it('无关事件与缺 nodeId 的事件返回 null，避免空转 set', () => {
    expect(reduceEvent(INITIAL_SNAPSHOT, { type: 'workflow:complete' })).toBe(null)
    expect(reduceEvent(INITIAL_SNAPSHOT, { type: 'node:start' })).toBe(null)
    expect(reduceEvent(INITIAL_SNAPSHOT, { type: 'node:log', nodeId: 'a', data: {} })).toBe(null)
  })

  it('node:log 不影响节点状态', () => {
    const next = reduceEvent(INITIAL_SNAPSHOT, {
      type: 'node:log', nodeId: 'a', timestamp: 3, data: { message: '循环完成：3 项迭代' }
    })
    expect(next?.nodeStatuses).toEqual({})
    expect(next?.logBuffer.lines[0]?.message).toBe('循环完成：3 项迭代')
  })
})

type StreamBatch = { nodeId: string; full: string; done?: boolean }[]

describe('流式增量按帧合并', () => {
  it('同一帧内同一节点的多次增量只提交最后一次', async () => {
    const commits: StreamBatch[] = []
    const q = createStreamQueue(batch => commits.push(batch), microtaskSchedule)
    q.push({ nodeId: 'a', full: '你' })
    q.push({ nodeId: 'a', full: '你好' })
    q.push({ nodeId: 'a', full: '你好世界' })
    await Promise.resolve()
    expect(commits).toHaveLength(1)
    expect(commits[0]).toEqual([{ nodeId: 'a', full: '你好世界' }])
  })

  it('不同节点各自保留，互不覆盖', async () => {
    const commits: StreamBatch[] = []
    const q = createStreamQueue(batch => commits.push(batch), microtaskSchedule)
    q.push({ nodeId: 'a', full: 'A' })
    q.push({ nodeId: 'b', full: 'B' })
    await Promise.resolve()
    expect(commits[0]?.map(u => u.nodeId).sort()).toEqual(['a', 'b'])
  })

  it('flush 立即结算，退订前不会丢最后一帧', () => {
    const seen: string[] = []
    const q = createStreamQueue(batch => batch.forEach(u => seen.push(u.full)), microtaskSchedule)
    q.push({ nodeId: 'a', full: '尾巴' })
    q.flush()
    expect(seen).toEqual(['尾巴'])
    expect(q.size()).toBe(0)
  })

  it('done 标记不被同帧的中间态覆盖', async () => {
    const commits: StreamBatch[] = []
    const q = createStreamQueue(batch => commits.push(batch), microtaskSchedule)
    q.push({ nodeId: 'a', full: '完整回答', done: true })
    q.push({ nodeId: 'a', full: '完整回答' })
    await Promise.resolve()
    expect(commits[0]?.[0]?.done).toBe(true)
  })
})


describe('虚拟列表区间', () => {
  const ROW = 28
  const VIEW = 160

  it('顶部滚动时从 0 开始且不产生负 padding', () => {
    const r = visibleRange(0, VIEW, 500, ROW, 2)
    expect(r.first).toBe(0)
    expect(r.padTop).toBe(0)
    expect(r.last).toBeGreaterThan(r.first)
  })

  it('滚到中间时窗口跟着走，首尾各留缓冲', () => {
    const r = visibleRange(ROW * 100, VIEW, 500, ROW, 2)
    expect(r.first).toBe(98)
    expect(r.padTop).toBe(98 * ROW)
    expect(r.padBottom).toBe((500 - 1 - r.last) * ROW)
  })

  it('滚到底部不越界', () => {
    const r = visibleRange(ROW * 499, VIEW, 500, ROW, 2)
    expect(r.last).toBe(499)
    expect(r.padBottom).toBe(0)
  })

  it('空列表给出空窗口而不是 NaN', () => {
    const r = visibleRange(0, VIEW, 0, ROW)
    expect(r.first).toBe(0)
    expect(r.last).toBe(-1)
    expect(r.padTop + r.padBottom).toBe(0)
  })

  it('自动跟随只在贴底时生效，用户上翻后不再被拽走', () => {
    expect(shouldFollowBottom(0, 1000, 200)).toBe(false)
    expect(shouldFollowBottom(800, 1000, 200)).toBe(true)
    expect(shouldFollowBottom(770, 1000, 200)).toBe(true)
  })
})

describe('焦点与菜单键盘', () => {
  it('环形前进/后退在边界回绕', () => {
    expect(nextIndex(3, 0, false)).toBe(1)
    expect(nextIndex(3, 2, false)).toBe(0)
    expect(nextIndex(3, 0, true)).toBe(2)
  })

  it('空列表返回 -1，不返回 NaN', () => {
    expect(nextIndex(0, 0, false)).toBe(-1)
  })

  it('焦点尚未进入列表时，前进落到首项、后退落到末项', () => {
    expect(nextIndex(4, -1, false)).toBe(0)
    expect(nextIndex(4, -1, true)).toBe(3)
  })

  it('菜单方向键：逐格、Home、End，越界返回 null', () => {
    expect(menuIndexMove('ArrowDown', 0, 3)).toBe(1)
    expect(menuIndexMove('ArrowUp', 0, 3)).toBe(2)
    expect(menuIndexMove('Home', 1, 3)).toBe(0)
    expect(menuIndexMove('End', 1, 3)).toBe(2)
    expect(menuIndexMove('Enter', 1, 3)).toBe(null)
    expect(menuIndexMove('ArrowDown', -1, 0)).toBe(null)
  })

  it('Escape 关闭，焦点在外时接管 Tab，在内时放行', () => {
    expect(trapDecision('Escape', false, true)).toBe('escape')
    expect(trapDecision('Tab', false, false)).toBe('trap')
    expect(trapDecision('Tab', true, true)).toBe(null)
    expect(trapDecision('a', false, false)).toBe(null)
  })

  it('可聚焦选择器覆盖表单控件并排除禁用项', () => {
    expect(FOCUSABLE).toContain('button:not([disabled])')
    expect(FOCUSABLE).toContain('[tabindex]:not([tabindex="-1"])')
  })
})

describe('导入判定', () => {
  const good = {
    id: 'w', name: '好使的', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    nodes: [{ id: 't', type: 'manual-trigger', label: 't', position: { x: 0, y: 0 }, config: {} }],
    edges: []
  }

  it('正常文件通过并带回定义', () => {
    const v = judgeImport(good)
    expect(v.ok).toBe(true)
    expect(v.workflow?.name).toBe('好使的')
  })

  it('未知节点类型在导入阶段就被拒绝，而不是落地后伪装成通用节点', () => {
    const v = judgeImport({
      ...good,
      nodes: [{ id: 'x', type: 'definitely-not-a-node', label: 'x', position: { x: 0, y: 0 }, config: {} }]
    })
    expect(v.ok).toBe(false)
    expect(v.detail).toContain('x')
    expect(v.workflow).toBe(null)
  })

  it('悬空连线被拒绝', () => {
    const v = judgeImport({
      ...good,
      edges: [{ id: 'e1', source: 't', target: 'ghost' }]
    })
    expect(v.ok).toBe(false)
    expect(v.detail).toMatch(/ghost/)
  })

  it('非工作流对象与缺 nodes 分别给出不同说法', () => {
    expect(judgeImport([1, 2]).detail).toContain('不是一个工作流对象')
    expect(judgeImport({ name: 'x' }).detail).toContain('nodes')
  })

  it('可执行但有问题时放行并带提醒', () => {
    const v = judgeImport({
      ...good,
      nodes: [
        ...good.nodes,
        { id: 'n', type: 'notification', label: 'n', position: { x: 1, y: 0 }, config: { message: '{{t.nope}}', level: 'info' } }
      ],
      edges: [{ id: 'e1', source: 't', target: 'n' }]
    })
    expect(v.ok).toBe(true)
    expect(v.warnings).toContain('提醒')
  })

  it('清单过长时截断并说明还有几条', () => {
    expect(reportOf(['a', 'b', 'c'], 2)).toBe('a；b（另有 1 条）')
    expect(reportOf([], 2)).toBe('')
  })
})

describe('窄选择器返回值稳定', () => {
  it('无关节点的状态变化不该改变本节点的选取结果', () => {
    const select = (snap: ExecutionSnapshot, id: string): string => snap.nodeStatuses[id] ?? 'idle'
    const before = select(INITIAL_SNAPSHOT, 'a')
    const after = reduceEvent(INITIAL_SNAPSHOT, { type: 'node:start', nodeId: 'b' })
    expect(after).not.toBeNull()
    expect(select(after!, 'a')).toBe(before)
  })
})
