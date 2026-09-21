import { describe, it, expect } from 'vitest'
import { McpClient, McpError, resolveSpawn } from '../electron/engine/mcp/client'

/**
 * 命令构造安全：Windows 上曾以 shell:true 承载，参数只拼接不转义，
 * 导入的工作流 JSON 可在 mcpArgs 里注入 `& calc` 执行任意命令。
 */
describe('resolveSpawn 不做 shell 拼接', () => {
  it('参数始终以数组元素独立传递，不会被拼进命令字符串', () => {
    const res = resolveSpawn('some-tool', ['-y', '@mcp/server', '& calc'])
    const argv = [res.file, ...res.args].join(' ')

    // 无论是否走 cmd 壳，注入串都必须仍是独立的一个参数，而非命令的一部分
    expect(res.args).toContain('& calc')
    expect(argv).not.toMatch(/^cmd\.exe \/d \/s \/c some-tool & calc$/)
  })

  it('.exe 命令保持原样直接执行', () => {
    const res = resolveSpawn('C:\\Tools\\server.exe', ['--stdio'])
    expect(res.file).toBe('C:\\Tools\\server.exe')
    expect(res.args).toEqual(['--stdio'])
  })
})

/**
 * E6 回归锁：MCP 子进程故障不得终止主进程。
 *
 * 旧实现在 proc.on('error') 的事件回调里直接 throw，那是未捕获异常而非 rejected promise，
 * 会把整个 Electron 主进程带下去 —— 一个配置错误的 MCP 命令就能让应用崩溃。
 */
describe('MCP 客户端故障隔离', () => {
  it('进程启动失败时以 reject 交付错误，而非抛出未捕获异常', async () => {
    const client = new McpClient({
      command: process.platform === 'win32' ? 'definitely-not-a-real-command-xyz.exe' : '/nonexistent/mcp-binary-xyz',
      args: [],
      timeoutMs: 3000
    })

    // 关键断言是「这里不会把测试进程干掉」；await 拿到的是被妥善 reject 的错误
    await expect(client.connect()).rejects.toThrow(McpError)

    expect(client.isConnected).toBe(false)
    // 失效后再次调用必须立刻可控失败，而不是挂在已死的管道上
    await expect(client.listTools()).rejects.toThrow()
  })

  it('进程启动后立即退出时错误同样被妥善交付', async () => {
    const client = new McpClient({
      command: process.execPath,
      args: ['-e', 'process.exit(3)'],
      timeoutMs: 3000
    })

    // node 可执行文件存在，因此 connect 会走到握手；进程退出应表现为 reject 而非崩溃
    const outcome = await client.connect().then(() => null, (e: unknown) => e)
    expect(outcome).toBeInstanceOf(Error)
    expect(client.isConnected).toBe(false)
  })
})
