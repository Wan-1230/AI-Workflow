import { describe, it, expect } from 'vitest'
import { WorkflowEngine } from '../electron/engine/index'
import type { WorkflowDefinition } from '@shared/workflow'

/**
 * 变量插值语义（S1）。
 *
 * 解析不到时旧实现原样返回 "{{x}}"，于是下游拿到字面量继续计算 ——
 * 条件节点会比较 "{{nope.field}}" 这个字符串并报告执行成功。
 * 现在改为显式失败，且错误信息必须能定位到节点与字段。
 */

const engine = new WorkflowEngine()

function wf(
  nodes: Array<{ id: string; type: string; config?: Record<string, unknown> }>,
  links: Array<{ source: string; target: string }>
): WorkflowDefinition {
  return {
    id: 'wf-interp',
    name: '插值',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    nodes: nodes.map((n, i) => ({
      id: n.id, type: n.type, label: n.id,
      position: { x: i * 140, y: 0 }, config: n.config ?? {}
    })),
    edges: links.map((l, i) => ({ id: `e${i}`, source: l.source, target: l.target }))
  }
}

async function firstError(definition: WorkflowDefinition, nodeId: string): Promise<string> {
  const results = await engine.execute(definition, () => undefined, `exec_${Math.random()}`)
  const r = results.get(nodeId)
  if (r?.status !== 'error') throw new Error(`期望 ${nodeId} 失败，实际 ${r?.status}`)
  return r.error ?? ''
}

describe('未解析引用改为显式错误', () => {
  it('引用不存在的节点时报错，且信息含节点与字段定位', async () => {
    const msg = await firstError(wf(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'n', type: 'notification', config: { message: '结果是 {{ghost.text}}', level: 'info' } }
      ],
      [{ source: 't', target: 'n' }]
    ), 'n')

    expect(msg).toMatch(/无法解析引用/)
    expect(msg).toMatch(/n\.message/)
    expect(msg).toMatch(/不存在节点 "ghost"/)
  })

  it('引用了上游但不存在的输出字段时，列出可用字段', async () => {
    const msg = await firstError(wf(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'a', type: 'notification', config: { message: 'ok', level: 'info' } },
        { id: 'b', type: 'notification', config: { message: '{{a.nope}}', level: 'info' } }
      ],
      [{ source: 't', target: 'a' }, { source: 'a', target: 'b' }]
    ), 'b')

    expect(msg).toMatch(/没有输出字段 "nope"/)
    // 提示可用字段，便于直接改正
    expect(msg).toMatch(/sent/)
  })

  it('全局变量未定义时报错而非留下 {{global.x}}', async () => {
    const msg = await firstError(wf(
      [{ id: 't', type: 'manual-trigger' }, { id: 'n', type: 'notification', config: { message: '{{global.missing}}', level: 'info' } }],
      [{ source: 't', target: 'n' }]
    ), 'n')

    expect(msg).toMatch(/全局变量 "missing" 未定义/)
  })

  it('凭证缺失时报错并指向安全凭证设置', async () => {
    const msg = await firstError(wf(
      [{ id: 't', type: 'manual-trigger' }, { id: 'n', type: 'notification', config: { message: '{{credentials.absent}}', level: 'info' } }],
      [{ source: 't', target: 'n' }]
    ), 'n')

    expect(msg).toMatch(/凭证 "absent"/)
    expect(msg).toMatch(/安全凭证/)
  })

  it('环境变量缺省时按空串处理，只告警不失败', async () => {
    const definition = wf(
      [{ id: 't', type: 'manual-trigger' }, { id: 'n', type: 'notification', config: { message: 'A={{env.AWF_TEST_UNSET_VAR}}B', level: 'info' } }],
      [{ source: 't', target: 'n' }]
    )
    const logs: string[] = []
    const results = await engine.execute(definition, e => {
      if (e.type === 'node:log') logs.push(String(e.data?.message))
    }, 'exec-env')

    // A= 与 B 之间应为空（通知节点会给消息加级别前缀，故用包含断言）
    expect(String(results.get('n')?.output.message)).toContain('A=B')
    expect(results.get('n')?.status).toBe('success')
    expect(logs.some(l => l.includes('未定义'))).toBe(true)
  })
})

describe('{{input}} 上游输入引用', () => {
  it('单上游时解析为该节点的输出', async () => {
    const results = await engine.execute(wf(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'tp', type: 'text-process', config: { text: '  Hello  ', operation: 'trim' } },
        { id: 'n', type: 'notification', config: { message: '收到 {{input}}', level: 'info' } }
      ],
      [{ source: 't', target: 'tp' }, { source: 'tp', target: 'n' }]
    ), () => undefined, 'exec-input')

    expect(n2(results)).toContain('收到')
    // 单上游 → {{input}} 即该节点整个 output 的 JSON，不再是字面量
    expect(n2(results)).not.toContain('{{input}}')
    expect(n2(results)).toContain('Hello')
  })

  it('{{input.field}} 可取上游单个字段', async () => {
    const results = await engine.execute(wf(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'tp', type: 'text-process', config: { text: 'abc def', operation: 'split', separator: ' ' } },
        { id: 'n', type: 'notification', config: { message: '长度 {{input.length}}', level: 'info' } }
      ],
      [{ source: 't', target: 'tp' }, { source: 'tp', target: 'n' }]
    ), () => undefined, 'exec-input-field')

    expect(String(results.get('n')?.output.message)).toContain('长度 7')
  })
})

describe('模板正文字段不被节点引用规则处理', () => {
  it('提示词模板里的 {{userCity}} 原样保留，由节点自行渲染', async () => {
    const results = await engine.execute(wf(
      [{ id: 't', type: 'manual-trigger' }, { id: 'p', type: 'prompt-template', config: { template: '你好 {{userCity}}', variables: '{"userCity":"杭州"}' } }],
      [{ source: 't', target: 'p' }]
    ), () => undefined, 'exec-ptpl')

    expect(results.get('p')?.status).toBe('success')
    expect(String(results.get('p')?.output.text)).toContain('你好 杭州')
  })

  it('循环模板里的 {{item}} / {{index}} 不被当作节点引用', async () => {
    const results = await engine.execute(wf(
      [{ id: 't', type: 'manual-trigger' }, { id: 'l', type: 'loop', config: { itemsSource: '', items: '["x","y"]', template: '{{index}}={{item}}', mode: 'template' } }],
      [{ source: 't', target: 'l' }]
    ), () => undefined, 'exec-loop')

    expect(results.get('l')?.status).toBe('success')
    expect(results.get('l')?.output.results).toEqual(['0=x', '1=y'])
  })
})

function n2(results: Map<string, { output?: Record<string, unknown> }>): string {
  return String(results.get('n')?.output?.message)
}
