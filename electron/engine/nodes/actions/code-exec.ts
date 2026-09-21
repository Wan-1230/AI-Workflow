import { Worker } from 'worker_threads'
import { join } from 'path'
import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'

const CODE_TIMEOUT = 10000 // 10秒代码执行超时

export const definition: NodeDefinition = {
  id: 'code-exec',
  category: 'action',
  displayName: '代码执行',
  description: '在安全沙箱中执行 JavaScript 代码',
  icon: '💻',
  color: '#22c55e',
  inputs: [
    { name: 'code', label: '代码', type: 'string' },
    { name: 'context', label: '上下文数据', type: 'object' }
  ],
  outputs: [
    { name: 'result', label: '执行结果', type: 'any' },
    { name: 'logs', label: '日志输出', type: 'string' }
  ],
  defaultConfig: {
    code: '// 输入数据在 input 变量中\n// 用 return 返回结果\nconst result = input;\nreturn { result };'
  }
}

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const code = (ctx.config.code as string) || 'return { result: "no code" }'
  const input = ctx.inputs

  ctx.logger('在沙箱中执行代码...')

  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, 'sandbox-worker.js')

    let worker: Worker
    try {
      worker = new Worker(workerPath, {
        workerData: { code, input },
        // 资源限制
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 32,
        }
      })
    } catch {
      // 如果 worker 文件不存在（开发模式），回退到 vm 执行
      return executeFallback(code, input, ctx).then(resolve, reject)
    }

    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error(`代码执行超时 (${CODE_TIMEOUT}ms)`))
    }, CODE_TIMEOUT)

    // 监听取消信号
    const signal = (ctx as any).signal as AbortSignal | undefined
    if (signal) {
      const onAbort = () => {
        worker.terminate()
        clearTimeout(timeout)
        reject(new Error('执行已取消'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    worker.on('message', (msg: { success: boolean; result?: unknown; error?: string; logs: string[] }) => {
      clearTimeout(timeout)

      if (msg.logs.length > 0) {
        ctx.logger(`沙箱日志: ${msg.logs.join('; ')}`)
      }

      if (msg.success) {
        ctx.logger('代码执行成功')
        resolve({
          result: msg.result !== undefined ? msg.result : null,
          logs: msg.logs.join('\n')
        })
      } else {
        reject(new Error(`代码执行错误: ${msg.error}`))
      }
    })

    worker.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`沙箱 Worker 错误: ${err.message}`))
    })

    worker.on('exit', (exitCode) => {
      clearTimeout(timeout)
      if (exitCode !== 0) {
        reject(new Error(`沙箱异常退出 (code: ${exitCode})`))
      }
    })
  })
}

/**
 * 回退执行方案（开发模式下 worker 文件可能未编译）
 * 使用 vm 模块 + 严格白名单
 */
async function executeFallback(
  code: string,
  input: Record<string, unknown>,
  ctx: NodeContext
): Promise<Record<string, unknown>> {
  const vm = await import('vm')

  const logs: string[] = []
  const sandboxConsole = {
    log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
    warn: (...args: unknown[]) => logs.push('[warn] ' + args.map(String).join(' ')),
    error: (...args: unknown[]) => logs.push('[error] ' + args.map(String).join(' ')),
  }

  const sandbox = {
    input,
    console: sandboxConsole,
    JSON,
    Math,
    Date,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Map,
    Set,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
  }

  const wrappedCode = `
    "use strict";
    (function() {
      ${code}
    })()
  `

  try {
    const scriptResult = vm.runInNewContext(wrappedCode, sandbox, {
      timeout: CODE_TIMEOUT,
      displayErrors: true
    })

    ctx.logger(`代码执行成功，日志: ${logs.join('; ')}`)
    return {
      result: scriptResult !== undefined ? scriptResult : null,
      logs: logs.join('\n')
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    ctx.logger(`代码执行失败: ${message}`)
    throw new Error(`代码执行错误: ${message}`)
  }
}
