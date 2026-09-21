import type { NodeContext, NodeExecuteFn } from '@shared/node'
import { McpClient, McpError, isMcpTextContent } from '../../mcp/client'


/* ===== 内置工具（真实可用，不依赖外部服务） ===== */

const BUILTIN_TOOLS: Record<string, { description: string; run: (args: Record<string, unknown>, ctx: NodeContext) => Promise<unknown> }> = {
  'http-get': {
    description: '发送 HTTP GET 请求，参数: url, headers',
    run: async args => {
      const url = String(args.url || '')
      if (!url) throw new Error('缺少 url 参数')
      const res = await fetch(url, { headers: { 'User-Agent': 'AIWorkflow/1.0' } })
      const text = await res.text()
      let data: unknown = text
      try { data = JSON.parse(text) } catch { /* 保留原文 */ }
      return { status: res.status, data }
    }
  },
  'http-post': {
    description: '发送 HTTP POST 请求，参数: url, body(JSON), headers',
    run: async args => {
      const url = String(args.url || '')
      if (!url) throw new Error('缺少 url 参数')
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AIWorkflow/1.0',
          ...(args.headers as Record<string, string> | undefined)
        },
        body: typeof args.body === 'string' ? args.body : JSON.stringify(args.body ?? {})
      })
      const text = await res.text()
      let data: unknown = text
      try { data = JSON.parse(text) } catch { /* 保留原文 */ }
      return { status: res.status, data }
    }
  },
  'now': {
    description: '返回当前时间，参数: format(iso|timestamp|date)',
    run: async args => {
      const format = String(args.format || 'iso')
      const d = new Date()
      if (format === 'timestamp') return { value: Date.now() }
      if (format === 'date') return { value: d.toLocaleDateString('zh-CN') }
      return { value: d.toISOString() }
    }
  },
  'math': {
    description: '数学计算，参数: expression（如 "1+2*3"）',
    run: async args => {
      const expr = String(args.expression || '')
      if (!expr) throw new Error('缺少 expression 参数')
      // 安全求值：仅允许数字与运算符
      if (!/^[\d\s+\-*/%().]+$/.test(expr)) {
        throw new Error('表达式包含非法字符，仅支持数字与 + - * / % ( )')
      }
      const value = Function(`"use strict"; return (${expr})`)()
      return { value, expression: expr }
    }
  },
  'uuid': {
    description: '生成 UUID',
    run: async () => {
      const { randomUUID } = await import('crypto')
      return { value: randomUUID() }
    }
  }
}

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config
  const toolType = String(config.toolType || 'builtin')
  const toolName = String(config.toolName || '')
  const startedAt = Date.now()

  if (!toolName) throw new Error('工具名为空，请填写 toolName')

  // ===== 内置工具 =====
  if (toolType === 'builtin') {
    const tool = BUILTIN_TOOLS[toolName]
    if (!tool) {
      throw new Error(`未知的内置工具: ${toolName}。可用: ${Object.keys(BUILTIN_TOOLS).join(', ')}`)
    }
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(String(config.arguments || '{}')) as Record<string, unknown>
    } catch {
      throw new Error('arguments 不是合法的 JSON')
    }
    ctx.logger(`调用内置工具 ${toolName}`)
    const result = await tool.run(args, ctx)
    return { result, tool: toolName, duration: Date.now() - startedAt }
  }

  // ===== MCP 工具 =====
  if (toolType === 'mcp') {
    const command = String(config.mcpCommand || '')
    const argsStr = String(config.mcpArgs || '')
    const serverUrl = String(config.mcpUrl || '')
    const timeoutMs = Number(config.timeoutMs ?? 30000)

    let client: McpClient | null = null
    try {
      client = new McpClient(
        serverUrl
          ? { serverUrl, timeoutMs }
          : { command, args: argsStr ? argsStr.split(/\s+/) : [], timeoutMs }
      )
      ctx.logger(`连接 MCP 服务器: ${serverUrl || command}`)
      await client.connect()

      const tools = await client.listTools()
      const tool = tools.find(t => t.name === toolName)
      if (!tool) {
        throw new McpError(`MCP 服务器未提供工具 ${toolName}。可用: ${tools.map(t => t.name).join(', ')}`)
      }

      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(String(config.arguments || '{}')) as Record<string, unknown>
      } catch {
        throw new Error('arguments 不是合法的 JSON')
      }

      ctx.logger(`调用 MCP 工具 ${toolName}`)
      const rawResult = await client.callTool(toolName, args)

      // 提取 text 内容块
      let result: unknown = rawResult
      if (Array.isArray(rawResult)) {
        const texts = rawResult.filter(isMcpTextContent).map(c => c.text)
        result = texts.length > 0 ? texts.join('\n') : rawResult
      }
      return { result, tool: toolName, duration: Date.now() - startedAt, mcp: true }
    } catch (err: unknown) {
      if (err instanceof McpError) throw err
      throw new Error(`MCP 工具调用失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      client?.close()
    }
  }

  throw new Error(`未知的工具类型: ${toolType}（支持 builtin / mcp）`)
}
