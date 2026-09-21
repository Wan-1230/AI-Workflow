import type { WorkflowDefinition, WorkflowNode, WorkflowEdge, ExecutionEvent, NodeResult, StreamChunk } from '@shared/workflow'
import type { LlmModelInfo } from '@shared/node'
import { parseWorkflow } from './parser'
import { Scheduler } from './scheduler'
import { Executor } from './executor'

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
    parentVariables?: Record<string, string>
  ): Promise<Map<string, NodeResult>> {
    const signal = abortController.signal

    // 1. 解析工作流
    const parsed = parseWorkflow(wf)

    // 2. 拓扑排序 + 并行分组
    const parallelGroups = this.scheduler.getParallelGroups(parsed.nodes, wf.edges)

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
    for (const group of parallelGroups) {
      // 检查取消信号
      if (signal.aborted) break

      // 过滤出本组中仍然激活的节点
      const activeInGroup = group.filter(id => activeNodes.has(id))
      if (activeInGroup.length === 0) continue

      // 并行执行同组节点
      const promises = activeInGroup.map(nodeId =>
        this.executeSingleNode(nodeId, parsed.nodes, wf, nodeResults, activeNodes, onEvent, abortController, secrets, models, variables, stream)
      )

      await Promise.allSettled(promises)

      // 如果有任何节点失败且非条件节点，终止工作流
      const hasFatalError = activeInGroup.some(nodeId => {
        const result = nodeResults.get(nodeId)
        const node = parsed.nodes.find(n => n.id === nodeId)
        return result?.status === 'error' && node?.type !== 'condition'
      })

      if (hasFatalError) break
    }

    // 6. 取消收尾：无条件回写，避免最后一组并行节点既不产出结果也扫不到
    if (signal.aborted) {
      this.emitCancelled(onEvent, activeNodes, nodeResults)
    }

    // 7. 工作流完成/取消
    const finalStatus = signal.aborted ? 'workflow:cancelled' : 'workflow:complete'
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
    wf: WorkflowDefinition,
    nodeResults: Map<string, NodeResult>,
    activeNodes: Set<string>,
    onEvent: (event: ExecutionEvent) => void,
    abortController: AbortController,
    secrets: Record<string, string>,
    models?: LlmModelInfo[],
    variables?: Record<string, string>,
    stream?: (chunk: StreamChunk) => void
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
      const incomingEdges = wf.edges.filter(e => e.target === nodeId)
      for (const edge of incomingEdges) {
        const upstreamResult = nodeResults.get(edge.source)
        if (upstreamResult && upstreamResult.status === 'success') {
          inputs[edge.source] = upstreamResult.output
        }
      }

      let output: Record<string, unknown>

      // 子工作流节点：由引擎递归执行（不经过注册表）
      if (node.type === 'sub-workflow') {
        output = await this.executeSubWorkflow(node, inputs, onEvent, abortController, secrets, models, variables, stream)
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
          logger: (nid, msg) => {
            onEvent({ type: 'node:log', nodeId: nid, data: { message: msg }, timestamp: Date.now() })
          }
        }, inputs)
      }

      const result: NodeResult = {
        nodeId,
        status: 'success',
        output,
        duration: Date.now() - startTime
      }
      nodeResults.set(nodeId, result)

      // 触发节点完成事件
      onEvent({ type: 'node:complete', nodeId, data: output, timestamp: Date.now() })

      // 条件分支路由：根据输出 branch 停用非选中路径
      if (node.type === 'condition' && output.branch) {
        this.routeBranch(nodeId, String(output.branch), wf.edges, activeNodes)
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
  private async executeSubWorkflow(
    node: { id: string; type: string; config: Record<string, unknown> },
    inputs: Record<string, unknown>,
    onEvent: (event: ExecutionEvent) => void,
    abortController: AbortController,
    secrets: Record<string, string>,
    models?: LlmModelInfo[],
    variables?: Record<string, string>,
    _stream?: (chunk: StreamChunk) => void
  ): Promise<Record<string, unknown>> {
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

    // 子工作流输入注入为全局变量（sub_input 前缀），子流程内可用 {{global.sub_input}} 引用
    if (inputs && Object.keys(inputs).length > 0 && variables) {
      variables['sub_input'] = JSON.stringify(inputs)
    }

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
