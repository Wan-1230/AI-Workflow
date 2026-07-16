import vm from 'vm'
import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'

export const definition: NodeDefinition = {
  id: 'code-exec',
  category: 'action',
  displayName: '代码执行',
  description: '在沙箱中执行 JavaScript 代码',
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

  const logs: string[] = []
  const sandboxConsole = {
    log: (...args: unknown[]) => logs.push(args.map(String).join(' '))
  }

  try {
    // 使用 vm 模块创建沙箱环境
    const sandbox = {
      input,
      console: sandboxConsole,
      result: undefined as unknown,
      // 安全限制：不暴露 require、process 等危险 API
      JSON,
      Math,
      Date,
      String,
      Number,
      Boolean,
      Array,
      Object,
      parseInt,
      parseFloat,
      isNaN,
      isFinite
    }

    const wrappedCode = `
      (function() {
        ${code}
      })()
    `

    const scriptResult = vm.runInNewContext(wrappedCode, sandbox, {
      timeout: 5000 // 5 秒超时
    })

    ctx.logger(`代码执行成功，日志: ${logs.join('; ')}`)

    return {
      result: scriptResult !== undefined ? scriptResult : sandbox.result,
      logs: logs.join('\n')
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    ctx.logger(`代码执行失败: ${message}`)
    throw new Error(`代码执行错误: ${message}`)
  }
}
