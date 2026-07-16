import { EventEmitter } from 'events'
import type { WorkflowDefinition, ExecutionEvent, NodeResult } from '@shared/workflow'
import { parseWorkflow } from './parser'
import { Scheduler } from './scheduler'
import { Executor } from './executor'
import { nodeRegistry } from './nodes'

export class WorkflowEngine {
  private scheduler = new Scheduler()
  private executor = new Executor()
  private eventBus = new EventEmitter()

  async execute(
    wf: WorkflowDefinition,
    onEvent: (event: ExecutionEvent) => void
  ): Promise<Map<string, NodeResult>> {
    // 1. 解析工作流
    const parsed = parseWorkflow(wf)

    // 2. 拓扑排序：确定执行顺序
    const executionOrder = this.scheduler.topologicalSort(
      parsed.nodes,
      wf.edges
    )

    // 3. 存储节点执行结果
    const nodeResults = new Map<string, NodeResult>()

    // 4. 监听事件并转发
    this.eventBus.on('execution:event', (evt: ExecutionEvent) => {
      onEvent(evt)
    })

    // 5. 按拓扑序执行节点
    for (const nodeId of executionOrder) {
      const node = parsed.nodes.find(n => n.id === nodeId)
      if (!node) continue

      // 触发节点开始事件
      const startEvent: ExecutionEvent = {
        type: 'node:start',
        nodeId,
        timestamp: Date.now()
      }
      this.eventBus.emit('execution:event', startEvent)

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

        // 执行节点
        const output = await this.executor.executeNode(node, {
          workflow: wf,
          nodeResults,
          secrets: {},
          logger: (nid, msg) => {
            console.log(`[${nid}] ${msg}`)
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
        const completeEvent: ExecutionEvent = {
          type: 'node:complete',
          nodeId,
          data: output,
          timestamp: Date.now()
        }
        this.eventBus.emit('execution:event', completeEvent)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const errorResult: NodeResult = {
          nodeId,
          status: 'error',
          output: {},
          error: message,
          duration: 0
        }
        nodeResults.set(nodeId, errorResult)

        // 触发节点错误事件
        const errorEvent: ExecutionEvent = {
          type: 'node:error',
          nodeId,
          data: { error: message },
          timestamp: Date.now()
        }
        this.eventBus.emit('execution:event', errorEvent)

        // 节点失败则终止工作流
        break
      }
    }

    // 6. 工作流完成
    const completeEvent: ExecutionEvent = {
      type: 'workflow:complete',
      timestamp: Date.now()
    }
    this.eventBus.emit('execution:event', completeEvent)

    // 清理监听器
    this.eventBus.removeAllListeners('execution:event')

    return nodeResults
  }
}
