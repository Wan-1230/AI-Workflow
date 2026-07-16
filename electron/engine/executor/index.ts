import type { WorkflowNode, ExecutionContext, NodeResult } from '@shared/workflow'
import { nodeRegistry } from '../nodes'

/**
 * 节点执行器
 * - 根据节点类型查找注册的处理器
 * - 支持变量插值
 * - 将节点输入替换模板变量
 */
export class Executor {
  async executeNode(
    node: WorkflowNode,
    context: ExecutionContext,
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // 查找注册的节点处理器
    const registered = nodeRegistry.get(node.type)
    if (!registered) {
      throw new Error(`未知的节点类型: ${node.type}。可用的类型: ${[...nodeRegistry.keys()].join(', ')}`)
    }

    // 解析配置中的模板变量 {{nodeId.field}}
    const resolvedConfig = this.resolveTemplates(node.config, context)

    // 构建节点执行上下文
    const nodeContext = {
      config: resolvedConfig,
      inputs,
      secrets: context.secrets,
      logger: (msg: string) => context.logger(node.id, msg)
    }

    // 执行节点
    return await registered.execute(nodeContext)
  }

  /**
   * 模板变量插值
   * 将 {{nodeId.outputField}} 替换为上游节点的实际输出值
   */
  private resolveTemplates(
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        result[key] = this.resolveString(value, context)
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.resolveTemplates(value as Record<string, unknown>, context)
      } else {
        result[key] = value
      }
    }

    return result
  }

  private resolveString(value: string, context: ExecutionContext): string {
    // 匹配 {{nodeId.field}} 模式
    return value.replace(/\{\{(\w+)\.(\w+)\}\}/g, (_match, nodeId, field) => {
      const nodeResult = context.nodeResults.get(nodeId)
      if (nodeResult && nodeResult.status === 'success') {
        const fieldValue = nodeResult.output[field]
        return fieldValue !== undefined ? String(fieldValue) : `{{${nodeId}.${field}}}`
      }
      return `{{${nodeId}.${field}}}`
    })
  }
}
