import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { validateWorkflow, formatValidationIssues } from '@shared/validator'
import { nodeCatalog, catalogNodeTypes } from '@shared/node-catalog'
import type { WorkflowDefinition } from '@shared/workflow'

/** 构造最小可执行工作流：单节点 + 该节点目录声明的默认配置 */
function oneNode(type: string, overrides: Record<string, unknown> = {}): WorkflowDefinition {
  const def = nodeCatalog[type]
  return {
    id: 'wf-test',
    name: '测试工作流',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    nodes: [{
      id: 'n1',
      type,
      label: def.displayName,
      position: { x: 0, y: 0 },
      config: { ...def.defaultConfig, ...overrides }
    }],
    edges: []
  }
}

function chain(
  specs: Array<{ id: string; type: string; config?: Record<string, unknown> }>,
  links: Array<{ source: string; target: string; sourceHandle?: string }>
): WorkflowDefinition {
  return {
    id: 'wf-chain',
    name: '链式测试',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    nodes: specs.map(s => ({
      id: s.id,
      type: s.type,
      label: s.id,
      position: { x: 0, y: 0 },
      config: { ...nodeCatalog[s.type].defaultConfig, ...(s.config ?? {}) }
    })),
    edges: links.map((l, i) => ({ id: `e${i}`, source: l.source, target: l.target, sourceHandle: l.sourceHandle }))
  }
}

describe('校验器 —— 节点类型放行', () => {
  it('全部节点类型均通过校验（E1 回归锁：曾因白名单写死 5 类而拒绝其余类型）', () => {
    expect(catalogNodeTypes.length).toBeGreaterThanOrEqual(16)
    for (const type of catalogNodeTypes) {
      const res = validateWorkflow(oneNode(type))
      expect(res.errors, `节点 ${type} 应可执行，实际: ${formatValidationIssues(res.errors)}`).toEqual([])
      expect(res.valid).toBe(true)
    }
  })

  it('未登记的节点类型被拒绝，且错误带节点定位', () => {
    const wf = oneNode('manual-trigger')
    wf.nodes[0].type = 'not-a-real-node'
    const res = validateWorkflow(wf)
    expect(res.valid).toBe(false)
    expect(res.errors[0].nodeId).toBe('n1')
    expect(res.errors[0].message).toMatch(/节点类型无效/)
  })

  it('校验器不再持有手写的类型清单（必须与目录同源）', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/shared/src/validator.ts'), 'utf-8')
    expect(source).toContain('new Set(catalogNodeTypes)')
    expect(source).not.toMatch(/VALID_NODE_TYPES\s*=\s*new Set\(\[\s*'/)
  })
})

describe('校验器 —— 结构与连线', () => {
  it('重复节点 ID 被拒绝', () => {
    const wf = oneNode('manual-trigger')
    wf.nodes.push({ ...wf.nodes[0] })
    expect(validateWorkflow(wf).valid).toBe(false)
  })

  it('连线引用不存在的节点被拒绝', () => {
    const wf = oneNode('manual-trigger')
    wf.edges.push({ id: 'e1', source: 'n1', target: 'ghost' })
    const res = validateWorkflow(wf)
    expect(res.errors.some(e => /不存在/.test(e.message))).toBe(true)
  })

  it('未声明的出口句柄被拒绝', () => {
    const wf = chain(
      [{ id: 'c', type: 'condition' }, { id: 'a', type: 'notification' }],
      [{ source: 'c', target: 'a', sourceHandle: 'maybe' }]
    )
    const res = validateWorkflow(wf)
    expect(res.errors.some(e => /出口句柄/.test(e.message))).toBe(true)
  })

  it('多出口节点存在未连线分支时给出告警而非错误', () => {
    const wf = chain(
      [{ id: 'c', type: 'condition' }, { id: 'a', type: 'notification' }],
      [{ source: 'c', target: 'a', sourceHandle: 'true' }]
    )
    const res = validateWorkflow(wf)
    expect(res.valid).toBe(true)
    expect(res.warnings.some(w => /分支出口未连线/.test(w.message))).toBe(true)
  })
})

describe('校验器 —— 跨节点插值引用', () => {
  it('引用不存在的节点时报错（阻止运行期静默退化为字面量文本）', () => {
    const wf = oneNode('notification', { message: '{{nope.text}}' })
    const res = validateWorkflow(wf)
    expect(res.valid).toBe(false)
    expect(res.errors[0].field).toBe('message')
    expect(res.errors[0].message).toMatch(/引用了不存在的节点/)
  })

  it('引用非上游节点时报错（下游引用上游合法，上游引用下游非法）', () => {
    const ok = chain(
      [{ id: 'a', type: 'notification' }, { id: 'b', type: 'notification', config: { message: '{{a.message}}' } }],
      [{ source: 'a', target: 'b' }]
    )
    expect(validateWorkflow(ok).valid).toBe(true)

    const bad = chain(
      [{ id: 'a', type: 'notification', config: { message: '{{b.message}}' } }, { id: 'b', type: 'notification' }],
      [{ source: 'a', target: 'b' }]
    )
    const res = validateWorkflow(bad)
    expect(res.valid).toBe(false)
    expect(res.errors.some(e => /不是当前节点的上游/.test(e.message))).toBe(true)
  })

  it('引用自身输出报错', () => {
    const wf = oneNode('text-process', { text: '{{n1.text}}' })
    expect(validateWorkflow(wf).errors.some(e => /自依赖/.test(e.message))).toBe(true)
  })

  it('保留字与内置函数不作为节点引用校验', () => {
    for (const expr of ['{{input}}', '{{global.KEY}}', '{{env.PATH}}', '{{credentials.token}}', '{{now()}}', '{{json(input)}}']) {
      const res = validateWorkflow(oneNode('notification', { message: expr }))
      expect(res.valid, `${expr} 应被放行: ${formatValidationIssues(res.errors)}`).toBe(true)
    }
  })

  it('模板正文类字段不套用节点引用规则', () => {
    // prompt-template 的 {{userCity}} 与 loop 的 {{item}} 是各自语义内的占位符
    const p = oneNode('prompt-template', { template: '你好 {{userCity}}，总结 {{doc}}' })
    expect(validateWorkflow(p).valid).toBe(true)
    const l = oneNode('loop', { template: '{{index}}: {{item.title}}' })
    expect(validateWorkflow(l).valid).toBe(true)
    const c = oneNode('code-exec', { code: 'return {{ notAMustache }}' })
    expect(validateWorkflow(c).valid).toBe(true)
  })

  it('引用了上游但未声明的输出名时给出告警', () => {
    const wf = chain(
      [{ id: 'a', type: 'notification' }, { id: 'b', type: 'notification', config: { message: '{{a.nope}}' } }],
      [{ source: 'a', target: 'b' }]
    )
    const res = validateWorkflow(wf)
    expect(res.valid).toBe(true)
    expect(res.warnings.some(w => /未声明输出/.test(w.message))).toBe(true)
  })
})

describe('校验器 —— 循环体可见性', () => {
  /** trigger → loop(body → b1 → loop-end)，done 出口留给各用例自行接 */
  function loopGadget(outer: Array<{ id: string; type: string; config?: Record<string, unknown> }>) {
    return {
      specs: [
        { id: 't', type: 'manual-trigger' },
        { id: 'L', type: 'loop', config: { items: ['a', 'b'] } },
        { id: 'b1', type: 'text-process', config: { text: '{{item}}', operation: 'trim' } },
        { id: 'E', type: 'loop-end' },
        ...outer
      ],
      links: [
        { source: 't', target: 'L' },
        { source: 'L', target: 'b1', sourceHandle: 'body' },
        { source: 'b1', target: 'E' }
      ]
    }
  }

  it('done 下游引用体内节点合法（引擎把末轮体内结果并入父层）', () => {
    const g = loopGadget([{ id: 'after', type: 'notification', config: { message: '{{b1.text}}' } }])
    const res = validateWorkflow(chain(g.specs, [...g.links, { source: 'L', target: 'after', sourceHandle: 'done' }]))
    expect(res.errors).toEqual([])
  })

  it('循环之外的节点引用体内节点仍报错（体内输出只在 done 之后可见）', () => {
    const g = loopGadget([{ id: 'peer', type: 'notification', config: { message: '{{b1.text}}' } }])
    const res = validateWorkflow(chain(g.specs, [...g.links, { source: 't', target: 'peer' }]))
    expect(res.errors.some(e => e.nodeId === 'peer' && /b1/.test(e.message))).toBe(true)
  })
})

describe('校验器 —— 输入健壮性', () => {
  it('非对象输入安全拒绝而非抛异常', () => {
    for (const bad of [null, undefined, 42, 'str', []]) {
      const res = validateWorkflow(bad)
      expect(res.valid).toBe(false)
      expect(res.errors.length).toBeGreaterThan(0)
    }
  })

  it('配置嵌套过深被拒绝', () => {
    let deep: Record<string, unknown> = { leaf: 1 }
    for (let i = 0; i < 8; i++) deep = { nested: deep }
    expect(validateWorkflow(oneNode('notification', { message: deep as unknown as string })).valid).toBe(false)
  })
})
