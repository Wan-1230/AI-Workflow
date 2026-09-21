import { describe, it, expect, afterEach, vi } from 'vitest'
import { WorkflowEngine } from '../electron/engine/index'
import type { WorkflowDefinition, ExecutionEvent, NodeResult } from '@shared/workflow'

/**
 * S1 错误策略与中止传导。
 *
 * 重点验证两件事：失败不再无脑带走整条工作流；超时是真的把底层请求
 * abort 掉，而不是引擎单方面放弃等待（旧实现会留下在飞的孤儿请求）。
 */

const engine = new WorkflowEngine()

function wf(
  nodes: Array<{ id: string; type: string; config?: Record<string, unknown>; onError?: string; errorHandle?: string; timeout?: number; retry?: { maxRetries: number; interval: number } }>,
  links: Array<{ source: string; target: string; sourceHandle?: string }>
): WorkflowDefinition {
  return {
    id: 'wf-err',
    name: '错误策略',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    nodes: nodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      label: n.id,
      position: { x: i * 140, y: 0 },
      config: n.config ?? {},
      executionConfig: {
        timeout: n.timeout,
        retry: n.retry,
        onError: n.onError as never,
        errorHandle: n.errorHandle
      }
    })),
    edges: links.map((l, i) => ({ id: `e${i}`, source: l.source, target: l.target, sourceHandle: l.sourceHandle }))
  }
}

const failingFileRead = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'file-io',
  config: { mode: 'read', path: 'Z:/no-such-file-9f2b.txt', encoding: 'utf-8', content: '' },
  ...extra
})

async function run(definition: WorkflowDefinition, id = `exec_${Math.random()}`) {
  const events: ExecutionEvent[] = []
  const results = await engine.execute(definition, e => events.push(e), id)
  return { results, events }
}

const statusOf = (results: Map<string, NodeResult>, id: string) => results.get(id)?.status

afterEach(() => vi.unstubAllGlobals())

describe('错误策略', () => {
  it('缺省 stop：失败即中止，并发出 workflow:error 终态', async () => {
    const { results, events } = await run(wf(
      [{ id: 't', type: 'manual-trigger' }, failingFileRead('f'), { id: 'after', type: 'notification', config: { message: '不该执行', level: 'info' } }],
      [{ source: 't', target: 'f' }, { source: 'f', target: 'after' }]
    ))

    expect(statusOf(results, 'f')).toBe('error')
    expect(statusOf(results, 'after'), 'stop 策略下下游不应执行').toBe('skipped')
    expect(events.at(-1)?.type).toBe('workflow:error')
  })

  it('skip：失败节点降级为 skipped，其余分支照常跑完', async () => {
    const { results, events } = await run(wf(
      [
        { id: 't', type: 'manual-trigger' },
        failingFileRead('f', { onError: 'skip' }),
        { id: 'after', type: 'notification', config: { message: '我仍然执行了', level: 'info' } }
      ],
      [{ source: 't', target: 'f' }, { source: 'f', target: 'after' }]
    ))

    const f = results.get('f')
    expect(f?.status).toBe('skipped')
    expect(f?.error, 'skipped 仍需保留失败原因供排查').toBeTruthy()
    expect(statusOf(results, 'after')).toBe('success')
    expect(events.at(-1)?.type).toBe('workflow:complete')
  })

  it('error-branch：只激活错误出口的下游', async () => {
    const { results } = await run(wf(
      [
        { id: 't', type: 'manual-trigger' },
        failingFileRead('f', { onError: 'error-branch', errorHandle: 'error' }),
        { id: 'ok', type: 'notification', config: { message: '正常路径', level: 'info' } },
        { id: 'handler', type: 'notification', config: { message: '错误已处理', level: 'info' } }
      ],
      [
        { source: 't', target: 'f' },
        { source: 'f', target: 'ok', sourceHandle: 'true' },
        { source: 'f', target: 'handler', sourceHandle: 'error' }
      ]
    ))

    expect(statusOf(results, 'f')).toBe('error')
    expect(statusOf(results, 'handler'), '错误出口应被执行').toBe('success')
    expect(statusOf(results, 'ok'), '正常出口应被停用').toBe('skipped')
  })

  it('retry-then-skip：默认重试两次后降级，且超时不参与重试', async () => {
    const logs: string[] = []
    const definition = wf(
      [{ id: 't', type: 'manual-trigger' }, failingFileRead('f', { onError: 'retry-then-skip' })],
      [{ source: 't', target: 'f' }]
    )
    const results = await engine.execute(definition, e => {
      if (e.type === 'node:log') logs.push(String(e.data?.message))
    }, 'exec-retry')

    expect(statusOf(results, 'f')).toBe('skipped')
    const retryLogs = logs.filter(l => l.includes('重试'))
    expect(retryLogs).toHaveLength(2)
  })

  it('未执行的分支节点被补成 skipped 终态，不留悬空状态', async () => {
    const { results } = await run(wf(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'c', type: 'condition', config: { left: '1', right: '2', operator: 'equals' } },
        { id: 'yes', type: 'notification', config: { message: 'Y', level: 'info' } },
        { id: 'no', type: 'notification', config: { message: 'N', level: 'info' } }
      ],
      [
        { source: 't', target: 'c' },
        { source: 'c', target: 'yes', sourceHandle: 'true' },
        { source: 'c', target: 'no', sourceHandle: 'false' }
      ]
    ))

    // left=1 ≠ right=2 → 走 false 分支，yes 才是未被激活的那一侧
    expect(statusOf(results, 'no')).toBe('success')
    expect(statusOf(results, 'yes'), '未命中分支应补为 skipped').toBe('skipped')
    // 每个声明的节点都必须有终态
    expect(results.size).toBe(4)
  })
})

describe('超时中止传导', () => {
  it('超时后传给 fetch 的 signal 确实被 abort（不再留下在飞的孤儿请求）', async () => {
    let observedSignal: AbortSignal | null = null

    vi.stubGlobal('fetch', vi.fn((_input: unknown, init?: { signal?: AbortSignal }) => {
      observedSignal = init?.signal ?? null
      // 只有真正被 abort 才会 settle；否则该 promise 永不完成
      return new Promise((_resolve, reject) => {
        const onAbort = () => reject(new Error('aborted'))
        if (init?.signal?.aborted) return reject(new Error('already aborted'))
        init?.signal?.addEventListener('abort', onAbort, { once: true })
      })
    }))

    const { results } = await run(wf(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'h', type: 'http-request', timeout: 300, config: { url: 'https://example.com/slow', method: 'GET', headers: '{}' } }
      ],
      [{ source: 't', target: 'h' }]
    ))

    expect(observedSignal, 'http 节点未把 signal 传给 fetch').not.toBeNull()
    expect(observedSignal!.aborted, '超时未传导到底层请求').toBe(true)
    expect(results.get('h')?.error).toMatch(/超时/)
  })

  it('超时不触发重试，避免把等待时间成倍放大', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      calls++
      return new Promise((_resolve, reject) => setTimeout(() => reject(new Error('never')), 5000))
    }))

    await run(wf(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'h', type: 'http-request', timeout: 250, retry: { maxRetries: 3, interval: 10 }, config: { url: 'https://example.com/x', method: 'GET', headers: '{}' } }
      ],
      [{ source: 't', target: 'h' }]
    ))

    expect(calls, '超时后仍发起重试').toBe(1)
  })
})
