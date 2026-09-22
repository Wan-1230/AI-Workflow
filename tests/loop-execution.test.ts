import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../electron/engine/index'
import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'

/**
 * 画布内循环体的逐项执行。
 *
 * 旧实现的"循环"只在节点内部渲染模板，下游节点一次都不会按项执行 ——
 * 这些测试锁住新语义：body 子图真的跑 N 轮，done 出口只跑一次。
 */

const engine = new WorkflowEngine()

interface Spec {
  id: string
  type: string
  config?: Record<string, unknown>
  executionConfig?: Record<string, unknown>
}

function build(
  nodes: Spec[],
  links: Array<{ source: string; target: string; sourceHandle?: string }>
): WorkflowDefinition {
  return {
    id: 'wf-loop',
    name: '循环执行',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    nodes: nodes.map((n, i) => ({
      id: n.id, type: n.type, label: n.id,
      position: { x: i * 140, y: 0 }, config: n.config ?? {},
      ...(n.executionConfig ? { executionConfig: n.executionConfig } : {})
    })),
    edges: links.map((l, i) => ({
      id: `e${i}`, source: l.source, target: l.target, sourceHandle: l.sourceHandle
    }))
  }
}

async function runDef(
  definition: WorkflowDefinition,
  id: string,
  onEvent?: (e: ExecutionEvent) => void,
  secrets?: Record<string, string>
) {
  const events: ExecutionEvent[] = []
  const results = await engine.execute(definition, e => {
    events.push(e)
    onEvent?.(e)
  }, id, secrets)
  return { results, events }
}

const startsOf = (events: ExecutionEvent[], nodeId: string) =>
  events.filter(e => e.type === 'node:start' && e.nodeId === nodeId).length

describe('逐项执行循环体', () => {
  it('体内节点按数组长度逐项执行，{{item}} 解析为当前项', async () => {
    const { results, events } = await runDef(build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { itemsSource: '', items: '["a","b","c"]' } },
        { id: 'body', type: 'notification', config: { message: '当前是 {{item}}', level: 'info' } },
        { id: 'E', type: 'loop-end' }
      ],
      [
        { source: 't', target: 'L' },
        { source: 'L', target: 'body', sourceHandle: 'body' },
        { source: 'body', target: 'E' }
      ]
    ), 'loop-basic')

    expect(results.get('L')?.status, results.get('L')?.error).toBe('success')
    expect(startsOf(events, 'body'), '体内节点应执行 3 次').toBe(3)
    expect(results.get('L')?.output.count).toBe(3)
    expect(results.get('L')?.iterations).toHaveLength(3)

    // 每轮留档的体内输出应各自对应当前项
    const perRound = (results.get('L')?.iterations ?? []).map(
      round => String((round.find(r => r.nodeId === 'body')?.output as { message?: string })?.message)
    )
    expect(perRound).toEqual([
      '📢 当前是 a', '📢 当前是 b', '📢 当前是 c'
    ])
  })

  it('done 出口的下游只执行一次，并能引用体内最后一轮输出', async () => {
    const { results, events } = await runDef(build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { itemsSource: '', items: '[1,2,3]' } },
        { id: 'body', type: 'notification', config: { message: '{{item}}', level: 'info' } },
        { id: 'E', type: 'loop-end' },
        { id: 'after', type: 'notification', config: { message: '收尾 {{body.message}}', level: 'info' } }
      ],
      [
        { source: 't', target: 'L' },
        { source: 'L', target: 'body', sourceHandle: 'body' },
        { source: 'body', target: 'E' },
        { source: 'L', target: 'after', sourceHandle: 'done' }
      ]
    ), 'loop-done')

    expect(startsOf(events, 'after'), 'done 下游只应执行一次').toBe(1)
    expect(results.get('after')?.status).toBe('success')
    // 最后一轮的体内结果被并入父层
    expect(String((results.get('after')?.output as { message?: string })?.message)).toContain('收尾 📢 3')
  })

  it('嵌套循环：内层体被执行 外层项数 × 内层项数 次', async () => {
    const { results, events } = await runDef(build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'OUT', type: 'loop', config: { itemsSource: '', items: '["o1","o2"]' } },
        { id: 'pre', type: 'notification', config: { message: 'outer {{item}}', level: 'info' } },
        { id: 'IN', type: 'loop', config: { itemsSource: '', items: '["i1","i2","i3"]' } },
        { id: 'inner', type: 'notification', config: { message: '{{item}}', level: 'info' } },
        { id: 'IE', type: 'loop-end' },
        { id: 'OE', type: 'loop-end' }
      ],
      [
        { source: 't', target: 'OUT' },
        { source: 'OUT', target: 'pre', sourceHandle: 'body' },
        { source: 'pre', target: 'IN' },
        { source: 'IN', target: 'inner', sourceHandle: 'body' },
        { source: 'inner', target: 'IE' },
        { source: 'IN', target: 'OE', sourceHandle: 'done' }
      ]
    ), 'loop-nested')

    expect(results.get('OUT')?.status, results.get('OUT')?.error).toBe('success')
    expect(startsOf(events, 'inner'), '2 × 3 = 6 次内层迭代').toBe(6)
    expect(startsOf(events, 'pre')).toBe(2)
  })

  it('循环中取消：剩余轮次不再执行', async () => {
    const id = 'loop-cancel'
    const onEvent = (e: ExecutionEvent): void => {
      // 第一轮体内节点完成后取消
      if (e.type === 'node:complete' && e.nodeId === 'body') engine.cancel(id)
    }

    const { results, events } = await runDef(build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { itemsSource: '', items: '["a","b","c","d","e"]' } },
        { id: 'body', type: 'notification', config: { message: '{{item}}', level: 'info' } },
        { id: 'E', type: 'loop-end' }
      ],
      [
        { source: 't', target: 'L' },
        { source: 'L', target: 'body', sourceHandle: 'body' },
        { source: 'body', target: 'E' }
      ]
    ), id, onEvent)

    const bodyStarts = startsOf(events, 'body')
    expect(bodyStarts).toBeLessThan(5)
    expect(bodyStarts, '至少完成第一轮').toBeGreaterThanOrEqual(1)
    // 取消后不得把循环标成成功
    expect(results.get('L')?.status).not.toBe('success')
  })

  it('数组为空时循环成功且零轮次（不是错误）', async () => {
    const { results, events } = await runDef(build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { itemsSource: '', items: '[]' } },
        { id: 'body', type: 'notification', config: { message: 'x', level: 'info' } },
        { id: 'E', type: 'loop-end' }
      ],
      [
        { source: 't', target: 'L' },
        { source: 'L', target: 'body', sourceHandle: 'body' },
        { source: 'body', target: 'E' }
      ]
    ), 'loop-empty')

    expect(results.get('L')?.status).toBe('success')
    expect(results.get('L')?.output.count).toBe(0)
    expect(startsOf(events, 'body')).toBe(0)
  })

  it('项数超上限时该节点明确失败，而非静默跑很久', async () => {
    const big = JSON.stringify(Array.from({ length: 501 }, (_, i) => i))
    const { results } = await runDef(build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { itemsSource: '', items: big } },
        { id: 'body', type: 'notification', config: { message: 'x', level: 'info' } },
        { id: 'E', type: 'loop-end' }
      ],
      [
        { source: 't', target: 'L' },
        { source: 'L', target: 'body', sourceHandle: 'body' },
        { source: 'body', target: 'E' }
      ]
    ), 'loop-cap')

    expect(results.get('L')?.status).toBe('error')
    expect(results.get('L')?.error).toMatch(/超过上限/)
  })
})

describe('循环结构错误的入口拦截', () => {
  it('循环体缺 loop-end 时被校验器拒绝', async () => {
    const definition = build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { itemsSource: '', items: '["a"]' } },
        { id: 'body', type: 'notification', config: { message: 'x', level: 'info' } }
      ],
      [{ source: 't', target: 'L' }, { source: 'L', target: 'body', sourceHandle: 'body' }]
    )

    await expect(engine.execute(definition, () => undefined, 'loop-no-end'))
      .rejects.toThrow(/loop-end/)
  })

  it('loop-end 带出边时被拒绝并指明改走 done 出口', async () => {
    await expect(engine.execute(build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { itemsSource: '', items: '["a"]' } },
        { id: 'body', type: 'notification', config: { message: 'x', level: 'info' } },
        { id: 'E', type: 'loop-end' },
        { id: 'x', type: 'notification', config: { message: 'y', level: 'info' } }
      ],
      [
        { source: 't', target: 'L' },
        { source: 'L', target: 'body', sourceHandle: 'body' },
        { source: 'body', target: 'E' },
        { source: 'E', target: 'x' }
      ]
    ), () => undefined, 'loop-end-edge')).rejects.toThrow(/done 出口/)
  })
})

describe('循环体调 LLM 再汇总（README 承诺的主场景）', () => {
  it('数组 3 项 → 每项一次模型调用 → done 汇总引用末轮输出', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
      calls += 1
      const sent = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
      const last = sent.messages[sent.messages.length - 1].content
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: `已处理:${last}` }, finish_reason: 'stop' }],
          model: 'gpt-4o-mini'
        }),
        text: async () => ''
      }
    }))

    const { results } = await runDef(build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { itemsSource: '', items: '["甲","乙","丙"]' } },
        {
          id: 'ai', type: 'llm-call',
          config: { modelId: '', credentialName: 'k', baseUrl: 'https://api.example.com/v1', model: 'gpt-4o-mini', systemPrompt: '', userPrompt: '处理 {{item}}', stream: false }
        },
        { id: 'E', type: 'loop-end' },
        { id: 'sum', type: 'notification', config: { message: '共 {{L.count}} 项，末轮={{ai.text}}', level: 'info' } }
      ],
      [
        { source: 't', target: 'L' },
        { source: 'L', target: 'ai', sourceHandle: 'body' },
        { source: 'ai', target: 'E' },
        { source: 'L', target: 'sum', sourceHandle: 'done' }
      ]
    ), 'loop-llm', undefined, { k: 'sk-test-key-not-a-real-one' })

    vi.unstubAllGlobals()

    expect(calls, '每项各调用一次模型').toBe(3)
    expect(results.get('sum')?.status).toBe('success')
    expect(String(results.get('sum')?.output.message)).toContain('共 3 项，末轮=已处理:处理 丙')
    const rounds = (results.get('L')?.iterations ?? []).map(
      round => String((round.find(r => r.nodeId === 'ai')?.output as { text?: string })?.text)
    )
    expect(rounds).toEqual(['已处理:处理 甲', '已处理:处理 乙', '已处理:处理 丙'])
  })
})
describe('循环体失败的归宿', () => {
  it('体内节点按 stop 失败：循环立即中止，剩余轮次不跑，且不向外泄内层终态', async () => {
    const { results, events } = await runDef(build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { itemsSource: '', items: '["a","b","c"]' } },
        { id: 'bad', type: 'code-exec', config: { code: "throw new Error('故意失败')" } },
        { id: 'E', type: 'loop-end' },
        { id: 'after', type: 'notification', config: { message: '不该到达', level: 'info' } }
      ],
      [
        { source: 't', target: 'L' },
        { source: 'L', target: 'bad', sourceHandle: 'body' },
        { source: 'bad', target: 'E' },
        { source: 'L', target: 'after', sourceHandle: 'done' }
      ]
    ), 'loop-body-stop')

    const l = results.get('L')
    expect(l?.status).toBe('error')
    expect(l?.error).toMatch(/循环体第 1\/3 项在 bad 失败/)
    expect(startsOf(events, 'bad'), '第二轮不该开始').toBe(1)
    expect(results.get('after')?.status, 'done 下游应被跳过而非执行').toBe('skipped')

    // 内层轮次的 workflow:* 终态不得混进父事件流：只允许运行自身那一条
    const terminal = events.filter(e => String(e.type).startsWith('workflow:'))
    expect(terminal.map(e => e.type)).toEqual(['workflow:error'])
  })

  it('体内节点按 error-branch 失败：不视为中止，后续轮次继续', async () => {
    const { results, events } = await runDef(build(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { itemsSource: '', items: '["a","b"]' } },
        {
          id: 'bad', type: 'code-exec',
          config: { code: "throw new Error('分支内失败')" },
          executionConfig: { onError: 'error-branch' }
        },
        { id: 'E', type: 'loop-end' }
      ],
      [
        { source: 't', target: 'L' },
        { source: 'L', target: 'bad', sourceHandle: 'body' },
        { source: 'bad', target: 'E' }
      ]
    ), 'loop-body-error-branch')

    expect(results.get('L')?.status, results.get('L')?.error).toBe('success')
    expect(startsOf(events, 'bad')).toBe(2)
    expect(results.get('L')?.iterations).toHaveLength(2)
  })
})
