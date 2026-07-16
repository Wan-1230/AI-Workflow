import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'

export const definition: NodeDefinition = {
  id: 'http-request',
  category: 'action',
  displayName: 'HTTP 请求',
  description: '发送 HTTP 请求（GET/POST/PUT/DELETE）',
  icon: '🌐',
  color: '#22c55e',
  inputs: [
    { name: 'url', label: 'URL', type: 'string' },
    { name: 'method', label: '方法', type: 'string' },
    { name: 'headers', label: '请求头', type: 'object' },
    { name: 'body', label: '请求体', type: 'any' }
  ],
  outputs: [
    { name: 'status', label: '状态码', type: 'number' },
    { name: 'data', label: '响应数据', type: 'object' },
    { name: 'headers', label: '响应头', type: 'object' }
  ],
  defaultConfig: {
    url: 'https://api.github.com/zen',
    method: 'GET',
    headers: {},
    body: ''
  }
}

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config
  const url = (config.url as string) || 'https://api.github.com/zen'
  const method = (config.method as string) || 'GET'
  const headers = (config.headers as Record<string, string>) || {}
  const body = config.body as string | undefined

  ctx.logger(`发送 ${method} 请求到 ${url}`)

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  }

  if (body && method !== 'GET') {
    fetchOptions.body = body
  }

  const response = await fetch(url, fetchOptions)
  const responseData = await response.text()

  let parsed: unknown = responseData
  try {
    parsed = JSON.parse(responseData)
  } catch {
    // 保持原始文本
  }

  ctx.logger(`收到响应: ${response.status}`)

  return {
    status: response.status,
    data: parsed,
    headers: Object.fromEntries(response.headers.entries())
  }
}
