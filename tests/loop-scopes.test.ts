import { describe, it, expect } from 'vitest'
import { analyzeLoopScopes, isLegacyTemplateLoop } from '../electron/engine/graph/scopes'
import type { WorkflowEdge, WorkflowNode } from '@shared/workflow'

function n(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, label: id, position: { x: 0, y: 0 }, config }
}

function e(source: string, target: string, sourceHandle?: string): WorkflowEdge {
  return { id: `${source}->${target}${sourceHandle ? `:${sourceHandle}` : ''}`, source, target, sourceHandle }
}

const kinds = (problems: { kind: string }[]) => problems.map(p => p.kind).sort()

describe('循环作用域推断', () => {
  it('识别线性循环体：loop(body) → a → b → loop-end', () => {
    const r = analyzeLoopScopes(
      [n('L', 'loop'), n('a', 'notification'), n('b', 'text-process'), n('E', 'loop-end')],
      [e('L', 'a', 'body'), e('a', 'b'), e('b', 'E')]
    )

    expect(r.problems).toEqual([])
    expect(r.scopes).toHaveLength(1)
    expect(r.scopes[0].loopId).toBe('L')
    expect(r.scopes[0].bodyNodeIds.sort()).toEqual(['a', 'b'])
    expect(r.scopes[0].endId).toBe('E')
    expect(r.ownerOf.get('a')).toBe('L')
  })

  it('done 出口上的节点不属于循环体', () => {
    const r = analyzeLoopScopes(
      [n('L', 'loop'), n('a', 'notification'), n('E', 'loop-end'), n('after', 'notification')],
      [e('L', 'a', 'body'), e('a', 'E'), e('L', 'after', 'done')]
    )

    expect(r.bodyNodeIds.has('after')).toBe(false)
    expect(r.scopes[0].bodyNodeIds).toEqual(['a'])
  })

  it('分支形的循环体（体内两路汇入同一 end）成立', () => {
    const r = analyzeLoopScopes(
      [n('L', 'loop'), n('a', 'notification'), n('b', 'notification'), n('E', 'loop-end')],
      [e('L', 'a', 'body'), e('a', 'b'), e('a', 'E'), e('b', 'E')]
    )

    expect(r.problems).toEqual([])
    expect(r.bodyNodeIds.has('b')).toBe(true)
  })

  it('缺少 loop-end 时报 missing-end，并列出体内节点', () => {
    const r = analyzeLoopScopes(
      [n('L', 'loop'), n('a', 'notification')],
      [e('L', 'a', 'body')]
    )

    expect(kinds(r.problems)).toEqual(['missing-end'])
    expect(r.problems[0].nodeIds).toEqual(['a'])
    expect(r.problems[0].message).toMatch(/找不到 loop-end/)
  })

  it('体内可达两个 end 时报 ambiguous-end（要求消歧）', () => {
    const r = analyzeLoopScopes(
      [n('L', 'loop'), n('a', 'notification'), n('E1', 'loop-end'), n('E2', 'loop-end')],
      [e('L', 'a', 'body'), e('a', 'E1'), e('a', 'E2')]
    )

    expect(kinds(r.problems)).toEqual(['ambiguous-end'])
    expect(r.problems[0].nodeIds.sort()).toEqual(['E1', 'E2'])
  })

  it('循环体内部回边被拒绝（真环无法逐项定序）', () => {
    const r = analyzeLoopScopes(
      [n('L', 'loop'), n('a', 'notification'), n('b', 'notification'), n('E', 'loop-end')],
      [e('L', 'a', 'body'), e('a', 'b'), e('b', 'a'), e('b', 'E')]
    )

    expect(kinds(r.problems)).toContain('body-cycle')
    expect(r.problems[0].message).toMatch(/回边/)
  })

  it('loop-end 不允许有出边，续行应走 loop 的 done 出口', () => {
    const r = analyzeLoopScopes(
      [n('L', 'loop'), n('a', 'notification'), n('E', 'loop-end'), n('x', 'notification')],
      [e('L', 'a', 'body'), e('a', 'E'), e('E', 'x')]
    )

    expect(kinds(r.problems)).toEqual(['end-has-successors'])
    expect(r.problems[0].message).toMatch(/done 出口/)
  })

  it('体内节点被体外节点指向时报 foreign-in-edge', () => {
    const r = analyzeLoopScopes(
      [n('L', 'loop'), n('out', 'notification'), n('a', 'notification'), n('E', 'loop-end')],
      [e('L', 'a', 'body'), e('out', 'a'), e('a', 'E')]
    )

    expect(kinds(r.problems)).toEqual(['foreign-in-edge'])
    expect(r.problems[0].nodeIds).toEqual(['a'])
  })

  it('嵌套循环：内层 loop 整体落在外层体内', () => {
    const r = analyzeLoopScopes(
      [
        n('LO', 'loop'), n('pre', 'notification'),
        n('LI', 'loop'), n('inner', 'notification'), n('EI', 'loop-end'),
        n('EO', 'loop-end')
      ],
      [
        e('LO', 'pre', 'body'), e('pre', 'LI', 'body'),
        e('LI', 'inner', 'body'), e('inner', 'EI'),
        e('LI', 'EO', 'done')
      ]
    )

    expect(r.problems.map(p => `${p.kind}:${p.message}`).join('\n'), '嵌套结构应被接受').toEqual('')
    const outer = r.scopes.find(s => s.loopId === 'LO')
    const inner = r.scopes.find(s => s.loopId === 'LI')
    expect(outer?.nestedLoopIds).toEqual(['LI'])
    // 外层体内含内层 loop 节点本身；inner 只属于内层的体
    expect(outer?.bodyNodeIds.sort()).toEqual(['LI', 'pre'])
    expect(inner?.bodyNodeIds).toEqual(['inner'])
    expect(r.ownerOf.get('inner')).toBe('LI')
    expect(r.ownerOf.get('LI')).toBe('LO')
  })

  it('两路汇入不同终点时判为歧义，不猜测归属', () => {
    const r = analyzeLoopScopes(
      [
        n('L1', 'loop'), n('a', 'notification'), n('shared', 'notification'), n('E1', 'loop-end'),
        n('L2', 'loop'), n('E2', 'loop-end')
      ],
      [
        e('L1', 'a', 'body'), e('a', 'shared'), e('shared', 'E1'),
        e('L2', 'shared', 'body'), e('shared', 'E2')
      ]
    )

    // shared 同时通往两个 end：对任一循环都是歧义，必须让用户消歧而非静默认领
    expect(kinds(r.problems)).toContain('ambiguous-end')
    expect(r.ownerOf.get('shared')).toBeUndefined()
  })

  it('无 body 出口的旧式模板循环不作为结构错误（交由降级路径处理）', () => {
    const legacy = n('L', 'loop', { template: '第 {{index}} 项', items: '["a"]' })
    const r = analyzeLoopScopes([legacy, n('after', 'notification')], [e('L', 'after')])

    expect(r.problems).toEqual([])
    expect(r.scopes).toEqual([])
    expect(isLegacyTemplateLoop(legacy)).toBe(true)
    expect(isLegacyTemplateLoop(n('L2', 'loop', { template: '  ' }))).toBe(false)
  })

  it('普通边（未标 handle）视为 body 入口，兼容旧连线数据', () => {
    const r = analyzeLoopScopes(
      [n('L', 'loop'), n('a', 'notification'), n('E', 'loop-end')],
      [e('L', 'a'), e('a', 'E')]
    )

    expect(r.problems).toEqual([])
    expect(r.bodyNodeIds.has('a')).toBe(true)
  })

  it('没有循环时返回空结果且不产生命令性问题', () => {
    const r = analyzeLoopScopes([n('a', 'notification')], [])
    expect(r.scopes).toEqual([])
    expect(r.problems).toEqual([])
    expect(r.bodyNodeIds.size).toBe(0)
  })
})
