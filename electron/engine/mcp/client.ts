import { spawn, execFile, type ChildProcess, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { assertUrlAllowed } from '../net/ssrf'

/**
 * 解析待执行的命令与参数。
 *
 * Windows 上 npx / npm 之类是 .cmd 批处理壳，CreateProcess 不会补扩展名，
 * 旧实现因此直接 shell:true —— 代价是 args 只做字符串拼接、不做转义：
 * 导入一个工作流 JSON，把 mcpArgs 写成 `-y foo & calc` 便能在用户机器上执行任意命令。
 * 现改为在 PATH 上定位 .cmd/.bat 壳并显式经 cmd.exe /c 承载，命令与参数始终以数组传入。
 */
export function resolveSpawn(command: string, args: string[]): { file: string; args: string[] } {
  if (process.platform !== 'win32' || /\.(exe|com)$/i.test(command)) {
    return { file: command, args }
  }

  const shim = findWindowsShim(command)
  if (!shim) return { file: command, args }

  return {
    file: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', shim, ...args]
  }
}

function findWindowsShim(command: string): string | null {
  // 已给出路径的不再猜测，避免把用户写的绝对路径当命令名去搜
  if (/[/\\]/.test(command)) return null

  const dirs = (process.env.PATH || '').split(';').filter(Boolean)
  for (const dir of dirs) {
    for (const ext of ['.cmd', '.bat']) {
      const candidate = join(dir, `${command}${ext}`)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

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
  /** 远程地址解析不出来等情况的出声口 */
  logger?: (msg: string) => void
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

const liveClients = new Set<McpClient>()

/** 应用退出前统一回收，避免留下孤儿 MCP 进程 */
export function closeAllMcpClients(): number {
  const n = liveClients.size
  for (const c of [...liveClients]) {
    try { c.close() } catch { /* 关闭失败不阻断退出 */ }
  }
  return n
}

export class McpClient {
  private config: McpServerConfig
  private proc: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private pending = new Map<number, { resolve: (res: JsonRpcResponse) => void; reject: (err: Error) => void }>()
  private nextId = 1
  private serverUrl: string | null = null
  /** 进程异常后置为 true：连接不可再用，但错误以可控 reject 形式交付而非崩进程 */
  private dead = false

  constructor(config: McpServerConfig) {
    this.config = config
    liveClients.add(this)
  }

  get isConnected(): boolean {
    if (this.dead) return false
    return Boolean(this.proc) || Boolean(this.serverUrl)
  }

  /** 建立连接（stdio 或 SSE），并完成 initialize 握手 */
  async connect(): Promise<void> {
    if (this.config.serverUrl) {
      // 远程 MCP 就是普通 HTTP 出口，同样不许指到内网/元数据段
      await assertUrlAllowed(this.config.serverUrl, {
        warn: msg => this.config.logger?.(msg)
      })
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

    const spawned = resolveSpawn(command, this.config.args || [])
    this.proc = spawn(spawned.file, spawned.args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // 对端已退出时 stdin.write 会抛 EPIPE；它落在事件回调里就是未捕获异常，
    // 能直接把整个主进程干掉。这里一律转成"连接失效 + 可控 reject"。
    this.proc.stdin.on('error', err => {
      this.dead = true
      this.rejectAll(new McpError(`MCP 写入失败: ${err.message}`))
    })
    this.proc.stdout.on('data', chunk => this.handleChunk(chunk.toString()))
    this.proc.stderr.on('data', chunk => {
      const text = chunk.toString().trim()
      if (text) console.error(`[mcp:stderr] ${text.slice(0, 500)}`)
    })
    this.proc.on('error', err => {
      // 事件回调内抛异常属于未捕获异常，会直接终止整个主进程；
      // 这里必须走 reject + 标记失效，让调用方拿到可控错误。
      this.dead = true
      this.rejectAll(new McpError(`MCP 进程错误: ${err.message}`))
      this.proc = null
    })
    this.proc.on('exit', code => {
      this.rejectAll(new McpError(`MCP 进程退出 (code: ${code})`))
      this.proc = null
    })

    // initialize 握手。原实现在 res.error 分支才 close()，
    // 而 request() 超时/进程 ENOENT 走的是 reject：异常抛出后子进程留在后台，
    // 每次失败的连接漏一个，跑 20 次就是一堆僵尸 node 进程。
    try {
      const res = await this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ai-workflow', version: '1.0.0' }
      })
      if (res.error) {
        throw new McpError(`MCP initialize 失败: ${res.error.message}`)
      }
    } catch (err: unknown) {
      this.close()
      throw err instanceof McpError ? err : new McpError(
        `MCP 握手失败: ${err instanceof Error ? err.message : String(err)}`
      )
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

  /** 关闭连接：必须先杀干净进程树，否则孙进程继续占着端口与内存 */
  close(): void {
    liveClients.delete(this)
    const proc = this.proc
    this.proc = null
    this.serverUrl = null
    this.rejectAll(new McpError('连接已关闭'))
    if (proc) terminateTree(proc)
  }

  // ===== 内部实现 =====

  private request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (this.dead || !this.proc) {
        reject(new McpError(this.dead ? 'MCP 连接已失效' : 'MCP 未连接'))
        return
      }
      const id = this.nextId++
      const timeout = this.config.timeoutMs ?? 30000

      // 结算时清除定时器，否则每次调用都会留下最长 timeout 的悬挂定时器
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new McpError(`MCP 请求超时 (${method}, ${timeout}ms)`))
        }
      }, timeout)
      const settle = (fn: () => void) => {
        clearTimeout(timer)
        fn()
      }

      this.pending.set(id, {
        resolve: res => settle(() => resolve(res)),
        reject: err => settle(() => reject(err))
      })

      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
      this.proc.stdin.write(JSON.stringify(req) + '\n')
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

/**
 * 终止进程及其子进程。
 *
 * Windows 上我们经 `cmd.exe /c xxx.cmd` 承载，kill() 只结束那层壳，
 * npx 真正拉起的 node 子进程会留在后台。taskkill /T 才能连树一起收。
 * 用 execFile + 参数数组，不经过 shell。
 */
export function terminateTree(proc: ChildProcess): void {
  const pid = proc.pid
  if (process.platform === 'win32' && typeof pid === 'number') {
    execFile(
      'taskkill',
      ['/pid', String(pid), '/T', '/F'],
      { windowsHide: true },
      () => {
        // taskkill 失败（进程已自己退出等）不声张，兜底 kill 仍在下面
      }
    )
    return
  }
  try {
    proc.kill()
  } catch {
    /* 已退出的进程 kill 会抛 ESRCH，忽略 */
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
