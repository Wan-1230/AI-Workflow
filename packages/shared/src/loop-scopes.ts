import type { WorkflowNode, WorkflowEdge } from '@shared/workflow'

/**
 * 循环作用域推断。
 *
 * 独立成纯函数模块，是为了让"哪些节点属于哪个循环体"这件事可以脱离引擎、
 * 脱离 SQLite 被穷举测试 —— 这部分判断一旦出错，表现是节点静默不执行或重复执行，
 * 比崩溃更难排查。
 *
 * 拓扑约定：
 *   loop 节点有两个出口：'body'（每项进入一次）与 'done'（全部迭代结束后一次）。
 *   循环体 = 从 body 出口可达、且能到达某个 loop-end 的节点集合。
 *   loop-end 是体的终点，不允许有出边（续行请走 loop 的 done 出口）。
 */

export interface LoopScope {
  loopId: string
  /** 直接属于本循环体的节点 id（不含 loop 自身与 loop-end），用于结构校验 */
  bodyNodeIds: string[]
  endId: string
  /** 嵌套在本循环体内的内层 loop id */
  nestedLoopIds: string[]
  /**
   * 传递闭包：直接体内节点 + 本循环的 end + 所有内层循环的体与终点。
   *
   * 必须区分于 bodyNodeIds —— 内层节点归属于内层循环，若外层按直接归属构造
   * 逐项子图，内层的体与终点会被整个丢掉，内层循环随即退化成"只渲染模板"，
   * 表现为嵌套循环静默不执行任何迭代。
   */
  scopeNodeIds: string[]
}

export type ScopeProblemKind =
  | 'missing-end'
  | 'ambiguous-end'
  | 'body-cycle'
  | 'foreign-in-edge'
  | 'end-has-successors'

export interface ScopeProblem {
  kind: ScopeProblemKind
  loopId?: string
  nodeIds: string[]
  message: string
}

export interface ScopeAnalysis {
  scopes: LoopScope[]
  problems: ScopeProblem[]
  /** 节点 id → 所属 loop id。外层调度据此跳过体内节点 */
  ownerOf: Map<string, string>
  /** 属于任一循环体的节点 id 集合 */
  bodyNodeIds: Set<string>
}

/** 出边索引：source → edges */
function outIndex(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
  const map = new Map<string, WorkflowEdge[]>()
  for (const e of edges) {
    const list = map.get(e.source)
    if (list) list.push(e)
    else map.set(e.source, [e])
  }
  return map
}

/** 入边索引：target → edges */
function inIndex(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
  const map = new Map<string, WorkflowEdge[]>()
  for (const e of edges) {
    const list = map.get(e.target)
    if (list) list.push(e)
    else map.set(e.target, [e])
  }
  return map
}

/** 从若干起点出发，沿出边可达的节点集合（exclude 中的节点不可穿越） */
function reachable(
  starts: string[],
  out: Map<string, WorkflowEdge[]>,
  exclude: Set<string>,
  /** 跨循环边界时禁止穿入其它 loop 的 body 子图，否则外层会把内层的 end 误认成自己的终点 */
  skipEdge?: (e: WorkflowEdge) => boolean
): Set<string> {
  const seen = new Set<string>()
  const queue = [...starts]
  while (queue.length) {
    const cur = queue.shift()!
    if (seen.has(cur) || exclude.has(cur)) continue
    seen.add(cur)
    for (const e of out.get(cur) ?? []) {
      if (skipEdge?.(e)) continue
      queue.push(e.target)
    }
  }
  return seen
}

/** 反向可达：能到达 targets 的节点集合 */
function coReachable(
  targets: string[],
  inn: Map<string, WorkflowEdge[]>,
  universe: Set<string>
): Set<string> {
  const seen = new Set<string>()
  const queue = [...targets]
  while (queue.length) {
    const cur = queue.shift()!
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const e of inn.get(cur) ?? []) {
      if (universe.has(e.source)) queue.push(e.source)
    }
  }
  return seen
}

/** 在给定子图内检测回边（返回成环节点，未成环返回空数组） */
function findCycle(subset: Set<string>, out: Map<string, WorkflowEdge[]>): string[] {
  const visiting = new Set<string>()
  const done = new Set<string>()
  const stack: string[] = []

  const dfs = (node: string): string[] | null => {
    if (done.has(node)) return null
    if (visiting.has(node)) {
      const start = stack.indexOf(node)
      return start === -1 ? [node] : [...stack.slice(start), node]
    }
    visiting.add(node)
    stack.push(node)
    for (const e of out.get(node) ?? []) {
      if (!subset.has(e.target)) continue
      const found = dfs(e.target)
      if (found) return found
    }
    stack.pop()
    visiting.delete(node)
    done.add(node)
    return null
  }

  for (const n of subset) {
    const cycle = dfs(n)
    if (cycle) return cycle
  }
  return []
}

const LOOP_TYPE = 'loop'
const LOOP_END_TYPE = 'loop-end'

export function analyzeLoopScopes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ScopeAnalysis {
  const scopes: LoopScope[] = []
  const problems: ScopeProblem[] = []
  const ownerOf = new Map<string, string>()

  const byId = new Map(nodes.map(n => [n.id, n]))
  const loops = nodes.filter(n => n.type === LOOP_TYPE)
  const ends = nodes.filter(n => n.type === LOOP_END_TYPE)
  const endIds = new Set(ends.map(n => n.id))
  const loopIds = new Set(loops.map(l => l.id))

  const out = outIndex(edges)
  const inn = inIndex(edges)

  for (const loop of loops) {
    const outgoing = out.get(loop.id) ?? []
    // 未标 handle 的旧连线视为 body 入口（兼容 S0 前的画布数据）
    const bodyEdges = outgoing.filter(e => (e.sourceHandle ?? 'body') === 'body')
    const hasExplicitBody = outgoing.some(e => e.sourceHandle === 'body')
    const bodyStarts = bodyEdges.map(e => e.target)

    if (bodyStarts.length === 0) {
      // 这个循环没有画布循环体，走旧的逐项模板渲染
      continue
    }

    // 不穿入其它 loop 的 body 子图：内层循环的 loop-end 属于内层
    const forward = reachable(
      bodyStarts,
      out,
      new Set([loop.id]),
      e => e.source !== loop.id && e.sourceHandle === 'body' && loopIds.has(e.source)
    )
    const reachableEnds = [...forward].filter(id => endIds.has(id))

    if (reachableEnds.length === 0) {
      // 只有"明确按新式接了 body 出口"却找不到终点才算结构错误；
      // 旧式模板循环（无 body handle）沿用降级路径，不报错
      if (!hasExplicitBody && isLegacyTemplateLoop(loop)) continue
      problems.push({
        kind: 'missing-end',
        loopId: loop.id,
        nodeIds: [...forward],
        message: `循环 "${labelOf(loop.id, byId)}" 的循环体内找不到 loop-end 节点，无法确定每项迭代的结束位置`
      })
      continue
    }

    // 优先选择唯一直接终点；多个则要求用户消歧
    if (reachableEnds.length > 1) {
      problems.push({
        kind: 'ambiguous-end',
        loopId: loop.id,
        nodeIds: reachableEnds,
        message: `循环 "${labelOf(loop.id, byId)}" 的循环体可达 ${reachableEnds.length} 个 loop-end（${reachableEnds.join('、')}），一次循环只能有一个终点`
      })
      continue
    }

    const endId = reachableEnds[0]
    // 循环体 = 既从 body 入口可达，又能到达 end 的节点（排除 loop 与 end 本身）
    const back = coReachable([endId], inn, new Set(forward))
    const body = new Set<string>(
      [...forward].filter(id => back.has(id) && id !== loop.id && id !== endId)
    )

    const cycle = findCycle(new Set([...body, endId]), out)
    if (cycle.length) {
      problems.push({
        kind: 'body-cycle',
        loopId: loop.id,
        nodeIds: cycle,
        message: `循环 "${labelOf(loop.id, byId)}" 的循环体内部存在回边（${cycle.join(' → ')}），逐项执行无法确定顺序；请把回跳改成下一个 item 的自然迭代`
      })
      continue
    }

    const endSuccessors = (out.get(endId) ?? []).map(e => e.target)
    if (endSuccessors.length > 0) {
      problems.push({
        kind: 'end-has-successors',
        loopId: loop.id,
        nodeIds: [endId, ...endSuccessors],
        message: `loop-end "${labelOf(endId, byId)}" 不应有出边；循环结束后的续行请接到循环节点的 done 出口`
      })
      continue
    }

    // 体内节点的入边只能来自体内或该 loop 本身，否则迭代作用域不成立
    const foreign = [...body].filter(id =>
      (inn.get(id) ?? []).some(e => e.source !== loop.id && !body.has(e.source))
    )
    if (foreign.length) {
      problems.push({
        kind: 'foreign-in-edge',
        loopId: loop.id,
        nodeIds: foreign,
        message: `循环 "${labelOf(loop.id, byId)}" 的体内节点 ${foreign.join('、')} 有来自体外的连线，逐项执行时其输入无法确定`
      })
      continue
    }

    const nested = loops
      .filter(l => l.id !== loop.id && body.has(l.id))
      .map(l => l.id)

    for (const id of body) {
      if (ownerOf.has(id)) {
        // 同一节点被两个循环争夺：后一个报错，避免静默归属
        problems.push({
          kind: 'foreign-in-edge',
          loopId: loop.id,
          nodeIds: [id],
          message: `节点 "${labelOf(id, byId)}" 同时属于两个循环体（${ownerOf.get(id)} 与 ${loop.id}），请改为显式嵌套`
        })
      } else {
        ownerOf.set(id, loop.id)
      }
    }

    scopes.push({
      loopId: loop.id,
      bodyNodeIds: [...body],
      endId,
      nestedLoopIds: nested,
      // 传递闭包在所有 scope 建好后统一计算（此处先占位）
      scopeNodeIds: []
    })
  }

  // 传递闭包：把内层循环的体与终点并入外层作用域，供调度排除与子图构造使用
  const byLoop = new Map(scopes.map(s => [s.loopId, s]))
  const transitivelyOwned = (scope: LoopScope, guard: Set<string>): string[] => {
    const acc = [...scope.bodyNodeIds, scope.endId]
    for (const nestedId of scope.nestedLoopIds) {
      if (guard.has(nestedId)) continue
      guard.add(nestedId)
      const nested = byLoop.get(nestedId)
      if (nested) acc.push(...transitivelyOwned(nested, guard))
    }
    return [...new Set(acc)]
  }

  for (const scope of scopes) {
    scope.scopeNodeIds = transitivelyOwned(scope, new Set([scope.loopId]))
  }

  const allBody = new Set<string>()
  for (const scope of scopes) {
    for (const id of scope.scopeNodeIds) allBody.add(id)
  }

  return {
    scopes,
    problems,
    ownerOf,
    bodyNodeIds: allBody
  }
}

function labelOf(id: string, byId: Map<string, WorkflowNode>): string {
  const n = byId.get(id)
  return n?.label?.trim() ? `${n.label}(${id})` : id
}

/** 该 loop 是否属于"旧式仅模板渲染"（无画布循环体） */
export function isLegacyTemplateLoop(node: WorkflowNode): boolean {
  return typeof node.config?.template === 'string' && node.config.template.trim().length > 0
}
