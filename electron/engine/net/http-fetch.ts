/* =====================================================================
   带超时、体积上限与 SSRF 复检的 HTTP 出口

   HTTP 节点、内置 http-get/http-post 工具原本各自裸调 fetch：
   一份不传 signal（取消之后请求还在飞），一份不判内网。
   合并到这里，redirect 改为手动跟随，因为安全判定必须逐跳重跑 ——
   自动跟随等于允许任意外网用一条 302 把请求送进 169.254.169.254。
   ===================================================================== */

import { assertUrlAllowed, SsrfError, type LookupAll } from './ssrf'

export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024
export const DEFAULT_REQUEST_TIMEOUT = 30000
export const MAX_REDIRECTS = 5

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

export interface SafeFetchRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxBytes?: number
  signal?: AbortSignal
  allowPrivateNetwork?: boolean
  lookup?: LookupAll
  logger?: (msg: string) => void
}

export interface SafeFetchResponse {
  status: number
  statusText: string
  body: string
  headers: Record<string, string>
  /** 最终落到的地址（跟过跳转后与入参可能不同） */
  finalUrl: string
  hops: number
}

export class HttpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'HttpError'
  }
}

/** 把请求自身的取消与节点的外部取消接在一起 */
function linkSignals(external: AbortSignal | undefined, controller: AbortController): () => void {
  if (!external) return () => undefined
  if (external.aborted) {
    controller.abort()
    return () => undefined
  }
  const onAbort = (): void => controller.abort()
  external.addEventListener('abort', onAbort, { once: true })
  return () => external.removeEventListener('abort', onAbort)
}

async function readCapped(response: Response, maxSize: number): Promise<string> {
  const reader = response.body?.getReader?.()
  if (!reader) {
    const text = await response.text()
    if (text.length > maxSize) {
      throw new HttpError(`响应体过大（${text.length} 字符），上限 ${maxSize} 字节`)
    }
    return text
  }

  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.length
    if (total > maxSize) {
      await reader.cancel().catch(() => undefined)
      throw new HttpError(`响应体超过大小限制（${maxSize} 字节）`)
    }
    chunks.push(value)
  }

  const decoder = new TextDecoder()
  let out = ''
  for (const c of chunks) out += decoder.decode(c, { stream: true })
  return out + decoder.decode()
}

export async function safeFetch(req: SafeFetchRequest): Promise<SafeFetchResponse> {
  const timeoutMs = req.timeoutMs && req.timeoutMs > 0 ? req.timeoutMs : DEFAULT_REQUEST_TIMEOUT
  const maxBytes = req.maxBytes ?? MAX_RESPONSE_BYTES
  const method = (req.method || 'GET').toUpperCase()

  let nextUrl = await validate(req.url, req)
  let hops = 0

  while (true) {
    const controller = new AbortController()
    const unlink = linkSignals(req.signal, controller)
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'AIWorkflow/1.0',
        Accept: '*/*',
        ...(req.headers ?? {})
      }
      const init: RequestInit = {
        method,
        headers: GET_LIKE.has(method) ? withoutBodyHeaders(headers) : headers,
        redirect: 'manual',
        signal: controller.signal
      }
      if (req.body && method !== 'GET' && method !== 'HEAD') init.body = req.body

      response = await fetch(nextUrl.toString(), init)
    } catch (err: unknown) {
      if (req.signal?.aborted) throw new Error('执行已取消')
      if (err instanceof Error && err.name === 'AbortError') {
        throw new HttpError(`请求超时 (${timeoutMs}ms): ${nextUrl.origin}${nextUrl.pathname}`)
      }
      throw new HttpError(`请求失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearTimeout(timer)
      unlink()
    }

    if (req.signal?.aborted) throw new Error('执行已取消')

    if (REDIRECT_STATUS.has(response.status)) {
      const location = response.headers?.get?.('location') ?? response.headers?.get?.('Location')
      if (!location) {
        // 3xx 但没给 Location：不再转圈，直接把这一跳当终态返回
        return await finalize(response, nextUrl, hops)
      }
      if (hops >= MAX_REDIRECTS) {
        throw new HttpError(`重定向次数超过 ${MAX_REDIRECTS} 次，已中止`)
      }
      let target: URL
      try {
        target = new URL(location, nextUrl)
      } catch {
        throw new HttpError(`重定向地址不合法: ${location}`)
      }
      hops += 1
      req.logger?.(`跟随 ${response.status} 跳转到 ${target.host}${target.pathname}`)
      nextUrl = await validate(target.toString(), req)
      // 303 语义上必须改 GET；301/302 对非 GET 也普遍被转成 GET，交给对端裁定即可
      if (response.status === 303 && method !== 'HEAD') {
        req.logger?.('303 响应：改用 GET 请求下一跳')
        return await safeFetch({ ...req, url: nextUrl.toString(), method: 'GET', body: undefined, timeoutMs, maxBytes, lookup: req.lookup })
      }
      continue
    }

    return await finalize(response, nextUrl, hops)
  }
}

const GET_LIKE = new Set(['GET', 'HEAD'])

/** GET/HEAD 不该带实体头，留着会让某些服务端直接 400 */
function withoutBodyHeaders(headers: Record<string, string>): Record<string, string> {
  const copy = { ...headers }
  for (const k of Object.keys(copy)) {
    if (k.toLowerCase() === 'content-type' || k.toLowerCase() === 'content-length') delete copy[k]
  }
  return copy
}

async function validate(url: string, req: SafeFetchRequest): Promise<URL> {
  try {
    return await assertUrlAllowed(url, {
      allowPrivateNetwork: req.allowPrivateNetwork,
      lookup: req.lookup,
      warn: msg => req.logger?.(msg)
    })
  } catch (err: unknown) {
    if (err instanceof SsrfError) throw err
    throw new HttpError(err instanceof Error ? err.message : String(err))
  }
}

async function finalize(response: Response, url: URL, hops: number): Promise<SafeFetchResponse> {
  const declared = response.headers?.get?.('content-length')
  if (declared && Number.parseInt(declared, 10) > MAX_RESPONSE_BYTES) {
    throw new HttpError(`响应体过大（Content-Length: ${declared}），上限 ${MAX_RESPONSE_BYTES} 字节`)
  }
  const body = await readCapped(response, MAX_RESPONSE_BYTES)
  const headers: Record<string, string> = {}
  response.headers?.forEach?.((value, key) => { headers[key] = value })

  return {
    status: response.status,
    statusText: response.statusText ?? '',
    body,
    headers,
    finalUrl: url.toString(),
    hops
  }
}

/** 尽力把响应体解析成 JSON，失败则原样返回文本 */
export function parseMaybeJson(text: string): unknown {
  if (!text) return ''
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
