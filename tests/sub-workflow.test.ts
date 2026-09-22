import { describe, it, expect, afterEach, vi } from 'vitest'
import { WorkflowEngine } from '../electron/engine/index'
import { validateWorkflow } from '@shared/validator'
import type { ExecutionEvent, NodeResult, WorkflowDefinition } from '@shared/workflow'
import type { LlmModelInfo } from '@shared/node'

/**
 * 子工作流的输入、流式与取消。
 *
 * 目录里明写的「输入数据」字段曾没有任何消费方：引擎把上游输出硬塞进
 * global.sub_input，用户照着 help 填的 input 被丢弃，子流程读到的是另一回事。
 */

const engine = new WorkflowEngine()

const fakeModel: LlmModelInfo = {
  id: 'm-test',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4o-mini',
  apiKey: 'sk-test-key-not-a-real-one',
  temperature: 0.2,
  maxTokens: 256
}

function outer(nodesConfig: Record<string, unknown>, links: Array<{ source: string; target: string }> = []): WorkflowDefinition {
  return {
    id: 'wf-sub',
    name: '子工作流',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    variables: [],
    nodes: [
      { id: 't', type: 'manual-trigger', label: 't', position: { x: 0, y: 0 }, config: {} },
      { id: 's', type: 'sub-workflow', label: 's', position: { x: 140, y: 0 }, config: nodesConfig }
    ],
    edges: [
      { id: 'e0', source: 't', target: 's' },
      ...links.map((l, i) => ({ id: `ex${i}`, ...l }))
    ]
  }
}

/** 子流程内部结果挂在父节点的 output.results 下，按体内节点 id 取 */
function inner(s: { output: Record<string, unknown> } | undefined, id: string): NodeResult | undefined {
  return (s?.output.results as Record<string, NodeResult> | undefined)?.[id]
}

/** 只关心 JSON 能被子流程解析并跑通拓扑的最小内嵌工作流 */
function minimalSub(node: Record<string, unknown>): string {
  return JSON.stringify({
    id: 'sub',
    name: '子流程',
    variables: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    nodes: [
      { id: 'st', type: 'manual-trigger', label: 'st', position: { x: 0, y: 0 }, config: {} },
      { position: { x: 140, y: 0 }, label: 'body', id: 'body', ...node }
    ],
    edges: [{ id: 'se', source: 'st', target: 'body' }]
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('子工作流输入注入', () => {
  const echoSub = minimalSub({
    type: 'notification',
    config: { message: '收到:{{global.sub_input}}', level: 'info' }
  })

  it('config.input 参与插值后写入 global.sub_input', async () => {
    const wf = outer({ workflowJson: echoSub, input: '前缀:{{t.timestamp}}' })
    const results = await engine.execute(wf, () => undefined, 'sub-input')
    const s = results.get('s')
    expect(s?.status, s?.error).toBe('success')
    expect(String(inner(s, 'body')?.output.message)).toMatch(/收到:前缀:\d{10,}/)
  })

  it('未填 input 时退回上游输出聚合（旧行为保留）', async () => {
    const wf = outer({ workflowJson: echoSub, input: '' })
    const results = await engine.execute(wf, () => undefined, 'sub-upstream')
    const s = results.get('s')
    expect(s?.status, s?.error).toBe('success')
    expect(String(inner(s, 'body')?.output.message)).toContain('收到:{')
  })

  it('config.input 引用不存在的节点时报错并定位到 s.input', async () => {
    const wf = outer({ workflowJson: echoSub, input: '{{ghost.data}}' })
    const results = await engine.execute(wf, () => undefined, 'sub-bad-ref')
    const s = results.get('s')
    expect(s?.status).toBe('error')
    expect(s?.error).toMatch(/s\.input/)
  })
})

describe('子工作流事件与取消', () => {
  it('子流程内 LLM 的流式增量出现在父事件流，且带体内节点 id', async () => {
    const encoder = new TextEncoder()
    const deltas = ['你', '好', '世界']
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      body: {
        getReader: () => {
          let i = 0
          return {
            read: async () => {
              if (i >= deltas.length) return { done: true, value: undefined }
              const line = `data: ${JSON.stringify({ choices: [{ delta: { content: deltas[i] } }] })}\n\n`
              i += 1
              return { done: false, value: encoder.encode(line) }
            }
          }
        }
      }
    })))

    const events: ExecutionEvent[] = []
    const wf = outer({
      workflowJson: JSON.stringify({
        id: 'sub', name: '子流程', variables: [],
        createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
        nodes: [
          { id: 'st', type: 'manual-trigger', label: 'st', position: { x: 0, y: 0 }, config: {} },
          { id: 'sl', type: 'llm-call', label: 'sl', position: { x: 140, y: 0 }, config: { modelId: 'm-test', userPrompt: 'x', systemPrompt: '', stream: true } }
        ],
        edges: [{ id: 'se', source: 'st', target: 'sl' }]
      }),
      input: ''
    })

    const results = await engine.execute(wf, e => events.push(e), 'sub-stream', {}, [fakeModel])

    const streamed = events.filter(e => e.type === 'node:stream')
    expect(streamed.length).toBeGreaterThan(0)
    expect(streamed.every(e => e.nodeId === 'sl')).toBe(true)
    expect(inner(results.get('s'), 'sl')?.status).toBe('success')
  })

  it('父级取消时子流程一并中止，不留下在飞的请求', async () => {
    let sawAbort = false
    let entered = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      entered += 1
      const signal = init?.signal
      // 请求真正发出之后再取消，否则"中止传导"这一步根本没被走到
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          sawAbort = true
          reject(new Error('abort'))
        })
        setTimeout(() => engine.cancel('sub-cancel'), 5)
      })
    }))

    const wf = outer({
      workflowJson: JSON.stringify({
        id: 'sub', name: '子流程', variables: [],
        createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
        nodes: [
          { id: 'st', type: 'manual-trigger', label: 'st', position: { x: 0, y: 0 }, config: {} },
          { id: 'sl', type: 'llm-call', label: 'sl', position: { x: 140, y: 0 }, config: { modelId: 'm-test', userPrompt: 'x', systemPrompt: '', stream: false } }
        ],
        edges: [{ id: 'se', source: 'st', target: 'sl' }]
      }),
      input: ''
    })

    const events: ExecutionEvent[] = []
    const done = engine.execute(wf, e => events.push(e), 'sub-cancel', {}, [fakeModel])

    const results = await done
    const s = results.get('s')
    expect(s?.status, s?.error).toBe('cancelled')
    expect(entered, '子流程内的 LLM 未发起请求').toBeGreaterThan(0)
    expect(sawAbort).toBe(true)
    expect(events.some(e => e.type === 'node:cancelled' && e.nodeId === 'sl')).toBe(true)
  })
})

describe('子工作流静态校验', () => {
  const subRefInput = JSON.stringify({
    nodes: [{ id: 'a', type: 'notification', config: { message: '{{global.sub_input}}' } }]
  })

  /** 孤立子工作流节点：没有上游可注入输入 */
  function alone(config: Record<string, unknown>): WorkflowDefinition {
    const base = outer(config)
    return { ...base, nodes: base.nodes.filter(n => n.id !== 't'), edges: [] }
  }

  it('引用 sub_input 但既无输入也无上游时给出告警', () => {
    const res = validateWorkflow(alone({ workflowJson: subRefInput, input: '   ' }))
    expect(res.valid).toBe(true)
    expect(res.warnings.some(w => w.nodeId === 's' && /sub_input/.test(w.message))).toBe(true)
  })

  it('填了输入则不告警', () => {
    const res = validateWorkflow(alone({ workflowJson: subRefInput, input: 'hello' }))
    expect(res.warnings.some(w => /sub_input/.test(w.message))).toBe(false)
  })

  it('有上游连线时不告警（上游输出会被聚合成 sub_input）', () => {
    const res = validateWorkflow(outer({ workflowJson: subRefInput, input: '' }))
    expect(res.warnings.some(w => /sub_input/.test(w.message))).toBe(false)
  })
})
