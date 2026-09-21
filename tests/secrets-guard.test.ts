import { describe, it, expect } from 'vitest'
import {
  looksLikeSecret,
  hasProviderSecretPrefix,
  findSecretPaths,
  redactSecrets,
  scanWorkflowSecrets,
  replaceWorkflowSecretRefs
} from '../electron/engine/secrets-guard'

describe('明文密钥识别 —— 应判定为泄露', () => {
  it('服务商前缀即便键名无关也能识别', () => {
    expect(hasProviderSecretPrefix('sk-abcdefghijklmnopqrstuvwx')).toBe(true)
    expect(hasProviderSecretPrefix('ghp_' + 'A'.repeat(24))).toBe(true)
    expect(hasProviderSecretPrefix('AIza' + 'A'.repeat(22))).toBe(true)
    expect(looksLikeSecret('Bearer sk-abcdefghijklmnopqrstuvwx')).toBe(true)
  })

  it('键名敏感 + 值够长即判定', () => {
    expect(findSecretPaths({ apiKey: 'Ab3dEf6gHi9jKl2mNo4pQr7s' })).toEqual(['apiKey'])
    expect(findSecretPaths({ config: { access_token: 'Ab3dEf6gHi9jKl2mNo4pQr7s' } }))
      .toEqual(['config.access_token'])
  })

  it('明文藏在 JSON 字符串里（HTTP 头的典型写法）也能定位', () => {
    const wf = {
      nodes: [{
        id: 'h1',
        type: 'http-request',
        config: { headers: '{"Authorization":"Bearer sk-abcdefghijklmnopqrstuvwx"}' }
      }]
    }
    const findings = scanWorkflowSecrets(wf)
    expect(findings).toHaveLength(1)
    expect(findings[0].nodeId).toBe('h1')
    expect(findings[0].field).toBe('headers')
    expect(findings[0].innerKey).toBe('Authorization')
  })
})

describe('明文密钥识别 —— 不得误伤正常配置', () => {
  it('模板引用是正确用法，不是泄露', () => {
    expect(looksLikeSecret('{{credentials.openai_key}}')).toBe(false)
    expect(looksLikeSecret('{{env.AZURE_TOKEN}}')).toBe(false)
    expect(scanWorkflowSecrets({
      nodes: [{ id: 'l1', type: 'llm-call', config: { credentialName: 'openai_key' } }]
    })).toEqual([])
    expect(scanWorkflowSecrets({
      nodes: [{ id: 'h1', type: 'http-request', config: { headers: '{"Authorization":"{{credentials.gh}}"}' } }]
    })).toEqual([])
  })

  it('模型名、URL、普通文本、分隔符不应命中', () => {
    const wf = {
      nodes: [{
        id: 'n1',
        type: 'llm-call',
        config: {
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.openai.com/v1',
          userPrompt: '帮我总结这篇文章，注意保留专业术语与数据。',
          temperature: 0.7
        }
      }, {
        id: 'h1',
        type: 'http-request',
        config: { url: 'https://api.github.com/repos/x/y', headers: '{"Accept":"application/json"}' }
      }, {
        id: 't1',
        type: 'text-process',
        config: { text: '  hello world  ', separator: ',', pattern: '\\d{3}-\\d{4}', flags: 'g' }
      }]
    }
    expect(scanWorkflowSecrets(wf)).toEqual([])
  })

  it('短值与含空白的自然语言不会被当作高熵串', () => {
    expect(looksLikeSecret('hello world')).toBe(false)
    expect(looksLikeSecret('sk-short')).toBe(false)
    expect(looksLikeSecret('The quick brown fox jumps over')).toBe(false)
  })

  it('非法 JSON 字符串安全跳过而非抛异常', () => {
    expect(replaceWorkflowSecretRefs('{ not json', new Map([['a.b', 'c']]))).toEqual({
      json: '{ not json', replaced: 0
    })
    expect(scanWorkflowSecrets(null)).toEqual([])
    expect(scanWorkflowSecrets('string')).toEqual([])
    expect(findSecretPaths(undefined)).toEqual([])
  })
})

describe('脱敏与改写', () => {
  it('redactSecrets 返回副本且不改入参', () => {
    const input = { nodes: [{ config: { apiKey: 'Ab3dEf6gHi9jKl2mNo4pQr7s', model: 'gpt-4o' } }] }
    const snapshot = JSON.stringify(input)
    const out = redactSecrets(input)

    expect(JSON.stringify(input)).toBe(snapshot)
    expect((out.nodes[0].config as Record<string, unknown>).apiKey).toBe('[REDACTED]')
    expect((out.nodes[0].config as Record<string, unknown>).model).toBe('gpt-4o')
  })

  it('顶层字段可被替换为凭证名', () => {
    const json = JSON.stringify({ nodes: [{ id: 'l1', config: { apiKeyRef: 'sk-abcdefghijklmnopqrstuvwx' } }] })
    const res = replaceWorkflowSecretRefs(json, new Map([['l1.apiKeyRef', 'purged_l1']]))
    const parsed = JSON.parse(res.json) as { nodes: Array<{ config: Record<string, unknown> }> }

    expect(res.replaced).toBe(1)
    expect(parsed.nodes[0].config.apiKeyRef).toBe('purged_l1')
    expect(res.json).not.toContain('sk-abcdefghijklmnopqrstuvwx')
  })

  it('JSON 字符串内部的明文可替换为模板引用，且结果仍是合法 JSON', () => {
    const json = JSON.stringify({
      nodes: [{ id: 'h1', config: { headers: '{"Authorization":"Bearer sk-abcdefghijklmnopqrstuvwx","Accept":"application/json"}' } }]
    })
    const res = replaceWorkflowSecretRefs(json, new Map([['h1.headers.Authorization', '{{credentials.purged_h1_headers}}']]))
    const node = (JSON.parse(res.json) as { nodes: Array<{ config: { headers: string } }> }).nodes[0]
    const headers = JSON.parse(node.config.headers) as Record<string, string>

    expect(res.replaced).toBe(1)
    expect(headers.Authorization).toBe('{{credentials.purged_h1_headers}}')
    expect(headers.Accept).toBe('application/json')
    // 改写后不应再被识别为泄露
    expect(scanWorkflowSecrets(JSON.parse(res.json))).toEqual([])
  })

  it('未命中的字段不被改动', () => {
    const json = JSON.stringify({ nodes: [{ id: 'n1', config: { model: 'gpt-4o-mini' } }] })
    const res = replaceWorkflowSecretRefs(json, new Map([['n1.other', 'x']]))
    expect(res.replaced).toBe(0)
    expect(JSON.parse(res.json).nodes[0].config.model).toBe('gpt-4o-mini')
  })
})
