import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { Readable } from 'stream'

/* =====================================================================
   轻量 MCP (Model Context Protocol) 客户端
   支持 stdio transport（本地 server 命令）与 SSE transport（远程 URL）
   协议：JSON-RPC 2.0 over stdio / HTTP
   实现子集：initialize / tools/list / tools/call（工具调用所需核心方法）
   ===================================================================== */

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpServerConfig {
  /** stdio：启动命令（如 npx -y @modelcontextprotocol/server-everything） */
  command?: string
  args?: string[]
  /** SSE：远程服务器 URL */
  serverUrl?: string
  /** 请求超时 ms */
  timeoutMs?: number
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

export class McpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpError'
  }
}

export class McpClient {
  private config: McpServerConfig
  private proc: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private pending = new Map<number, { resolve: (res: JsonRpcResponse) => void; reject: (err: Error) => void }>()
  private nextId = 1
  private serverUrl: string | null = null

  constructor(config: McpServerConfig) {
    this.config = config
  }

  get isConnected(): boolean {
    return Boolean(this.proc) || Boolean(this.serverUrl)
  }

  /** 建立连接（stdio 或 SSE），并完成 initialize 握手 */
  async connect(): Promise<void> {
    if (this.config.serverUrl) {
      this.serverUrl = this.config.serverUrl.replace(/\/+$/, '')
      // SSE 连接建立：先做一次 initialize（服务端流式响应通过 events 接口）
      // 简化实现：initialize 通过 POST 完成
      const res = await this.rpcFetch('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ai-workflow', version: '1.0.0' }
      })
      if (res.error) throw new McpError(`MCP initialize 失败: ${res.error.message}`)
      return
    }

    // ===== stdio transport =====
    const command = this.config.command
    if (!command) throw new McpError('MCP 服务器未配置 command 或 serverUrl')

    this.proc = spawn(command, this.config.args || [], {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.proc.stdout.on('data', chunk => this.handleChunk(chunk.toString()))
    this.proc.stderr.on('data', chunk => {
      const text = chunk.toString().trim()
      if (text) console.error(`[mcp:stderr] ${text.slice(0, 500)}`)
    })
    this.proc.on('error', err => {
      throw new McpError(`MCP 进程启动失败: ${err.message}`)
    })
    this.proc.on('exit', code => {
      this.rejectAll(new McpError(`MCP 进程退出 (code: ${code})`))
      this.proc = null
    })

    // initialize 握手
    const res = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ai-workflow', version: '1.0.0' }
    })
    if (res.error) {
      this.close()
      throw new McpError(`MCP initialize 失败: ${res.error.message}`)
    }
  }

  /** 列出可用工具 */
  async listTools(): Promise<McpTool[]> {
    if (this.serverUrl) {
      const res = await this.rpcFetch('tools/list', {})
      if (res.error) throw new McpError(`tools/list 失败: ${res.error.message}`)
      const result = res.result as { tools?: McpTool[] }
      return result.tools || []
    }
    const res = await this.request('tools/list', {})
    if (res.error) throw new McpError(`tools/list 失败: ${res.error.message}`)
    const result = res.result as { tools?: McpTool[] }
    return result.tools || []
  }

  /** 调用工具 */
  async callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
    if (this.serverUrl) {
      const res = await this.rpcFetch('tools/call', { name, arguments: arguments_ })
      if (res.error) throw new McpError(`tools/call 失败: ${res.error.message}`)
      return (res.result as { content?: unknown[] })?.content ?? res.result
    }
    const res = await this.request('tools/call', { name, arguments: arguments_ })
    if (res.error) throw new McpError(`tools/call 失败: ${res.error.message}`)
    return (res.result as { content?: unknown[] })?.content ?? res.result
  }

  /** 关闭连接 */
  close(): void {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
    this.serverUrl = null
    this.rejectAll(new McpError('连接已关闭'))
  }

  // ===== 内部实现 =====

  private request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.proc) {
        reject(new McpError('MCP 未连接'))
        return
      }
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })

      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
      this.proc.stdin.write(JSON.stringify(req) + '\n')

      const timeout = this.config.timeoutMs ?? 30000
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new McpError(`MCP 请求超时 (${method}, ${timeout}ms)`))
        }
      }, timeout)
    })
  }

  private async rpcFetch(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    if (!this.serverUrl) throw new McpError('MCP 未连接')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30000)
    try {
      const res = await fetch(`${this.serverUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params }),
        signal: controller.signal
      })
      if (!res.ok) throw new McpError(`MCP HTTP ${res.status}: ${res.statusText}`)
      return (await res.json()) as JsonRpcResponse
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new McpError(`MCP 请求超时 (${method})`)
      }
      if (err instanceof McpError) throw err
      throw new McpError(`MCP 网络错误: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse
        if (msg.id && this.pending.has(msg.id)) {
          const entry = this.pending.get(msg.id)!
          this.pending.delete(msg.id)
          entry.resolve(msg)
        }
      } catch {
        // 非 JSON 行（日志输出）忽略
      }
    }
  }

  private rejectAll(err: Error): void {
    for (const [, entry] of this.pending) {
      entry.reject(err)
    }
    this.pending.clear()
  }
}

/** 便捷工厂：按配置创建并连接 */
export async function createMcpClient(config: McpServerConfig): Promise<McpClient> {
  const client = new McpClient(config)
  await client.connect()
  return client
}

/** 类型守卫：判断是否为 MCP content 块 */
export function isMcpTextContent(value: unknown): value is { type: 'text'; text: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: string }).type === 'text' &&
    typeof (value as { text?: unknown }).text === 'string'
  )
}
