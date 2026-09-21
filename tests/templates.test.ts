import { describe, it, expect, afterEach, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { WorkflowEngine } from '../electron/engine/index'
import { workflowTemplates } from '../electron/engine/templates'
import { nodeRegistry } from '../electron/engine/nodes/index'
import { validateWorkflow } from '@shared/validator'
import type { WorkflowDefinition } from '@shared/workflow'
import type { LlmModelInfo } from '@shared/node'

/**
 * 内置模板必须真实跑通。
 *
 * 它们是新用户的第一次实际体验，也曾在宣传中被列为主要能力，
 * 但在校验器修复前一次都没有被执行过。
 */

const engine = new WorkflowEngine()

const fakeModel: LlmModelInfo = {
  id: 'm-tpl',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4o-mini',
  apiKey: 'sk-test-key-not-a-real-one',
  temperature: 0.3,
  maxTokens: 256
}

function mockChat() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content: '这是模型生成的摘要内容。' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
      model: 'gpt-4o-mini'
    }),
    text: async () => '{}'
  })))
}

function build(id: string): WorkflowDefinition {
  const tpl = workflowTemplates.find(t => t.id === id)
  if (!tpl) throw new Error(`模板不存在: ${id}`)
  return tpl.build()
}

/** 把写文件类节点重定向到临时目录，避免污染用户磁盘 */
function sandboxFileWrites(wf: WorkflowDefinition): WorkflowDefinition {
  for (const node of wf.nodes) {
    if (node.type === 'file-io') {
      node.config.path = join(tmpdir(), `aiwf-template-${randomUUID()}.txt`)
      node.config.mode = 'write'
    }
  }
  return wf
}

afterEach(() => vi.unstubAllGlobals())

describe('内置模板', () => {
  it('四个模板全部存在且能通过执行前校验', () => {
    expect(workflowTemplates.map(t => t.id)).toEqual([
      'blank', 'example-llm-chat', 'example-rag-qa', 'example-text-pipeline'
    ])

    for (const tpl of workflowTemplates) {
      const res = validateWorkflow(sandboxFileWrites(tpl.build()))
      expect(res.errors, `${tpl.id}: ${JSON.stringify(res.errors)}`).toEqual([])
    }
  })

  it('模板使用的节点类型全部真实注册', () => {
    for (const tpl of workflowTemplates) {
      for (const node of tpl.build().nodes) {
        expect(nodeRegistry.has(node.type), `${tpl.id} 使用了未注册的节点 ${node.type}`).toBe(true)
      }
    }
  })

  it('LLM 对话助手：触发 → 模型回复', async () => {
    mockChat()
    const results = await engine.execute(build('example-llm-chat'), () => undefined, 'exec-tpl-llm', {}, [fakeModel])

    expect([...results.values()].every(r => r.status === 'success'),
      [...results.values()].map(r => `${r.nodeId}:${r.status}:${r.error ?? ''}`).join(' | ')).toBe(true)
  })

  it('文本摘要流水线：LLM → 文本处理 → 写文件，产物真实落盘', async () => {
    mockChat()
    const wf = sandboxFileWrites(build('example-text-pipeline'))
    const results = await engine.execute(wf, () => undefined, 'exec-tpl-text', {}, [fakeModel])

    expect([...results.values()].every(r => r.status === 'success'),
      [...results.values()].map(r => `${r.nodeId}:${r.status}:${r.error ?? ''}`).join(' | ')).toBe(true)

    const fileNode = wf.nodes.find(n => n.type === 'file-io')!
    const written = readFileSync(String(fileNode.config.path), 'utf-8')
    expect(written.length).toBeGreaterThan(0)
    expect(written).toContain('模型生成的摘要内容')
  })

  it('RAG 知识问答：入库 → 检索 → 生成', async () => {
    mockChat()
    const results = await engine.execute(build('example-rag-qa'), () => undefined, 'exec-tpl-rag', {}, [fakeModel])

    const failed = [...results.values()].filter(r => r.status !== 'success')
    expect(
      failed.map(f => `${f.nodeId}:${f.status}:${f.error ?? ''}`),
      'RAG 模板执行失败'
    ).toEqual([])
    expect(results.size).toBeGreaterThanOrEqual(5)
  })

  it('空白模板只有一个触发节点', async () => {
    const wf = build('blank')
    expect(wf.nodes).toHaveLength(1)
    expect(wf.nodes[0].type).toBe('manual-trigger')
  })
})
