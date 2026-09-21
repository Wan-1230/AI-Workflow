import type { NodeContext, NodeExecuteFn } from '@shared/node'

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024 // 10MB 响应体大小限制
const DEFAULT_TIMEOUT = 30000 // 30秒默认超时
const ALLOWED_PROTOCOLS = ['http:', 'https:']

// 内网地址段（SSRF 防护）
const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
]

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config
  const url = (config.url as string) || 'https://api.github.com/zen'
  const method = ((config.method as string) || 'GET').toUpperCase()
  const headers = (config.headers as Record<string, string>) || {}
  const body = config.body as string | undefined
  const timeout = (config.timeout as number) || DEFAULT_TIMEOUT

  // === 安全校验 ===

  // 1. 协议白名单
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error(`无效的 URL: ${url}`)
  }

  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
    throw new Error(`不允许的协议: ${parsedUrl.protocol}，仅支持 http/https`)
  }

  // 2. SSRF 防护（可选，默认开启）
  const allowPrivate = config.allowPrivateNetwork === true
  if (!allowPrivate) {
    const hostname = parsedUrl.hostname
    if (PRIVATE_RANGES.some(range => range.test(hostname)) || hostname === 'localhost') {
      throw new Error(`安全限制: 禁止访问内网地址 (${hostname})。如需访问，请开启 allowPrivateNetwork 配置。`)
    }
  }

  ctx.logger(`发送 ${method} 请求到 ${url}`)

  // === 执行请求 ===

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // 如果外部有取消信号，联动取消
  const externalSignal = ctx.signal
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId)
      throw new Error('执行已取消')
    }
    externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AIWorkflow/1.0',
        ...headers
      },
      signal: controller.signal,
      redirect: 'follow'
    }

    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)

    // 3. 响应体大小检查
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
      throw new Error(`响应体过大 (${parseInt(contentLength)} bytes)，上限 ${MAX_RESPONSE_SIZE} bytes`)
    }

    // 读取响应体（带大小限制）
    const responseData = await readResponseWithLimit(response, MAX_RESPONSE_SIZE)

    let parsed: unknown = responseData
    try {
      parsed = JSON.parse(responseData)
    } catch {
      // 保持原始文本
    }

    ctx.logger(`收到响应: ${response.status} ${response.statusText}`)

    return {
      status: response.status,
      statusText: response.statusText,
      data: parsed,
      headers: Object.fromEntries(response.headers.entries())
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`HTTP 请求超时 (${timeout}ms)`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 读取响应体，带大小限制
 */
async function readResponseWithLimit(response: Response, maxSize: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    return await response.text()
  }

  const chunks: Uint8Array[] = []
  let totalSize = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    totalSize += value.length
    if (totalSize > maxSize) {
      reader.cancel()
      throw new Error(`响应体超过大小限制 (${maxSize} bytes)`)
    }
    chunks.push(value)
  }

  const decoder = new TextDecoder()
  return chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('') + decoder.decode()
}
