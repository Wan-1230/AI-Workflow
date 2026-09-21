import { describe, it, expect } from 'vitest'
import { purgeProjectWorkflow } from '../src/main/db/migrations'
import { scanWorkflowSecrets } from '../electron/engine/secrets-guard'

/** 内存版密钥环，替代 safeStorage + SQLite */
function fakeKeyring(available = true) {
  const store = new Map<string, string>()
  return {
    store,
    deps: {
      setCredential: (name: string, value: string) => {
        if (!available) return false
        store.set(name, value)
        return true
      },
      credentialExists: (name: string) => store.has(name)
    }
  }
}

describe('明文密钥迁移（纯函数层）', () => {
  it('把 apiKeyRef 中的明文升格为凭证，并把配置改写为凭证名', () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwx'
    const json = JSON.stringify({
      nodes: [{ id: 'llm1', type: 'llm-call', config: { apiKeyRef: secret, modelId: '' } }]
    })
    const ring = fakeKeyring()

    const res = purgeProjectWorkflow('p1', '我的项目', json, ring.deps)

    expect(res.replaced).toBe(1)
    expect(res.json).not.toContain(secret)
    // apiKeyRef 属于「凭证名」字段，应写裸名而非模板
    const cfg = (JSON.parse(res.json) as { nodes: Array<{ config: Record<string, string> }> }).nodes[0].config
    expect(cfg.apiKeyRef).toBe('purged_p1__llm1__apiKeyRef')
    expect(ring.store.get('purged_p1__llm1__apiKeyRef')).toBe(secret)
    // 报告里不得回显密钥内容
    expect(JSON.stringify(res.promoted)).not.toContain(secret)
  })

  it('普通字符串字段改写为可插值的凭证引用', () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwx'
    const json = JSON.stringify({
      nodes: [{ id: 'h1', type: 'http-request', config: { headers: `{"Authorization":"${secret}","Accept":"application/json"}` } }]
    })
    const ring = fakeKeyring()

    const res = purgeProjectWorkflow('p2', 'HTTP 项目', json, ring.deps)

    expect(res.replaced).toBe(1)
    const headers = JSON.parse(
      (JSON.parse(res.json) as { nodes: Array<{ config: { headers: string } }> }).nodes[0].config.headers
    ) as Record<string, string>
    expect(headers.Authorization).toBe('{{credentials.purged_p2__h1__headers__Authorization}}')
    expect(headers.Accept).toBe('application/json')
    expect(scanWorkflowSecrets(JSON.parse(res.json))).toEqual([])
  })

  it('无明文密钥的项目原样返回，不写密钥环', () => {
    const json = JSON.stringify({
      nodes: [{ id: 'l1', type: 'llm-call', config: { modelId: 'm1', userPrompt: '你好' } }]
    })
    const ring = fakeKeyring()

    const res = purgeProjectWorkflow('p3', '干净项目', json, ring.deps)

    expect(res).toEqual({ json, replaced: 0, promoted: [] })
    expect(ring.store.size).toBe(0)
  })

  it('已存在同名凭证时不重复写入', () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwx'
    const json = JSON.stringify({
      nodes: [{ id: 'llm1', config: { apiKeyRef: secret } }]
    })
    const ring = fakeKeyring()
    ring.deps.setCredential('purged_p4__llm1__apiKeyRef', 'sk-existingexistingexisting')

    const res = purgeProjectWorkflow('p4', '项目', json, ring.deps)

    expect(res.replaced).toBe(1)
    // 原有凭证未被覆盖
    expect(ring.store.get('purged_p4__llm1__apiKeyRef')).toBe('sk-existingexistingexisting')
  })

  it('密钥环不可用时中止迁移，绝不把明文改存到别处', () => {
    const json = JSON.stringify({
      nodes: [{ id: 'llm1', config: { apiKeyRef: 'sk-abcdefghijklmnopqrstuvwx' } }]
    })
    const ring = fakeKeyring(false)

    expect(() => purgeProjectWorkflow('p5', '项目', json, ring.deps))
      .toThrow(/密钥环不可用/)
    expect(ring.store.size).toBe(0)
  })

  it('workflow_json 损坏时安全跳过而非抛错阻断整个迁移', () => {
    const ring = fakeKeyring()
    const res = purgeProjectWorkflow('p6', '坏数据', '{ not valid json', ring.deps)
    expect(res.replaced).toBe(0)
    expect(res.json).toBe('{ not valid json')
  })

  it('凭证名对项目/节点/字段做了字符消毒，可安全作为主键', () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a/b c', config: { apiKeyRef: 'sk-abcdefghijklmnopqrstuvwx' } }]
    })
    const ring = fakeKeyring()
    const res = purgeProjectWorkflow('p#7', '项目', json, ring.deps)

    expect(res.promoted).toHaveLength(1)
    expect(res.promoted[0].credential).toMatch(/^[A-Za-z0-9_]+$/)
  })
})
