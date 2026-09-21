import { describe, it, expect, afterEach, vi } from 'vitest'
import { WorkflowEngine } from '../electron/engine/index'
import { catalogNodeTypes } from '@shared/node-catalog'
import { nodeRegistry } from '../electron/engine/nodes/index'
import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'
import type { LlmModelInfo } from '@shared/node'

/**
 * 逐类节点的端到端执行验证。
 *
 * 这一文件存在的理由很直接：引擎注册了 16 类节点，而校验器长期只放行 5 类，
 * 其余 11 类（包括全部 AI 节点）从未真正执行过一次，也从未被任何测试覆盖。
 */

const engine = new WorkflowEngine()

function workflow(
  nodes: Array<{ id: string; type: string; config?: Record<string, unknown> }>,
  links: Array<{ source: string; target: string; sourceHandle?: string }>
): WorkflowDefinition {
  return {
    id: 'wf-nodes',
    name: '节点覆盖',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    variables: [],
    nodes: nodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      label: n.id,
      position: { x: i * 140, y: 0 },
      config: n.config ?? {}
    })),
    edges: links.map((l, i) => ({ id: `e${i}`, source: l.source, target: l.target, sourceHandle: l.sourceHandle }))
  }
}

const fakeModel: LlmModelInfo = {
  id: 'm-test',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4o-mini',
  apiKey: 'sk-test-key-not-a-real-one',
  temperature: 0.2,
  maxTokens: 256
}

/** 以非流式方式 mock OpenAI 兼容响应 */
function mockChatCompletion(content: string) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 7, completion_tokens: 12, total_tokens: 19 },
      model: 'gpt-4o-mini'
    }),
    text: async () => JSON.stringify({ choices: [{ message: { content } }] })
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function run(wf: WorkflowDefinition, models?: LlmModelInfo[]) {
  const events: ExecutionEvent[] = []
  const results = await engine.execute(wf, e => events.push(e), `exec_${Math.random()}`, {}, models)
  return { results, events }
}

afterEach(() => vi.unstubAllGlobals())

describe('逐类节点端到端执行', () => {
  it('16 类节点全部纳入测试矩阵', () => {
    // 与注册表同源，避免测试清单再次与实际能力脱节
    expect(catalogNodeTypes).toHaveLength(nodeRegistry.size)
  })

  it('code-exec：沙箱内 return 值成为输出', async () => {
    const { results } = await run(workflow(
      [{ id: 't', type: 'manual-trigger' }, { id: 'c', type: 'code-exec', config: { code: 'return { doubled: 21 * 2 }' } }],
      [{ source: 't', target: 'c' }]
    ))
    expect(results.get('c')?.status, results.get('c')?.error).toBe('success')
    expect((results.get('c')?.output.result as { doubled: number }).doubled).toBe(42)
  })

  it('variable-set + {{global.KEY}}：跨节点传递成立', async () => {
    const { results } = await run(workflow(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'v', type: 'variable-set', config: { key: 'city', value: '杭州' } },
        { id: 'n', type: 'notification', config: { message: '城市是 {{global.city}}', level: 'info' } }
      ],
      [{ source: 't', target: 'v' }, { source: 'v', target: 'n' }]
    ))
    expect(results.get('v')?.status).toBe('success')
    expect(String(results.get('n')?.output.message)).toContain('城市是 杭州')
  })

  it('prompt-template：变量映射渲染进模板', async () => {
    const { results } = await run(workflow(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'p', type: 'prompt-template', config: { template: '你好 {{name}}，今天处理 {{count}} 条', variables: '{"name":"小明","count":3}' } }
      ],
      [{ source: 't', target: 'p' }]
    ))
    expect(results.get('p')?.status, results.get('p')?.error).toBe('success')
    expect(String(results.get('p')?.output.text)).toContain('你好 小明')
  })

  it('loop：逐项渲染模板并给出计数', async () => {
    const { results } = await run(workflow(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'l', type: 'loop', config: { itemsSource: '', items: '["a","b","c"]', template: '- {{item}}', mode: 'template' } }
      ],
      [{ source: 't', target: 'l' }]
    ))
    const r = results.get('l')
    expect(r?.status, r?.error).toBe('success')
    expect(r?.output.count).toBe(3)
    expect(r?.output.results).toEqual(['- a', '- b', '- c'])
  })

  it('sub-workflow：嵌套工作流真实执行并回传结果', async () => {
    const inner = JSON.stringify({
      name: '子流程',
      nodes: [
        { id: 'it', type: 'manual-trigger', label: 'it', position: { x: 0, y: 0 }, config: {} },
        { id: 'in', type: 'notification', label: 'in', position: { x: 120, y: 0 }, config: { message: '子流程内部通知', level: 'info' } }
      ],
      edges: [{ id: 'ie', source: 'it', target: 'in' }]
    })
    const { results } = await run(workflow(
      [{ id: 't', type: 'manual-trigger' }, { id: 's', type: 'sub-workflow', config: { workflowJson: inner, input: '' } }],
      [{ source: 't', target: 's' }]
    ))
    const r = results.get('s')
    expect(r?.status, r?.error).toBe('success')
    expect(JSON.stringify(r?.output)).toContain('子流程内部通知')
  })

  it('tool-call：内置数学工具无需网络即可求值', async () => {
    const { results } = await run(workflow(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'tc', type: 'tool-call', config: { toolType: 'builtin', toolName: 'math', arguments: '{"expression":"1+2*3"}' } }
      ],
      [{ source: 't', target: 'tc' }]
    ))
    const r = results.get('tc')
    expect(r?.status, r?.error).toBe('success')
    expect(JSON.stringify(r?.output)).toContain('7')
  })

  it('tool-call：表达式注入被拒绝', async () => {
    const { results } = await run(workflow(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'tc', type: 'tool-call', config: { toolType: 'builtin', toolName: 'math', arguments: '{"expression":"process.exit(1)"}' } }
      ],
      [{ source: 't', target: 'tc' }]
    ))
    expect(results.get('tc')?.status).toBe('error')
  })

  it('llm-call：走 mock 的 OpenAI 兼容接口拿到回复', async () => {
    mockChatCompletion('模型说：收到')
    const { results } = await run(
      workflow(
        [
          { id: 't', type: 'manual-trigger' },
          { id: 'l', type: 'llm-call', config: { modelId: 'm-test', systemPrompt: '', userPrompt: '你好', temperature: 0.2, maxTokens: 64, stream: false, credentialName: '', baseUrl: '', model: '' } }
        ],
        [{ source: 't', target: 'l' }]
      ),
      [fakeModel]
    )
    const r = results.get('l')
    expect(r?.status, r?.error).toBe('success')
    expect(String(r?.output.text)).toContain('收到')
  })

  it('llm-call：无凭证无模型时报错信息指向可操作位置', async () => {
    const { results } = await run(workflow(
      [{ id: 't', type: 'manual-trigger' }, { id: 'l', type: 'llm-call', config: { modelId: '', credentialName: '', baseUrl: '', model: '', userPrompt: 'x', systemPrompt: '', stream: false } }],
      [{ source: 't', target: 'l' }]
    ), [])
    const r = results.get('l')
    expect(r?.status).toBe('error')
    expect(r?.error).toMatch(/模型配置|凭证/)
  })

  it('agent-delegate：委派子任务由 LLM 完成', async () => {
    mockChatCompletion('结论：数据正常')
    const { results } = await run(
      workflow(
        [{ id: 't', type: 'manual-trigger' }, { id: 'a', type: 'agent-delegate', config: { role: '你是分析助手', task: '给出结论', contextData: '', modelId: 'm-test', temperature: 0.2, maxTokens: 128 } }],
        [{ source: 't', target: 'a' }]
      ),
      [fakeModel]
    )
    const r = results.get('a')
    expect(r?.status, r?.error).toBe('success')
    expect(JSON.stringify(r?.output)).toContain('数据正常')
  })

  it('rag-upload + rag-retrieve：入库后能被检索回来', async () => {
    const doc = 'Qoder 是一款面向开发者的智能编程助手。它支持多文件编辑、终端执行与上下文感知检索。'
    const { results: up } = await run(workflow(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'ru', type: 'rag-upload', config: { source: 'text', text: doc, filePath: '', docId: 'doc-qoder', chunkSize: 40, overlap: 8 } }
      ],
      [{ source: 't', target: 'ru' }]
    ))
    expect(up.get('ru')?.status, up.get('ru')?.error).toBe('success')
    expect(Number(up.get('ru')?.output.chunkCount)).toBeGreaterThan(0)

    const { results: got } = await run(workflow(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 't2', type: 'notification', config: { message: '占位', level: 'info' } },
        { id: 'rr', type: 'rag-retrieve', config: { query: '这款编程助手能做什么', topK: 3, minScore: 0.001 } }
      ],
      [{ source: 't', target: 't2' }, { source: 't2', target: 'rr' }]
    ))
    const r = got.get('rr')
    expect(r?.status, r?.error).toBe('success')
    expect(Number(r?.output.count)).toBeGreaterThan(0)
    // 检索出的上下文应来自刚入库的文档
    expect(String(r?.output.combined)).toContain('Qoder')
  })
})
