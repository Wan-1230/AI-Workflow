import type { WorkflowNode, ExecutionContext, RetryConfig } from '@shared/workflow'
import type { NodeExecuteFn } from '@shared/node'
import { nodeRegistry } from '../nodes'

/**
 * 兜底默认超时。曾经为 30s，而前端从不设置 executionConfig，
 * 于是任何一次较长的 LLM 回复或文档入库都必然超时。
 * 实际取值见 executeNode：取「全局设置」与「节点目录声明上限」的较大者，
 * 因此用户可以把超时调高，但不会把 AI 类节点掐回到它的真实耗时需求之下。
 */
const FALLBACK_TIMEOUT = 120000 // 120 秒

/**
 * 节点执行器
 * - 根据节点类型查找注册的处理器
 * - 支持变量插值（{{nodeId.field}} / {{credentials.KEY}} / {{env.VAR}} / {{global.KEY}} / 内置函数）
 * - 支持超时控制 / 自动重试 / 取消信号
 * - 注入全局变量、模型运行时信息、流式输出回调
 */
export class Executor {
  /** 全局默认超时（ms），由主进程在启动与设置变更时从应用设置注入 */
  defaultTimeout = FALLBACK_TIMEOUT

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

    // 获取超时和重试配置：显式配置 > max(全局设置, 节点目录声明的上限)
    const execConfig = node.executionConfig || {}
    const declaredLimit = registered.definition.executionLimits?.timeoutMs ?? 0
    const timeout = execConfig.timeout ?? Math.max(this.defaultTimeout, declaredLimit)
    const retryConfig = execConfig.retry

    // 带重试的执行
    return this.executeWithRetry(node, registered.execute, context, inputs, timeout, retryConfig)
  }

  /**
   * 带重试的执行逻辑
   */
  private async executeWithRetry(
    node: WorkflowNode,
    executeFn: NodeExecuteFn,
    context: ExecutionContext,
    inputs: Record<string, unknown>,
    timeout: number,
    retryConfig?: RetryConfig
  ): Promise<Record<string, unknown>> {
    const maxRetries = retryConfig?.maxRetries ?? 0
    const retryInterval = retryConfig?.interval ?? 1000

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 检查取消信号
      if (context.signal.aborted) {
        throw new Error('执行已取消')
      }

      try {
        // 带超时执行
        const result = await this.executeWithTimeout(
          node, executeFn, context, inputs, timeout
        )
        return result
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err))

        // 如果是取消导致的错误，直接抛出
        if (context.signal.aborted) {
          throw lastError
        }

        // 如果还有重试机会
        if (attempt < maxRetries) {
          context.logger(node.id, `执行失败，${retryInterval}ms 后重试 (${attempt + 1}/${maxRetries})...`)
          await this.delay(retryInterval, context.signal)
        }
      }
    }

    throw lastError || new Error('执行失败')
  }

  /**
   * 带超时的单次执行
   */
  private async executeWithTimeout(
    node: WorkflowNode,
    executeFn: NodeExecuteFn,
    context: ExecutionContext,
    inputs: Record<string, unknown>,
    timeout: number
  ): Promise<Record<string, unknown>> {
    // 解析配置中的模板变量 {{nodeId.field}} / {{global.KEY}} 等
    const resolvedConfig = this.resolveTemplates(node.config, context)

    // 构建节点执行上下文：注入变量 / 模型 / 流式回调
    const nodeContext = {
      config: resolvedConfig,
      inputs,
      secrets: context.secrets,
      variables: context.variables,
      models: context.models,
      signal: context.signal,
      logger: (msg: string) => context.logger(node.id, msg),
      stream: context.stream
        ? (chunk: Parameters<NonNullable<typeof context.stream>>[0]) => {
            context.stream!({ ...chunk, nodeId: node.id, timestamp: Date.now() })
          }
        : undefined
    }

    // 创建超时 Promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`节点执行超时 (${timeout}ms)`))
      }, timeout)

      // 如果取消信号触发，清除定时器
      context.signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('执行已取消'))
      }, { once: true })
    })

    // 竞争：执行 vs 超时
    return await Promise.race([
      executeFn(nodeContext),
      timeoutPromise
    ])
  }

  /**
   * 可取消的延迟
   */
  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('执行已取消'))
        return
      }

      const timer = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('执行已取消'))
      }, { once: true })
    })
  }

  /**
   * 模板变量插值
   * 将 {{nodeId.outputField}} 替换为上游节点的实际输出值
   * 支持嵌套路径: {{nodeId.data.items}}
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
      } else if (Array.isArray(value)) {
        result[key] = value.map(item =>
          typeof item === 'string' ? this.resolveString(item, context) : item
        )
      } else {
        result[key] = value
      }
    }

    return result
  }

  private resolveString(value: string, context: ExecutionContext): string {
    // 匹配 {{expression}} 模式
    return value.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
      const trimmed = expr.trim()

      // 1. 全局变量引用: {{global.KEY}}（variable-set 节点写入，跨节点传递）
      if (trimmed.startsWith('global.')) {
        const key = trimmed.slice('global.'.length)
        return context.variables[key] ?? `{{${trimmed}}}`
      }

      // 2. 凭证引用: {{credentials.KEY}}
      if (trimmed.startsWith('credentials.')) {
        const key = trimmed.slice('credentials.'.length)
        return context.secrets[key] ?? `{{${trimmed}}}`
      }

      // 3. 环境变量: {{env.VAR}}
      if (trimmed.startsWith('env.')) {
        const varName = trimmed.slice('env.'.length)
        return process.env[varName] ?? `{{${trimmed}}}`
      }

      // 4. 内置函数: {{json(nodeId.path)}}
      const jsonMatch = trimmed.match(/^json\((.+)\)$/)
      if (jsonMatch) {
        const inner = this.resolveExpression(jsonMatch[1], context)
        return JSON.stringify(inner, null, 2)
      }

      // 5. 内置函数: {{now()}}
      if (trimmed === 'now()') {
        return new Date().toISOString()
      }

      // 6. 内置函数: {{timestamp()}}
      if (trimmed === 'timestamp()') {
        return String(Date.now())
      }

      // 7. 内置函数: {{length(nodeId.path)}}
      const lengthMatch = trimmed.match(/^length\((.+)\)$/)
      if (lengthMatch) {
        const inner = this.resolveExpression(lengthMatch[1], context)
        if (Array.isArray(inner)) return String(inner.length)
        if (inner && typeof inner === 'object') return String(Object.keys(inner).length)
        if (typeof inner === 'string') return String(inner.length)
        return '0'
      }

      // 8. 普通节点输出引用: {{nodeId}} 或 {{nodeId.path.to.value}}
      return this.resolveNodeReference(trimmed, context)
    })
  }

  /**
   * 解析节点引用表达式
   */
  private resolveExpression(expr: string, context: ExecutionContext): unknown {
    const trimmed = expr.trim()
    const dotIndex = trimmed.indexOf('.')
    if (dotIndex === -1) {
      const nodeResult = context.nodeResults.get(trimmed)
      return nodeResult?.status === 'success' ? nodeResult.output : undefined
    }

    const nodeId = trimmed.slice(0, dotIndex)
    const path = trimmed.slice(dotIndex + 1)
    const nodeResult = context.nodeResults.get(nodeId)
    if (nodeResult && nodeResult.status === 'success') {
      return this.getNestedValue(nodeResult.output, path)
    }
    return undefined
  }

  private resolveNodeReference(expr: string, context: ExecutionContext): string {
    const dotIndex = expr.indexOf('.')
    if (dotIndex === -1) {
      // {{nodeId}} — 返回整个 output 的 JSON
      const nodeResult = context.nodeResults.get(expr)
      if (nodeResult && nodeResult.status === 'success') {
        return JSON.stringify(nodeResult.output)
      }
      return `{{${expr}}}`
    }

    const nodeId = expr.slice(0, dotIndex)
    const path = expr.slice(dotIndex + 1)
    const nodeResult = context.nodeResults.get(nodeId)

    if (nodeResult && nodeResult.status === 'success') {
      const fieldValue = this.getNestedValue(nodeResult.output, path)
      if (fieldValue !== undefined) {
        return typeof fieldValue === 'object' ? JSON.stringify(fieldValue) : String(fieldValue)
      }
    }
    return `{{${expr}}}`
  }

  /**
   * 获取嵌套对象值，支持点号和数组索引
   * 例如: "data.items[0].name"
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
    let current: unknown = obj

    for (const part of parts) {
      if (current === null || current === undefined) return undefined
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }

    return current
  }
}
