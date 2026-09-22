import type { NodeContext, NodeExecuteFn } from '@shared/node'
import { safeFetch, parseMaybeJson, DEFAULT_REQUEST_TIMEOUT, MAX_RESPONSE_BYTES } from '../../net/http-fetch'

/**
 * HTTP 请求节点。
 *
 * 出网细节（超时、取消、体积上限、SSRF 复检、逐跳重定向）都在 net/http-fetch 里，
 * 与内置 HTTP 工具共用同一份实现；这里只做配置解析与输出形状。
 */
export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config
  const url = (config.url as string) || ''
  if (!url.trim()) throw new Error('请求地址为空，请填写 url')

  const method = ((config.method as string) || 'GET').toUpperCase()
  const timeoutMs = Number(config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT)
  const allowPrivate = config.allowPrivateNetwork === true

  // headers 在 catalog 里是 JSON 字符串字段，执行器只保证它是合法 JSON，不保证形状
  let headers: Record<string, string> = {}
  const rawHeaders = config.headers
  if (typeof rawHeaders === 'string' && rawHeaders.trim()) {
    const parsed: unknown = JSON.parse(rawHeaders)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('请求头必须是 JSON 对象，如 {"Authorization": "Bearer xxx"}')
    }
    headers = Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)])
    )
  } else if (rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)) {
    headers = Object.fromEntries(
      Object.entries(rawHeaders as Record<string, unknown>).map(([k, v]) => [k, String(v)])
    )
  }

  const body = typeof config.body === 'string' && config.body ? config.body : undefined
  if (body && (method === 'GET' || method === 'HEAD')) {
    ctx.logger(`${method} 不携带请求体，已忽略 body 字段`)
  }

  ctx.logger(`发送 ${method} 请求到 ${url}`)

  const res = await safeFetch({
    url,
    method,
    headers,
    body,
    timeoutMs,
    maxBytes: MAX_RESPONSE_BYTES,
    signal: ctx.signal,
    allowPrivateNetwork: allowPrivate,
    logger: (msg: string) => ctx.logger(msg)
  })

  ctx.logger(`收到响应: ${res.status} ${res.statusText}`)

  return {
    status: res.status,
    statusText: res.statusText,
    data: parseMaybeJson(res.body),
    headers: res.headers,
    finalUrl: res.finalUrl,
    redirects: res.hops,
    size: res.body.length
  }
}
