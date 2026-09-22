import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseIpLiteral, isPrivateAddress, isAlwaysBlocked, normalizeHost,
  assertUrlAllowed, SsrfError
} from '../electron/engine/net/ssrf'
import { safeFetch } from '../electron/engine/net/http-fetch'

/**
 * SSRF 判定。
 *
 * 旧实现是 `^127\.` 之类的字符串匹配，于是 http://2130706433/、http://127.0.1/、
 * http://[::ffff:127.0.0.1]/ 以及"公共域名解析到回环"全都算过关；
 * 再配上 redirect:'follow'，任何一条开放重定向就能把请求送进云元数据接口。
 */

describe('IP 字面量归一', () => {
  it.each([
    ['127.0.0.1', '127.0.0.1'],
    ['2130706433', '127.0.0.1'],
    ['0x7f000001', '127.0.0.1'],
    ['127.1', '127.0.0.1'],
    ['127.0.0', '127.0.0.0'],
    ['10.1', '10.0.0.1'],
    ['192.168.1', '192.168.0.1'],
    ['0', '0.0.0.0'],
    ['::1', '::1'],
    ['[::1]', '::1'],
    ['[::ffff:127.0.0.1]', '::ffff:127.0.0.1'],
    ['256.1.1.1', null],
    ['8.8.8.8.8', null],
    ['localhost', null],
    ['example.com', null]
  ])('%s → %s', (host, expected) => {
    expect(parseIpLiteral(host)).toBe(expected)
  })

  it('主机名统一小写去括号去尾点', () => {
    expect(normalizeHost('[::FFFF:127.0.0.1].')).toBe('::ffff:127.0.0.1')
    expect(normalizeHost('Example.COM.')).toBe('example.com')
  })
})

describe('地址段判定', () => {
  it.each([
    '127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.9', '169.254.1.1',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', 'fe80::1', 'fc00::1', 'fd12::1', 'ff02::1', '::ffff:10.0.0.1',
    '2002:7f00:1::'
  ])('内网/保留段 %s 被识别', ip => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '93.184.216.34', '2606:4700:3037::6815:3834', '203.0.113.5'])(
    '公网地址 %s 不误伤', ip => {
      expect(isPrivateAddress(ip)).toBe(false)
    }
  )

  it('打开内网开关后，云元数据段仍然拒绝', () => {
    expect(isAlwaysBlocked('169.254.169.254')).toBe(true)
    expect(isAlwaysBlocked('fe80::1')).toBe(true)
    expect(isAlwaysBlocked('0.0.0.10')).toBe(true)
    expect(isAlwaysBlocked('192.168.1.1')).toBe(false)
    expect(isAlwaysBlocked('8.8.8.8')).toBe(false)
  })
})

describe('assertUrlAllowed', () => {
  const lookup = (map: Record<string, string[]>) => async (host: string): Promise<string[]> => {
    if (!(host in map)) throw new Error(`ENOTFOUND ${host}`)
    return map[host]
  }

  it('拒绝非 http/https 协议', async () => {
    await expect(assertUrlAllowed('file:///c:/windows/win.ini')).rejects.toBeInstanceOf(SsrfError)
    await expect(assertUrlAllowed('gopher://127.0.0.1:70/')).rejects.toThrow(/协议/)
  })

  it('数字形式的回环地址被拒（旧字符串匹配拦不住）', async () => {
    for (const u of ['http://2130706433/', 'http://127.1/', 'http://0x7f000001/']) {
      await expect(assertUrlAllowed(u)).rejects.toThrow(/内网地址/)
    }
  })

  it('域名解析到回环时被拒（关键：判定看解析结果，不看 URL 写法）', async () => {
    await expect(assertUrlAllowed('http://evil.test/', {
      lookup: lookup({ 'evil.test': ['127.0.0.1'] })
    })).rejects.toThrow(/指向内网地址 127.0.0.1/)
  })

  it('任一 A/AAAA 记录命中内网即拒，不要求全部命中', async () => {
    await expect(assertUrlAllowed('http://evil.test/', {
      lookup: lookup({ 'evil.test': ['93.184.216.34', '::ffff:10.1.2.3'] })
    })).rejects.toThrow(/内网地址/)
  })

  it('allowPrivateNetwork 放行局域网，但元数据段照旧拒绝', async () => {
    const l = lookup({ 'svc.test': ['192.168.4.20'], 'meta.test': ['169.254.169.254'] })
    await expect(assertUrlAllowed('http://svc.test/', { allowPrivateNetwork: true, lookup: l }))
      .resolves.toBeInstanceOf(URL)
    await expect(assertUrlAllowed('http://meta.test/', { allowPrivateNetwork: true, lookup: l }))
      .rejects.toThrow(/链路本地|元数据/)
  })

  it('解析失败不判死，但要出声', async () => {
    const warn = vi.fn()
    await expect(assertUrlAllowed('http://nope.test/', { lookup: lookup({}), warn }))
      .resolves.toBeInstanceOf(URL)
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toContain('未能解析')
  })
})

describe('重定向逐跳复检', () => {
  afterEach(() => vi.unstubAllGlobals())

  const okBody = {
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers(), text: async (): Promise<string> => 'public payload', body: null
  }

  it('公网第一跳 302 到元数据地址时中止，不发出第二跳请求', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      return {
        ok: false, status: 302, statusText: 'Found',
        headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data/' }),
        text: async (): Promise<string> => ''
      }
    }))

    await expect(safeFetch({
      url: 'https://open-redirect.test/go',
      lookup: async () => ['93.184.216.34']
    })).rejects.toThrow(/链路本地|元数据/)

    expect(calls).toHaveLength(1)
  })

  it('跳到允许的公网地址时正常取回响应', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      n += 1
      if (n === 1) {
        return {
          ok: false, status: 301, statusText: 'Moved',
          headers: new Headers({ location: 'https://final.test/x' }), text: async (): Promise<string> => ''
        }
      }
      return okBody
    }))

    const res = await safeFetch({
      url: 'https://first.test/',
      lookup: async () => ['93.184.216.34']
    })
    expect(res.status).toBe(200)
    expect(res.hops).toBe(1)
    expect(res.finalUrl).toContain('final.test')
  })

  it('重定向成环时在 5 跳处止损', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 302, statusText: 'Found',
      headers: new Headers({ location: 'https://loop.test/' }), text: async (): Promise<string> => ''
    })))

    await expect(safeFetch({ url: 'https://loop.test/', lookup: async () => ['93.184.216.34'] }))
      .rejects.toThrow(/重定向次数超过/)
  })

  it('超时把在飞的请求中止，而不是留下孤儿连接', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_res, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          reject(e)
        })
      })))

    await expect(safeFetch({
      url: 'https://slow.test/', timeoutMs: 20, lookup: async () => ['93.184.216.34']
    })).rejects.toThrow(/请求超时/)
  })

  it('外部取消优先于超时报错', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_res, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('abort')))
        setTimeout(() => controller.abort(), 5)
      })))

    await expect(safeFetch({
      url: 'https://slow.test/', signal: controller.signal, lookup: async () => ['93.184.216.34']
    })).rejects.toThrow(/执行已取消/)
  })
})
