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
      ?? (execConfig.onError === 'retry-then-skip' ? { maxRetries: 2, interval: 1000 } : undefined)

    // 带重试的执行
    return this.executeWithRetry(node, registered.execute, context, inputs, timeout, retryConfig)
  }

  /**
   * 单字段插值。
   * 供引擎在注册表之外执行的节点（sub-workflow）复用同一套解析规则：
   * 这类节点的 config 不会经过 executeNode，不显式解析就会把 `{{...}}` 原样传下去。
   */
  resolveField(
    value: string,
    context: ExecutionContext,
    inputs: Record<string, unknown>,
    nodeId: string,
    fieldKey: string
  ): string {
    return this.resolveString(value, context, inputs, nodeId, fieldKey)
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

        // 超时不重试：底层已被中止，重试只会把等待时间翻倍
        if (lastError.name === 'TimeoutError') break

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
    const resolvedConfig = this.resolveTemplates(
      node.config, context, inputs, node.id, nodeRegistry.get(node.type)?.definition.fields
    )

    // 每次尝试持有独立控制器：超时或被取消时真正 abort，使节点内部的
    // fetch / Worker / 子进程随之终止。此前用 Promise.race 放弃等待，
    // 底层任务仍在后台跑成孤儿。
    const attempt = new AbortController()
    const onParentAbort = () => attempt.abort(new Error('执行已取消'))
    if (context.signal.aborted) attempt.abort(new Error('执行已取消'))
    else context.signal.addEventListener('abort', onParentAbort, { once: true })

    // 构建节点执行上下文：注入变量 / 模型 / 流式回调
    const nodeContext = {
      config: resolvedConfig,
      inputs,
      secrets: context.secrets,
      variables: context.variables,
      models: context.models,
      signal: attempt.signal as AbortSignal,
      scope: context.scope,
      logger: (msg: string) => context.logger(node.id, msg),
      stream: context.stream
        ? (chunk: Parameters<NonNullable<typeof context.stream>>[0]) => {
            context.stream!({ ...chunk, nodeId: node.id, timestamp: Date.now() })
          }
        : undefined
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`节点执行超时 (${timeout}ms)`)
        err.name = 'TimeoutError'
        attempt.abort(err)
        reject(err)
      }, timeout)
    })

    try {
      return await Promise.race([executeFn(nodeContext), guard])
    } finally {
      if (timer) clearTimeout(timer)
      // 关键：不摘除则每次 attempt 都会在长生命周期的运行信号上留下一个监听器
      context.signal.removeEventListener('abort', onParentAbort)
    }
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

      const onAbort = () => {
        clearTimeout(timer)
        reject(new Error('执行已取消'))
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * 模板变量插值
   * 将 {{nodeId.outputField}} 替换为上游节点的实际输出值
   * 支持嵌套路径: {{nodeId.data.items}}
   */
  /**
   * 模板变量插值
   *
   * 解析不到时抛错而非原样返回。原样返回会让下游拿到字面量 "{{x}}" 继续计算，
   * 条件节点据此比较并报告成功 —— 静默出错比失败更难排查。
   * 例外：catalog 中标记 nodeRefInterpolation:false 的字段（模板正文类）整体跳过，
   * 其占位符由节点自身语义解释（{{item}} / {{varName}} 等）。
   */
  private resolveTemplates(
    config: Record<string, unknown>,
    context: ExecutionContext,
    inputs: Record<string, unknown>,
    nodeId: string,
    fields?: { key: string; nodeRefInterpolation?: boolean }[]
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(config)) {
      const label = `${nodeId}.${key}`

      if (fields?.some(f => f.key === key && f.nodeRefInterpolation === false)) {
        result[key] = value
        continue
      }

      if (typeof value === 'string') {
        result[key] = this.resolveString(value, context, inputs, nodeId, key)
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // 嵌套对象沿用它自己的路径作为前缀，错误信息可定位到 n1.headers.Authorization 一级
        result[key] = this.resolveTemplates(
          value as Record<string, unknown>, context, inputs, label, undefined
        )
      } else if (Array.isArray(value)) {
        result[key] = value.map(item =>
          typeof item === 'string' ? this.resolveString(item, context, inputs, nodeId, key) : item
        )
      } else {
        result[key] = value
      }
    }

    return result
  }

  private resolveString(
    value: string,
    context: ExecutionContext,
    inputs: Record<string, unknown>,
    nodeId: string,
    fieldKey: string
  ): string {
    const label = `${nodeId}.${fieldKey}`

    // 匹配 {{expression}} 模式
    return value.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
      const trimmed = expr.trim()

      // 0. 上游输入聚合引用: {{input}} / {{input.path}}
      if (trimmed === 'input' || trimmed.startsWith('input.')) {
        const keys = Object.keys(inputs)
        const base = keys.length === 1 ? inputs[keys[0]] : inputs
        const resolved = trimmed === 'input'
          ? base
          : this.getNestedValue(base as Record<string, unknown>, trimmed.slice('input.'.length))

        if (resolved === undefined) {
          throw new Error(`无法解析引用 {{${trimmed}}}（${label}）：当前节点没有可用的上游输入`)
        }
        return typeof resolved === 'object' && resolved !== null
          ? JSON.stringify(resolved)
          : String(resolved)
      }

      // 0.5 循环体作用域：{{item}} / {{index}} / {{count}} 与 {{<loopId>.item}} 等
      const scope = context.scope
      if (scope) {
        const pick = (key: string, rest: string): unknown => {
          const base = key === 'item' ? scope.item : key === 'index' ? scope.index : scope.count
          return rest ? this.getNestedValue(base as Record<string, unknown>, rest) : base
        }

        let value: unknown
        let matched = false

        if (trimmed === 'item' || trimmed.startsWith('item.')) {
          value = pick('item', trimmed.slice(5)); matched = true
        } else if (trimmed === 'index') {
          value = scope.index; matched = true
        } else if (trimmed === 'count') {
          value = scope.count; matched = true
        } else if (scope.loopId && trimmed.startsWith(`${scope.loopId}.`)) {
          const sub = trimmed.slice(scope.loopId.length + 1)
          if (sub === 'item' || sub.startsWith('item.')) {
            value = pick('item', sub.slice(5)); matched = true
          } else if (sub === 'index' || sub === 'count') {
            value = pick(sub, ''); matched = true
          }
        }

        if (matched) {
          if (value === undefined) {
            throw new Error(`无法解析引用 {{${trimmed}}}（${label}）：当前循环项没有该字段`)
          }
          return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
        }
      }

      // 1. 全局变量引用: {{global.KEY}}（variable-set 节点写入，跨节点传递）
      if (trimmed.startsWith('global.')) {
        const key = trimmed.slice('global.'.length)
        const found = context.variables[key]
        if (found === undefined) {
          throw new Error(`无法解析引用 {{${trimmed}}}（${label}）：全局变量 "${key}" 未定义，请先用「变量设置」节点写入或检查拼写`)
        }
        return found
      }

      // 2. 凭证引用: {{credentials.KEY}}
      if (trimmed.startsWith('credentials.')) {
        const key = trimmed.slice('credentials.'.length)
        const found = context.secrets[key]
        if (found === undefined) {
          throw new Error(`无法解析引用 {{${trimmed}}}（${label}）：凭证 "${key}" 不存在或无法解密，请在「设置 → 安全凭证」中确认`)
        }
        return found
      }

      // 3. 环境变量: {{env.VAR}} —— 允许缺省，按空串处理并告警
      if (trimmed.startsWith('env.')) {
        const varName = trimmed.slice('env.'.length)
        const found = process.env[varName]
        if (found === undefined) {
          context.logger(nodeId, `环境变量 ${varName} 未定义，${label} 按空值处理`)
          return ''
        }
        return found
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
      return this.resolveNodeReference(trimmed, context, label)
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

  private resolveNodeReference(expr: string, context: ExecutionContext, label: string): string {
    const dotIndex = expr.indexOf('.')
    const nodeId = dotIndex === -1 ? expr : expr.slice(0, dotIndex)
    const path = dotIndex === -1 ? '' : expr.slice(dotIndex + 1)
    const nodeResult = context.nodeResults.get(nodeId)

    if (!nodeResult) {
      throw new Error(`无法解析引用 {{${expr}}}（${label}）：不存在节点 "${nodeId}"，或该节点尚未执行`)
    }
    if (nodeResult.status !== 'success') {
      throw new Error(`无法解析引用 {{${expr}}}（${label}）：节点 "${nodeId}" 状态为 ${nodeResult.status}，无可用输出`)
    }
    if (!path) return JSON.stringify(nodeResult.output)

    const fieldValue = this.getNestedValue(nodeResult.output, path)
    if (fieldValue === undefined) {
      const available = Object.keys(nodeResult.output).join('/') || '无'
      throw new Error(`无法解析引用 {{${expr}}}（${label}）：节点 "${nodeId}" 没有输出字段 "${path}"，可用字段：${available}`)
    }
    return typeof fieldValue === 'object' && fieldValue !== null
      ? JSON.stringify(fieldValue)
      : String(fieldValue)
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
