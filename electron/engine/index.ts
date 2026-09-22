import type { WorkflowDefinition, WorkflowNode, WorkflowEdge, ExecutionEvent, NodeResult, StreamChunk } from '@shared/workflow'
import type { LlmModelInfo } from '@shared/node'
import { analyzeLoopScopes, type LoopScope } from '@shared/loop-scopes'
import { resolveLoopItems } from './nodes/logic/loop'

/** 单次循环允许的最大项数：逐项执行是串行的，无上限会静默拖死一次运行 */
const MAX_LOOP_ITEMS = 500

/** 循环体作用域：注入到体内节点的插值上下文 */
export interface LoopScopeVars {
  item?: unknown
  index?: number
  count?: number
  loopId?: string
}
import { parseWorkflow } from './parser'
import { Scheduler } from './scheduler'
import { Executor } from './executor'
import { VectorStore } from './rag/vector-store'
import type { RagIndex } from '@shared/rag'

/**
 * 工作流执行引擎
 * - 支持条件分支路由（基于 edge.sourceHandle）
 * - 支持同层并行执行
 * - 支持执行取消（AbortController）
 * - 支持全局变量（{{global.KEY}} 跨节点传递）
 * - 支持子工作流递归执行
 * - 支持流式输出事件（node:stream）
 * - 每次执行创建独立上下文，无共享状态
 */
export class WorkflowEngine {
  private scheduler = new Scheduler()
  private executor = new Executor()
  /**
   * RAG 索引由构造方注入。
   *
   * 此前它是 rag-upload 里的模块级单例：主进程不知道它存在，也就没人给它落盘路径，
   * 于是"重启后索引还在"这件事从来没有实现过。默认值仍给一个内存实例，
   * 但生产入口（主进程）必须传带文件 IO 的那个。
   */
  private rag: RagIndex

  constructor(deps: { rag?: RagIndex } = {}) {
    this.rag = deps.rag ?? new VectorStore()
  }

  // 当前活跃的执行取消控制器
  private activeAborts = new Map<string, AbortController>()

  /**
   * 注入全局默认超时（来自应用设置的 defaultTimeout）。
   * 该设置项曾长期只存在于设置页而无人读取，故显式接线。
   */
  setDefaultTimeout(ms: number): void {
    if (Number.isFinite(ms) && ms > 0) this.executor.defaultTimeout = ms
  }

  /**
   * 取消正在执行的工作流
   */
  cancel(executionId: string): boolean {
    const controller = this.activeAborts.get(executionId)
    if (controller) {
      controller.abort()
      this.activeAborts.delete(executionId)
      return true
    }
    return false
  }

  async execute(
    wf: WorkflowDefinition,
    onEvent: (event: ExecutionEvent) => void,
    executionId?: string,
    secrets?: Record<string, string>,
    models?: LlmModelInfo[]
  ): Promise<Map<string, NodeResult>> {
    const runId = executionId || `run_${Date.now()}`
    const abortController = new AbortController()
    this.activeAborts.set(runId, abortController)

    try {
      return await this.runWorkflow(wf, onEvent, abortController, secrets || {}, models)
    } finally {
      this.activeAborts.delete(runId)
    }
  }

  private async runWorkflow(
    wf: WorkflowDefinition,
    onEvent: (event: ExecutionEvent) => void,
    abortController: AbortController,
    secrets: Record<string, string>,
    models?: LlmModelInfo[],
    /** 父级变量空间（子工作流共享引用，变量跨层传递） */
    parentVariables?: Record<string, string>,
    /** 循环体作用域；仅由 executeLoop 驱动的节点携带 */
    scope?: LoopScopeVars
  ): Promise<Map<string, NodeResult>> {
    const signal = abortController.signal

    // 1. 解析工作流
    const parsed = parseWorkflow(wf)

    // 1.5 循环作用域：循环体内的节点不参与本层调度，改由对应 loop 逐项驱动。
    // 结构非法在此抛出 —— 校验器已在入口拦过一层，这里是防绕过的第二道。
    const analysis = analyzeLoopScopes(parsed.nodes, wf.edges)
    if (analysis.problems.length) {
      throw new Error(`工作流结构不合法：${analysis.problems.map(p => p.message).join('；')}`)
    }

    const loopScopes = new Map(analysis.scopes.map(s => [s.loopId, s]))
    const outerNodes = parsed.nodes.filter(n => !analysis.bodyNodeIds.has(n.id))
    const outerEdges = wf.edges.filter(
      e => !analysis.bodyNodeIds.has(e.source) && !analysis.bodyNodeIds.has(e.target)
    )

    // 2. 拓扑排序 + 并行分组
    const parallelGroups = this.scheduler.getParallelGroups(outerNodes, outerEdges)

    // 3. 存储节点执行结果
    const nodeResults = new Map<string, NodeResult>()

    // 4. 全局变量：父级优先共享，顶层从 wf.variables 初始化
    const variables: Record<string, string> = parentVariables || {}
    if (!parentVariables) {
      for (const v of wf.variables || []) {
        if (v.key && !(v.key in variables)) variables[v.key] = v.value
      }
    }

    // 流式输出回调：转发为 node:stream 事件
    const stream: (chunk: StreamChunk) => void = chunk => {
      onEvent({ type: 'node:stream', nodeId: chunk.nodeId, data: { ...chunk }, timestamp: chunk.timestamp })
    }
    // 4. 活跃节点集合（用于条件分支路由）
    const activeNodes = new Set<string>()
    for (const group of parallelGroups) {
      for (const nodeId of group) {
        activeNodes.add(nodeId)
      }
    }

    // 5. 按组执行（组内并行，组间串行）
    let haltedByError = false

    for (const group of parallelGroups) {
      // 检查取消信号
      if (signal.aborted) break

      // 过滤出本组中仍然激活的节点
      const activeInGroup = group.filter(id => activeNodes.has(id))
      if (activeInGroup.length === 0) continue

      // 并行执行同组节点
      const promises = activeInGroup.map(nodeId =>
        this.executeSingleNode(nodeId, outerNodes, outerEdges, wf, nodeResults, activeNodes, onEvent, abortController, secrets, models, variables, stream, loopScopes, scope)
      )

      await Promise.allSettled(promises)

      // 失败处置：按各节点声明的 onError 策略分流，而非一律中断
      if (this.applyErrorStrategies(activeInGroup, outerNodes, outerEdges, nodeResults, activeNodes, onEvent)) {
        haltedByError = true
        break
      }
    }

    // 6. 取消收尾：无条件回写，避免最后一组并行节点既不产出结果也扫不到
    if (signal.aborted) {
      this.emitCancelled(onEvent, activeNodes, nodeResults)
    } else {
      // 未被激活的节点（分支未命中、或上游按 skip 跳过）补为 skipped，
      // 否则它们既不报错也不产出结果，界面与历史里都是悬空状态。
      // 只看本层节点：循环体内节点由 executeLoop 逐轮写入，不在这里补写
      this.materializeSkipped(outerNodes, nodeResults, onEvent)
    }

    // 7. 工作流终态
    const finalStatus = signal.aborted
      ? 'workflow:cancelled'
      : haltedByError
        ? 'workflow:error'
        : 'workflow:complete'
    onEvent({
      type: finalStatus as ExecutionEvent['type'],
      timestamp: Date.now()
    })

    return nodeResults
  }

  /**
   * 执行单个节点并处理分支路由
   */
  private async executeSingleNode(
    nodeId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    wf: WorkflowDefinition,
    nodeResults: Map<string, NodeResult>,
    activeNodes: Set<string>,
    onEvent: (event: ExecutionEvent) => void,
    abortController: AbortController,
    secrets: Record<string, string>,
    models?: LlmModelInfo[],
    variables?: Record<string, string>,
    stream?: (chunk: StreamChunk) => void,
    loopScopes?: Map<string, LoopScope>,
    scope?: LoopScopeVars
  ): Promise<void> {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return

    // 再次检查取消
    if (abortController.signal.aborted) return

    // 触发节点开始事件
    const startTime = Date.now()
    onEvent({ type: 'node:start', nodeId, timestamp: startTime })

    try {
      // 收集上游节点的输出作为输入
      const inputs: Record<string, unknown> = {}
      const incomingEdges = edges.filter(e => e.target === nodeId)
      for (const edge of incomingEdges) {
        const upstreamResult = nodeResults.get(edge.source)
        if (upstreamResult && upstreamResult.status === 'success') {
          inputs[edge.source] = upstreamResult.output
        }
      }

      let output: Record<string, unknown>
      let iterations: NodeResult[][] | undefined

      // 循环节点（新式：画布上有循环体）：由引擎逐项驱动循环体子图
      const loopScope = node.type === 'loop' ? loopScopes?.get(node.id) : undefined
      if (loopScope) {
        const r = await this.executeLoop(
          node, loopScope, wf, nodeResults, onEvent, abortController, secrets, models, variables
        )
        output = r.output
        iterations = r.iterations
      } else if (node.type === 'sub-workflow') {
        // 子工作流节点：由引擎递归执行（不经过注册表）
        output = await this.executeSubWorkflow(node, {
          inputs, wf, nodeResults, onEvent, abortController, secrets, models, variables, stream, scope
        })
      } else {
        // 执行节点（带超时和重试）
        output = await this.executor.executeNode(node, {
          workflow: wf,
          nodeResults,
          secrets,
          variables: variables || {},
          models,
          signal: abortController.signal,
          stream,
          scope,
          rag: this.rag,
          logger: (nid, msg) => {
            onEvent({ type: 'node:log', nodeId: nid, data: { message: msg }, timestamp: Date.now() })
          }
        }, inputs)
      }

      const result: NodeResult = {
        nodeId,
        status: 'success',
        output,
        duration: Date.now() - startTime,
        ...(iterations ? { iterations } : {})
      }
      nodeResults.set(nodeId, result)

      // 触发节点完成事件
      onEvent({ type: 'node:complete', nodeId, data: output, timestamp: Date.now() })

      // 条件分支路由：根据输出 branch 停用非选中路径
      if (node.type === 'condition' && output.branch) {
        this.routeBranch(nodeId, String(output.branch), edges, activeNodes)
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) return // 取消导致的错误不记录

      const message = err instanceof Error ? err.message : String(err)
      const errorResult: NodeResult = {
        nodeId,
        status: 'error',
        output: {},
        error: message,
        duration: Date.now() - startTime
      }
      nodeResults.set(nodeId, errorResult)

      onEvent({ type: 'node:error', nodeId, data: { error: message }, timestamp: Date.now() })
    }
  }

  /**
   * 子工作流节点递归执行
   * 解析内嵌 workflowJson，递归调用 runWorkflow（共享取消控制器，父级取消自动传导）；
   * 子工作流内部事件仅转发节点级事件（避免重复 workflow:* 终态干扰前端）
   */
  /**
   * 逐项执行画布上的循环体。
   *
   * 每轮把 body 子图当作一个内部工作流跑一次，复用同一套中止、错误策略与事件流
   * （嵌套循环因此天然成立：内层 loop 只是外层体内一个普通节点）。
   * 体内节点结果按轮覆盖，使 {{bodyNode.field}} 读到的是当前轮的值；
   * 全部轮次留档在 iterations 里，供历史逐轮回看。
   */
  private async executeLoop(
    loopNode: WorkflowNode,
    scope: LoopScope,
    wf: WorkflowDefinition,
    parentResults: Map<string, NodeResult>,
    onEvent: (event: ExecutionEvent) => void,
    abortController: AbortController,
    secrets: Record<string, string>,
    models?: LlmModelInfo[],
    variables?: Record<string, string>
  ): Promise<{ output: Record<string, unknown>; iterations: NodeResult[][] }> {
    const log = (msg: string): void => {
      onEvent({ type: 'node:log', nodeId: loopNode.id, data: { message: msg }, timestamp: Date.now() })
    }

    // 解析数组来源：上游输出按 done/body 之外的入边收集
    const inputs: Record<string, unknown> = {}
    for (const e of wf.edges.filter(x => x.target === loopNode.id)) {
      const up = parentResults.get(e.source)
      if (up?.status === 'success') inputs[e.source] = up.output
    }

    const items = resolveLoopItems(loopNode.config, inputs, log)
    if (items.length === 0) {
      return { output: { results: [], count: 0, items: [] }, iterations: [] }
    }
    if (items.length > MAX_LOOP_ITEMS) {
      throw new Error(`循环项数 ${items.length} 超过上限 ${MAX_LOOP_ITEMS}，请缩小输入范围或改用批处理`)
    }

    // 用传递闭包：内层循环的体与终点必须一起进来，否则嵌套会静默退化
    const bodyIds = new Set<string>(scope.scopeNodeIds)
    const innerNodes = wf.nodes.filter(n => bodyIds.has(n.id))
    const innerEdges = wf.edges.filter(e => bodyIds.has(e.source) && bodyIds.has(e.target))
    const sharedVariables = variables ?? {}

    const iterations: NodeResult[][] = []
    const results: unknown[] = []

    for (let i = 0; i < items.length; i++) {
      if (abortController.signal.aborted) throw new Error('执行已取消')

      const roundWf: WorkflowDefinition = {
        ...wf,
        id: `${wf.id}#${loopNode.id}#${i}`,
        name: `${wf.name} · 循环体`,
        nodes: innerNodes,
        edges: innerEdges,
        variables: []
      }

      // 内层的 workflow:* 终态不外泄：一轮体跑完不等于整个运行跑完，
      // 直接透传会让运行面板先红后绿。
      const roundResults = await this.runWorkflow(
        roundWf,
        evt => { if (evt.type.startsWith('node:')) onEvent(evt) },
        abortController,
        secrets,
        models,
        sharedVariables,
        { item: items[i], index: i, count: items.length, loopId: loopNode.id }
      )

      const list = [...roundResults.values()]

      // 体内节点按 stop 策略失败时，内层运行会带着一堆 error 收尾，
      // 循环若照常进入下一轮，就等于把失败吞成了「跑完了，只是结果不对」。
      // error-branch 与 skip 另有归宿，不算中止。
      const halted = list.find(r =>
        r.status === 'error'
        && (innerNodes.find(n => n.id === r.nodeId)?.executionConfig?.onError ?? 'stop') === 'stop')
      if (halted) {
        throw new Error(`循环体第 ${i + 1}/${items.length} 项在 ${halted.nodeId} 失败：${halted.error || '未知错误'}`)
      }
      iterations.push(list)
      // 每轮留一份「节点 → 输出」的快照，循环自身因此可被下游汇总引用
      results.push(Object.fromEntries(list.map(r => [r.nodeId, r.output])))

      log(`迭代 ${i + 1}/${items.length} 完成`)
    }

    // 把最后一轮结果并入父层，使 done 出口的下游能引用体内节点输出
    for (const r of iterations.at(-1) ?? []) parentResults.set(r.nodeId, r)

    return {
      output: {
        results,
        count: items.length,
        items,
        item: items[items.length - 1],
        index: items.length - 1
      },
      iterations
    }
  }

  /**
   * 执行子工作流（JSON 内嵌式）
   */
  private async executeSubWorkflow(
    node: { id: string; type: string; config: Record<string, unknown> },
    args: {
      inputs: Record<string, unknown>
      wf: WorkflowDefinition
      nodeResults: Map<string, NodeResult>
      onEvent: (event: ExecutionEvent) => void
      abortController: AbortController
      secrets: Record<string, string>
      models?: LlmModelInfo[]
      variables?: Record<string, string>
      stream?: (chunk: StreamChunk) => void
      scope?: LoopScopeVars
    }
  ): Promise<Record<string, unknown>> {
    const { inputs, wf, nodeResults, onEvent, abortController, secrets, models, stream, scope } = args
    const variables = args.variables ?? {}
    const signal = abortController.signal
    const rawJson = String(node.config.workflowJson || '').trim()
    if (!rawJson) throw new Error('子工作流未配置：请在节点配置中粘贴子工作流 JSON')

    let subWf: WorkflowDefinition
    try {
      subWf = JSON.parse(rawJson) as WorkflowDefinition
    } catch {
      throw new Error('子工作流 JSON 解析失败，请检查格式')
    }
    if (!Array.isArray(subWf.nodes)) {
      throw new Error('子工作流 JSON 缺少 nodes 数组')
    }

    // 子工作流入口数据：优先 config.input（走注册表的节点由执行器插值，这个分支不经过，
    // 需自己解析），未填时退回上游输出聚合。子流程内以 {{global.sub_input}} 引用。
    const declared = typeof node.config.input === 'string' ? node.config.input.trim() : ''
    const subInput = declared
      ? this.executor.resolveField(declared, {
          workflow: wf,
          nodeResults,
          secrets,
          variables,
          models,
          signal,
          stream,
          scope,
          logger: (nid, msg) => {
            onEvent({ type: 'node:log', nodeId: nid, data: { message: msg }, timestamp: Date.now() })
          }
        }, inputs, node.id, 'input')
      : Object.keys(inputs).length
        ? JSON.stringify(inputs)
        : ''
    if (subInput) variables['sub_input'] = subInput

    const startedAt = Date.now()

    // 过滤事件：只转发节点级事件，不转发子流程的 workflow:* 终态
    const subOnEvent = (evt: ExecutionEvent): void => {
      if (evt.type.startsWith('node:')) {
        onEvent(evt)
      }
    }

    const subResults = await this.runWorkflow(
      subWf,
      subOnEvent,
      abortController,
      secrets,
      models,
      variables
    )

    // 取消联动：父级取消时同步取消子流程
    if (signal.aborted) {
      throw new Error('执行已取消')
    }

    const subResultObj: Record<string, unknown> = {}
    let hasError = false
    for (const [key, value] of subResults) {
      subResultObj[key] = value
      if (value.status === 'error') hasError = true
    }

    const summary: Record<string, unknown> = {
      nodeCount: subResults.size,
      errorCount: [...subResults.values()].filter(r => r.status === 'error').length,
      duration: Date.now() - startedAt
    }

    if (hasError) {
      const firstError = [...subResults.values()].find(r => r.status === 'error')
      throw new Error(`子工作流执行失败: ${firstError?.error || '未知错误'}`)
    }

    return {
      results: subResultObj,
      summary,
      status: 'success'
    }
  }

  /**
   * 按节点声明的 onError 策略处置失败。
   *
   * 此前任何节点报错都会立刻中断整条工作流，一个可选步骤失败会带走后续所有可用步骤。
   * 返回 true 表示存在需要中止整条流的失败。
   */
  private applyErrorStrategies(
    executed: string[],
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    nodeResults: Map<string, NodeResult>,
    activeNodes: Set<string>,
    onEvent: (event: ExecutionEvent) => void
  ): boolean {
    let fatal = false

    for (const nodeId of executed) {
      const result = nodeResults.get(nodeId)
      if (!result || result.status !== 'error') continue

      const node = nodes.find(n => n.id === nodeId)
      const strategy = node?.executionConfig?.onError ?? 'stop'

      if (strategy === 'stop') {
        fatal = true
        continue
      }

      // skip / retry-then-skip（重试已由执行器耗尽）：本节点降级为 skipped，其余分支继续
      if (strategy === 'skip' || strategy === 'retry-then-skip') {
        nodeResults.set(nodeId, {
          nodeId,
          status: 'skipped',
          output: {},
          error: result.error,
          duration: result.duration
        })
        onEvent({
          type: 'node:skipped',
          nodeId,
          data: { reason: 'error-skip', error: result.error },
          timestamp: Date.now()
        })
        continue
      }

      // error-branch：保留 error，只让错误出口上的下游继续
      const keepHandle = node?.executionConfig?.errorHandle ?? 'error'
      for (const edge of edges.filter(e => e.source === nodeId)) {
        if ((edge.sourceHandle ?? 'true') !== keepHandle) {
          this.deactivateBranch(edge.target, edges, activeNodes, new Set())
        }
      }
    }

    return fatal
  }

  /**
   * 把未被执行的节点补成 skipped 终态。
   * 未补的话它们既不报错也无结果，在界面上是悬空、在历史里是缺失。
   */
  private materializeSkipped(
    nodes: WorkflowNode[],
    nodeResults: Map<string, NodeResult>,
    onEvent: (event: ExecutionEvent) => void
  ): void {
    for (const node of nodes) {
      if (nodeResults.has(node.id)) continue
      nodeResults.set(node.id, {
        nodeId: node.id,
        status: 'skipped',
        output: {},
        duration: 0
      })
      onEvent({ type: 'node:skipped', nodeId: node.id, timestamp: Date.now() })
    }
  }

  /**
   * 条件分支路由
   * 根据 condition 节点输出的 branch 值，停用未选中分支的所有下游节点
   */
  private routeBranch(
    conditionNodeId: string,
    selectedBranch: string,
    edges: WorkflowEdge[],
    activeNodes: Set<string>
  ): void {
    const outEdges = edges.filter(e => e.source === conditionNodeId)

    for (const edge of outEdges) {
      // 兼容旧数据：无 sourceHandle 的 edge 视为 'true' 分支
      const edgeBranch = edge.sourceHandle || 'true'
      if (edgeBranch !== selectedBranch) {
        // 递归停用该分支下的所有节点
        this.deactivateBranch(edge.target, edges, activeNodes, new Set())
      }
    }
  }

  /**
   * 递归停用分支下的节点
   * 仅停用「唯一入边来自被停用路径」的节点，共享节点（多入边）保留
   */
  private deactivateBranch(
    nodeId: string,
    edges: WorkflowEdge[],
    activeNodes: Set<string>,
    visited: Set<string>
  ): void {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    if (!activeNodes.has(nodeId)) return

    // 检查该节点是否还有其他活跃的入边来源
    const inEdges = edges.filter(e => e.target === nodeId)
    const hasOtherActiveSource = inEdges.some(e => {
      // 如果入边来自 condition 节点且不是被停用的分支，则保留
      return activeNodes.has(e.source) && !visited.has(e.source)
    })

    if (hasOtherActiveSource && inEdges.length > 1) {
      return // 共享节点，不停用
    }

    activeNodes.delete(nodeId)

    // 递归停用下游
    const outEdges = edges.filter(e => e.source === nodeId)
    for (const edge of outEdges) {
      this.deactivateBranch(edge.target, edges, activeNodes, visited)
    }
  }

  /**
   * 取消收尾：为尚未产出结果的活跃节点写入 cancelled 终态。
   *
   * 必须同时写 nodeResults 与发事件：只发事件会让结果图里没有 cancelled 记录，
   * 而持久化侧依据结果图推导状态，导致被取消的执行在历史里显示为「已完成」。
   */
  private emitCancelled(
    onEvent: (event: ExecutionEvent) => void,
    activeNodes: Set<string>,
    nodeResults: Map<string, NodeResult>
  ): void {
    for (const nodeId of activeNodes) {
      if (nodeResults.has(nodeId)) continue
      nodeResults.set(nodeId, {
        nodeId,
        status: 'cancelled',
        output: {},
        error: '执行已取消',
        duration: 0
      })
      onEvent({ type: 'node:cancelled', nodeId, timestamp: Date.now() })
    }
  }
}
