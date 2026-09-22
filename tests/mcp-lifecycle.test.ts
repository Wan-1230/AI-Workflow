import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

/**
 * MCP 子进程的回收。
 *
 * 旧实现只在 initialize 返回 error 时 close()；而"连不上"的常见形态是
 * request() 超时或进程根本没输出 —— 那走的是 reject 分支，异常抛出后
 * spawn 出来的进程谁都不管，失败一次漏一个。
 */

interface FakeChild {
  pid: number
  stdin: EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  stdout: EventEmitter
  stderr: EventEmitter
  on: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  emitExit: (code: number) => void
  emitStdout: (text: string) => void
}

const execFileMock = vi.fn()
let children: FakeChild[] = []

function makeChild(command: string): FakeChild {
  const stdin = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn()
  })
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const child: FakeChild = {
    pid: 4242 + children.length,
    stdin,
    stdout,
    stderr,
    on: vi.fn((evt: string, cb: (...args: unknown[]) => void) => { handlers.set(evt, cb); return child }),
    kill: vi.fn(),
    emitExit: (code: number) => handlers.get('exit')?.(code),
    emitStdout: (text: string) => stdout.emit('data', Buffer.from(text))
  }
  // spawn 内部对 stdin.write 的调用即"请求已发出"，据此可控地喂回响应
  stdin.write.mockImplementation((payload: string) => {
    const msg = JSON.parse(payload) as { method: string; id: number }
    // 'mcp-silent' 故意一声不吭，用来逼出超时分支
    if (msg.method === 'initialize' && command === 'mcp-fake') {
      setTimeout(() => child.emitStdout(JSON.stringify({
        jsonrpc: '2.0', id: msg.id, error: { code: -32600, message: '协议版本不认识' }
      }) + '\n'), 0)
    }
  })
  return child
}

vi.mock('child_process', () => ({
  spawn: vi.fn((command: string) => {
    const c = makeChild(command)
    children.push(c)
    return c
  }),
  execFile: (...args: unknown[]) => {
    execFileMock(...args)
    return { on: vi.fn() }
  }
}))

const { McpClient, closeAllMcpClients } = await import('../electron/engine/mcp/client')

beforeEach(() => {
  children = []
  execFileMock.mockClear()
})

describe('MCP 连接失败后的进程回收', () => {
  it('initialize 返回 error 时进程被回收', async () => {
    const client = new McpClient({ command: 'mcp-fake', args: [], timeoutMs: 500 })
    await expect(client.connect()).rejects.toThrow(/initialize 失败/)
    expect(children).toHaveLength(1)
    const c = children[0]
    expect(c.kill.mock.calls.length + execFileMock.mock.calls.length).toBeGreaterThan(0)
  })

  it('握手超时（服务端一声不吭）时同样回收，而不是只处理 error 分支', async () => {
    const client = new McpClient({ command: 'mcp-silent', args: [], timeoutMs: 30 })
    await expect(client.connect()).rejects.toThrow(/握手失败|MCP 请求超时/)
    const c = children[0]
    expect(c.kill.mock.calls.length + execFileMock.mock.calls.length, '超时路径漏了进程').toBeGreaterThan(0)
    expect(client.isConnected).toBe(false)
  })

  it('失败后不留悬挂客户端：closeAllMcpClients 归零', async () => {
    const a = new McpClient({ command: 'mcp-silent', args: [], timeoutMs: 30 })
    await a.connect().catch(() => undefined)
    const b = new McpClient({ command: 'mcp-fake', args: [], timeoutMs: 500 })
    await b.connect().catch(() => undefined)

    expect(closeAllMcpClients()).toBe(0)
  })

  it('Windows 走进程树终止（taskkill /T /F），且不经过 shell', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const client = new McpClient({ command: 'mcp-silent', args: [], timeoutMs: 30 })
      await client.connect().catch(() => undefined)
      const c = children[0]
      const call = execFileMock.mock.calls.find(args => String(args[0]) === 'taskkill')
      if (!call) throw new Error(`未调用 taskkill：${JSON.stringify(execFileMock.mock.calls)}`)
      expect(call[1]).toEqual(['/pid', String(c.pid), '/T', '/F'])
      expect(c.kill).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process, 'platform', { ...original, configurable: true })
    }
  })

  it('对端退出后写 stdin 不再抛裸 EPIPE', async () => {
    const client = new McpClient({ command: 'mcp-fake', args: [], timeoutMs: 500 })
    await client.connect().catch(() => undefined)
    const c = children[0]
    // 关闭之后再调用：错误应以 reject 交付，而不是在事件回调里抛出
    client.close()
    await expect(client.listTools()).rejects.toThrow()
    expect(c).toBeDefined()
  })
})

describe('MCP 远程 transport 的出网校验', () => {
  it('serverUrl 指向内网时直接拒绝，不发出请求', async () => {
    const client = new McpClient({ serverUrl: 'http://127.0.0.1:9000/mcp', timeoutMs: 300 })
    await expect(client.connect()).rejects.toThrow(/内网|安全限制/)
  })
})
