import type { WorkflowDefinition, WorkflowEdge, ExecutionEvent, NodeResult } from '@shared/workflow'
import { parseWorkflow } from './parser'
import { Scheduler } from './scheduler'
import { Executor } from './executor'

/**
 * 工作流执行引擎
 * - 支持条件分支路由（基于 edge.sourceHandle）
 * - 支持同层并行执行
 * - 支持执行取消（AbortController）
 * - 每次执行创建独立上下文，无共享状态
 */
export class WorkflowEngine {
  private scheduler = new Scheduler()
  private executor = new Executor()

  // 当前活跃的执行取消控制器
  private activeAborts = new Map<string, AbortController>()

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
    secrets?: Record<string, string>
  ): Promise<Map<string, NodeResult>> {
    const runId = executionId || `run_${Date.now()}`
    const abortController = new AbortController()
    this.activeAborts.set(runId, abortController)

    try {
      return await this.runWorkflow(wf, onEvent, abortController, secrets || {})
    } finally {
      this.activeAborts.delete(runId)
    }
  }

  private async runWorkflow(
    wf: WorkflowDefinition,
    onEvent: (event: ExecutionEvent) => void,
    abortController: AbortController,
    secrets: Record<string, string>
  ): Promise<Map<string, NodeResult>> {
    const signal = abortController.signal

    // 1. 解析工作流
    const parsed = parseWorkflow(wf)

    // 2. 拓扑排序 + 并行分组
    const parallelGroups = this.scheduler.getParallelGroups(parsed.nodes, wf.edges)

    // 3. 存储节点执行结果
    const nodeResults = new Map<string, NodeResult>()

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
      if (signal.aborted) {
        this.emitCancelled(onEvent, activeNodes, nodeResults)
        break
      }

      // 过滤出本组中仍然激活的节点
      const activeInGroup = group.filter(id => activeNodes.has(id))
      if (activeInGroup.length === 0) continue

      // 并行执行同组节点
      const promises = activeInGroup.map(nodeId =>
        this.executeSingleNode(nodeId, parsed.nodes, wf, nodeResults, activeNodes, onEvent, signal, secrets)
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

    // 6. 工作流完成/取消
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
    nodes: { id: string; type: string; config: Record<string, unknown> }[],
    wf: WorkflowDefinition,
    nodeResults: Map<string, NodeResult>,
    activeNodes: Set<string>,
    onEvent: (event: ExecutionEvent) => void,
    signal: AbortSignal,
    secrets: Record<string, string>
  ): Promise<void> {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return

    // 再次检查取消
    if (signal.aborted) return

    // 触发节点开始事件
    onEvent({ type: 'node:start', nodeId, timestamp: Date.now() })

    try {
      const startTime = Date.now()

      // 收集上游节点的输出作为输入
      const inputs: Record<string, unknown> = {}
      const incomingEdges = wf.edges.filter(e => e.target === nodeId)
      for (const edge of incomingEdges) {
        const upstreamResult = nodeResults.get(edge.source)
        if (upstreamResult && upstreamResult.status === 'success') {
          inputs[edge.source] = upstreamResult.output
        }
      }

      // 执行节点（带超时和重试）
      const output = await this.executor.executeNode(node as any, {
        workflow: wf,
        nodeResults,
        secrets,
        signal,
        logger: (nid, msg) => {
          onEvent({ type: 'node:log', nodeId: nid, data: { message: msg }, timestamp: Date.now() })
        }
      }, inputs)

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
      if (signal.aborted) return // 取消导致的错误不记录

      const message = err instanceof Error ? err.message : String(err)
      const errorResult: NodeResult = {
        nodeId,
        status: 'error',
        output: {},
        error: message,
        duration: 0
      }
      nodeResults.set(nodeId, errorResult)

      onEvent({ type: 'node:error', nodeId, data: { error: message }, timestamp: Date.now() })
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
   * 发射取消事件
   */
  private emitCancelled(
    onEvent: (event: ExecutionEvent) => void,
    activeNodes: Set<string>,
    nodeResults: Map<string, NodeResult>
  ): void {
    for (const nodeId of activeNodes) {
      if (!nodeResults.has(nodeId)) {
        onEvent({ type: 'node:cancelled', nodeId, timestamp: Date.now() })
      }
    }
  }
}
