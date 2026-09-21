import { describe, it, expect, afterEach, vi } from 'vitest'
import { WorkflowEngine } from '../electron/engine/index'
import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'

function wf(
  nodes: Array<{ id: string; type: string; config?: Record<string, unknown> }>,
  links: Array<{ source: string; target: string; sourceHandle?: string }>
): WorkflowDefinition {
  return {
    id: 'wf-engine',
    name: '引擎执行测试',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    nodes: nodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      label: n.id,
      position: { x: i * 120, y: 0 },
      config: n.config ?? {}
    })),
    edges: links.map((l, i) => ({ id: `e${i}`, source: l.source, target: l.target, sourceHandle: l.sourceHandle }))
  }
}

function collect(): { events: ExecutionEvent[]; onEvent: (e: ExecutionEvent) => void } {
  const events: ExecutionEvent[] = []
  return { events, onEvent: e => events.push(e) }
}

afterEach(() => vi.unstubAllGlobals())

describe('引擎端到端执行（此路径此前从未进入任何产物）', () => {
  it('手动触发 → 通知：节点真实执行并产出成功终态', async () => {
    const engine = new WorkflowEngine()
    const { events, onEvent } = collect()
    const results = await engine.execute(
      wf(
        [
          { id: 't', type: 'manual-trigger' },
          { id: 'n', type: 'notification', config: { message: '工作流跑通了', level: 'info' } }
        ],
        [{ source: 't', target: 'n' }]
      ),
      onEvent
    )

    expect(results.get('t')?.status).toBe('success')
    expect(results.get('n')?.status).toBe('success')
    // 通知节点会给消息加级别前缀（📢/⚠️/❌），因此断言包含而非全等
    expect(String(results.get('n')?.output.message)).toContain('工作流跑通了')

    expect(events.some(e => e.type === 'node:start' && e.nodeId === 'n')).toBe(true)
    expect(events.some(e => e.type === 'node:complete' && e.nodeId === 'n')).toBe(true)
    expect(events.at(-1)?.type).toBe('workflow:complete')
  })

  it('跨节点插值真实生效：下游拿到上游输出而非字面量', async () => {
    const engine = new WorkflowEngine()
    const results = await engine.execute(
      wf(
        [
          { id: 't', type: 'manual-trigger' },
          { id: 'tp', type: 'text-process', config: { text: '  Hello AI Workflow  ', operation: 'trim' } },
          { id: 'n', type: 'notification', config: { message: '[{{tp.text}}]', level: 'info' } }
        ],
        [{ source: 't', target: 'tp' }, { source: 'tp', target: 'n' }]
      ),
      collect().onEvent
    )

    expect(results.get('tp')?.output.text).toBe('Hello AI Workflow')
    expect(String(results.get('n')?.output.message)).toContain('[Hello AI Workflow]')
  })

  it('HTTP 节点在 mock 下发请求并解析 JSON 响应', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ zen: 'keep it simple' })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const engine = new WorkflowEngine()
    const results = await engine.execute(
      wf(
        [
          { id: 't', type: 'manual-trigger' },
          { id: 'h', type: 'http-request', config: { url: 'https://api.example.com/zen', method: 'GET', headers: '{}' } }
        ],
        [{ source: 't', target: 'h' }]
      ),
      collect().onEvent
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const r = results.get('h')
    expect(r?.status, `HTTP 节点失败: ${r?.error}`).toBe('success')
    expect(r?.output.status).toBe(200)
    expect((r?.output.data as { zen: string }).zen).toBe('keep it simple')
  })

  it('条件节点按 sourceHandle 路由，未命中分支被停用', async () => {
    const engine = new WorkflowEngine()
    const { events, onEvent } = collect()
    const results = await engine.execute(
      wf(
        [
          { id: 't', type: 'manual-trigger' },
          { id: 'c', type: 'condition', config: { left: '1', right: '1', operator: 'equals' } },
          { id: 'yes', type: 'notification', config: { message: '走了 true 分支', level: 'info' } },
          { id: 'no', type: 'notification', config: { message: '走了 false 分支', level: 'info' } }
        ],
        [
          { source: 't', target: 'c' },
          { source: 'c', target: 'yes', sourceHandle: 'true' },
          { source: 'c', target: 'no', sourceHandle: 'false' }
        ]
      ),
      onEvent
    )

    expect(results.get('c')?.status).toBe('success')
    expect(results.get('yes')?.status).toBe('success')
    // 未命中的分支不应被执行
    expect(events.some(e => e.type === 'node:start' && e.nodeId === 'no')).toBe(false)
  })

  it('运行中取消：未执行节点在结果图中记为 cancelled（E7b 回归锁）', async () => {
    const engine = new WorkflowEngine()
    const runId = 'exec-cancel-e7b'
    const { events, onEvent } = collect()

    const results = await engine.execute(
      wf(
        [
          { id: 't', type: 'manual-trigger' },
          { id: 'n1', type: 'notification', config: { message: '第一段', level: 'info' } },
          { id: 'n2', type: 'notification', config: { message: '第二段', level: 'info' } }
        ],
        [{ source: 't', target: 'n1' }, { source: 'n1', target: 'n2' }]
      ),
      e => {
        // 第一个业务节点完成后立刻取消，令其后继节点进入取消收尾
        if (e.type === 'node:complete' && e.nodeId === 'n1') engine.cancel(runId)
        onEvent(e)
      },
      runId
    )

    expect(results.get('n1')?.status).toBe('success')
    const pending = results.get('n2')
    expect(pending?.status, '被取消的节点必须出现在结果图中，否则历史会把取消记为已完成').toBe('cancelled')
    // 取消的节点不得被真正执行
    expect(events.some(e => e.type === 'node:start' && e.nodeId === 'n2')).toBe(false)
    expect(events.some(e => e.type === 'node:cancelled' && e.nodeId === 'n2')).toBe(true)
    expect(events.at(-1)?.type).toBe('workflow:cancelled')
  })

  it('节点失败：错误结果带真实耗时与可读错误信息', async () => {
    const engine = new WorkflowEngine()
    const results = await engine.execute(
      wf(
        [
          { id: 't', type: 'manual-trigger' },
          // 文件读取不存在的绝对不存在路径，必然失败
          { id: 'f', type: 'file-io', config: { mode: 'read', path: 'Z:/definitely-not-here-42.txt', encoding: 'utf-8', content: '' } }
        ],
        [{ source: 't', target: 'f' }]
      ),
      collect().onEvent
    )

    const r = results.get('f')
    expect(r?.status).toBe('error')
    expect(r?.error).toBeTruthy()
    expect(r?.duration, '错误结果不应再硬编码 duration: 0').toBeTypeOf('number')
  })
})
