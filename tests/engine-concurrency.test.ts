import { describe, it, expect, afterEach, vi } from 'vitest'
import { WorkflowEngine } from '../electron/engine/index'
import type { WorkflowDefinition } from '@shared/workflow'

/**
 * 取消的精确性与执行策略的实际效力。
 *
 * 主进程曾用单个模块变量保存"当前执行 id"，两次快速点击运行互相覆盖，
 * 取消因此可能打到另一条运行上。这里锁住 id 隔离这一层。
 */

const engine = new WorkflowEngine()

function wf(): WorkflowDefinition {
  return {
    id: 'wf-conc',
    name: '并发',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    nodes: [
      { id: 't', type: 'manual-trigger', label: 't', position: { x: 0, y: 0 }, config: {} },
      {
        id: 'h', type: 'http-request', label: 'h', position: { x: 140, y: 0 },
        config: { url: 'https://example.com', method: 'GET', headers: '{}' },
        executionConfig: { timeout: 5000 }
      }
    ],
    edges: [{ id: 'e1', source: 't', target: 'h' }]
  }
}

const okFetch = () => vi.fn(async () => {
  await new Promise(resolve => setTimeout(resolve, 40))
  return {
    ok: true, status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ ok: 1 })
  }
})

afterEach(() => vi.unstubAllGlobals())

describe('取消按 executionId 精确命中', () => {
  it('取消未登记的 id 返回 false，且不打断正在运行的执行', async () => {
    vi.stubGlobal('fetch', okFetch())

    const done = engine.execute(wf(), () => undefined, 'run-a')

    expect(engine.cancel('run-nope')).toBe(false)
    expect(engine.cancel('run-b')).toBe(false)

    const results = await done
    expect([...results.values()].every(r => r.status === 'success')).toBe(true)
  })

  it('两条执行并发运行时互不污染', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++
      await new Promise(resolve => setTimeout(resolve, 30))
      return {
        ok: true, status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ seq: calls })
      }
    }))

    const [ra, rb] = await Promise.all([
      engine.execute(wf(), () => undefined, 'par-a'),
      engine.execute(wf(), () => undefined, 'par-b')
    ])

    expect(calls).toBe(2)
    expect(ra.get('h')?.status).toBe('success')
    expect(rb.get('h')?.status).toBe('success')
  })
})

describe('执行策略真实生效', () => {
  it('skip 策略下失败节点不带走后继', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    const definition: WorkflowDefinition = {
      id: 'wf-skip', name: '跳过',
      createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
      nodes: [
        { id: 't', type: 'manual-trigger', label: 't', position: { x: 0, y: 0 }, config: {} },
        {
          id: 'h', type: 'http-request', label: 'h', position: { x: 140, y: 0 },
          config: { url: 'https://example.com', method: 'GET', headers: '{}' },
          executionConfig: { onError: 'skip', timeout: 1000, retry: { maxRetries: 1, interval: 10 } }
        },
        { id: 'n', type: 'notification', label: 'n', position: { x: 280, y: 0 }, config: { message: '仍然到达', level: 'info' } }
      ],
      edges: [
        { id: 'e1', source: 't', target: 'h' },
        { id: 'e2', source: 'h', target: 'n' }
      ]
    }

    const results = await engine.execute(definition, () => undefined, 'exec-skip')
    expect(results.get('h')?.status).toBe('skipped')
    expect(results.get('n')?.status).toBe('success')
  })
})
