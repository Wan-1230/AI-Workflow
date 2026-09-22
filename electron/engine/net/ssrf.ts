/* =====================================================================
   出网安全：SSRF 判定（纯函数 + 可注入解析器）

   放在 net/ 下而不是各节点里，是因为三处都会打到网络：HTTP 节点、
   内置 http-get/http-post 工具、MCP 远程 serverUrl。
   各写一份的结局必然是一份被改、两份继续裸奔。
   ===================================================================== */

import net from 'net'
import { promises as dns } from 'dns'

/** 域名解析注入点：测试里不必真查 DNS */
export type LookupAll = (host: string) => Promise<string[]>

export interface SsrfOptions {
  /** 放行内网：本地开发要调自己的服务，但链路本地元数据段仍然拦 */
  allowPrivateNetwork?: boolean
  /** 注入域名解析器；缺省走系统 resolver */
  lookup?: LookupAll
  /** 解析不出来时怎么出声 */
  warn?: (msg: string) => void
}

export const DEFAULT_LOOKUP: LookupAll = async host => {
  const rows = await dns.lookup(host, { all: true, verbatim: true })
  return rows.map(r => r.address)
}

/** 去掉 IPv6 的方括号、统一小写、去掉根域名尾点 */
export function normalizeHost(raw: string): string {
  // 先去尾点再去括号：'[::1].' 这种写法若先剥括号就会留下一个 ]
  return raw.trim().replace(/\.$/, '').replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
}

function parseOctetPart(part: string): number | null {
  if (!/^(0x[0-9a-f]+|[0-9a-f]+)$/i.test(part)) return null
  const v = /^0x[0-9a-f]+$/i.test(part)
    ? Number.parseInt(part.slice(2), 16)
    : /^0[0-7]+$/.test(part)
      ? Number.parseInt(part, 8)          // 010 之类按八进制，与 inet_aton 一致
      : Number.parseInt(part, 10)
  return Number.isFinite(v) && v >= 0 ? v : null
}

/**
 * 把"看起来是 IP 的字面量"归一成标准形式。
 *
 * 这步不能省：解析器接受的简写形式太多，
 *   http://2130706433/、http://0x7f000001/、http://127.0.1/、http://127.1/
 * 全都指向 127.0.0.1。只按字符串匹配 /^127\./ 的判定会被逐个绕过。
 * 返回 null 表示"这是个域名，不是字面 IP"。
 */
export function parseIpLiteral(host: string): string | null {
  const h = normalizeHost(host)
  if (!h) return null

  const fam = net.isIP(h)
  if (fam === 4 || fam === 6) {
    // IPv6 内嵌 IPv4 再归一一次，便于统一判定
    const mapped = /^::ffff:([0-9a-f:.\d]+)$/i.exec(h)
    if (mapped && mapped[1].includes('.')) {
      const inner = net.isIP(mapped[1])
      if (inner === 4) return `::ffff:${mapped[1]}`
    }
    return h
  }

  // 6 段以上说明想写 IPv6 但写坏了：交给 DNS 也解析不出，按不可达处理
  if (h.includes(':')) return null

  const parts = h.split('.')
  if (parts.length > 4 || parts.some(p => p === '')) return null

  const nums: number[] = []
  for (const p of parts) {
    const v = parseOctetPart(p)
    if (v === null) return null
    nums.push(v)
  }

  const n = nums.length
  const head = nums.slice(0, n - 1)
  if (head.some(v => v > 255)) return null

  const tailCount = 4 - head.length
  const last = nums[n - 1]
  if (last >= 2 ** (8 * tailCount)) return null

  const octets = [...head]
  for (let i = tailCount - 1; i >= 0; i--) octets.push((last >>> (8 * i)) & 255)

  return octets.join('.')
}

export function addressFamily(ip: string): 4 | 6 | null {
  const v = net.isIP(ip)
  return v === 4 || v === 6 ? v : null
}

function v4Octets(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return null
  const a = m.slice(1).map(Number)
  return a.every(x => x <= 255) ? a : null
}

function stripMapped(ip: string): string {
  const m = /^::ffff:(.+)$/i.exec(ip)
  return m && addressFamily(m[1]) === 4 ? m[1] : ip
}

/** 私有 / 回环 / 保留 / 组播段判定（含 IPv4-mapped IPv6） */
export function isPrivateAddress(ip: string): boolean {
  const target = stripMapped(ip)
  const fam = addressFamily(target)

  if (fam === 4) {
    const a = v4Octets(target)
    if (!a) return true
    if (a[0] === 0) return true                                 // 0.0.0.0/8，含"本机"
    if (a[0] === 127) return true                               // 回环
    if (a[0] === 10) return true
    if (a[0] === 172 && a[1] >= 16 && a[1] <= 31) return true
    if (a[0] === 192 && a[1] === 168) return true
    if (a[0] === 100 && a[1] >= 64 && a[1] <= 127) return true  // CGNAT 100.64.0.0/10
    if (a[0] === 169 && a[1] === 254) return true              // 链路本地 / 云元数据
    if (a[0] === 192 && a[1] === 0 && (a[2] === 0 || a[2] === 2)) return true
    if (a[0] === 198 && (a[1] === 18 || a[1] === 19)) return true // 基准测试段
    if (a[0] >= 224) return true                                // 组播 + 保留 + 广播
    return false
  }

  if (fam === 6) {
    const h = target.toLowerCase()
    if (h === '::' || h === '::1') return true
    if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true              // fc00::/7 唯一本地
    if (/^fe[89ab][0-9a-f]:/i.test(h)) return true              // fe80::/10 链路本地
    if (/^ff[0-9a-f]{2}:/i.test(h)) return true                 // 组播
    // 6to4（2002:VVVV:WWWW::）里直接嵌着 IPv4，不拆出来就是绕过口
    const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})/i.exec(h)
    if (sixToFour) {
      const hi = Number.parseInt(sixToFour[1], 16)
      const lo = Number.parseInt(sixToFour[2], 16)
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const guess = [(hi >>> 8) & 255, hi & 255, (lo >>> 8) & 255, lo & 255].join('.')
        if (v4Octets(guess)) return isPrivateAddress(guess)
      }
    }
    return false
  }

  return true // 认不出族的字面量，按最保守处理
}

/** 打开「允许内网地址」之后仍然拒绝的段：云元数据与未指定地址 */
export function isAlwaysBlocked(ip: string): boolean {
  const target = stripMapped(ip)
  const fam = addressFamily(target)

  if (fam === 4) {
    const a = v4Octets(target)
    if (!a) return true
    return a[0] === 0 || (a[0] === 169 && a[1] === 254)
  }
  if (fam === 6) {
    const h = target.toLowerCase()
    return h === '::' || /^fe[89ab][0-9a-f]:/i.test(h)
  }
  return true
}

export class SsrfError extends Error {
  constructor(message: string, readonly blockedAddress?: string) {
    super(message)
    this.name = 'SsrfError'
  }
}

/**
 * 协议 + 主机两级校验。返回已解析的 URL 供调用方复用。
 *
 * 已知残余风险：这里解析出的地址与实际建立连接时解析器给出的地址之间
 * 存在 DNS 重绑窗口 —— Node 的 fetch 不提供自定义 resolver 注入口，
 * 彻底关闭需要接管 socket 层。内网开关只对"你自己写的 URL"可信。
 */
export async function assertUrlAllowed(
  rawUrl: string,
  opts: SsrfOptions = {}
): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new SsrfError(`无效的 URL: ${rawUrl}`)
  }

  const protocol = url.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new SsrfError(`不允许的协议 ${url.protocol}，仅支持 http/https`)
  }

  const host = normalizeHost(url.hostname)
  if (!host) throw new SsrfError('URL 缺少主机名')

  const literal = parseIpLiteral(host)
  let candidates: string[] = []

  if (literal) {
    candidates = [literal]
  } else {
    const lookup = opts.lookup ?? DEFAULT_LOOKUP
    try {
      const resolved = await lookup(host)
      candidates = resolved.map(r => parseIpLiteral(r) ?? r)
    } catch (err: unknown) {
      // 解析不了不判死：真打不通的是对端，把"查不到域名"报成安全错误会误伤离线场景。
      // 但必须出声，否则"防护生效了"会变成一种错觉。
      opts.warn?.(
        `域名 ${host} 未能解析，SSRF 判定无法预检该地址（${err instanceof Error ? err.message : String(err)}）`
      )
    }
  }

  for (const ip of candidates) {
    if (isAlwaysBlocked(ip)) {
      throw new SsrfError(
        `安全限制：禁止访问 ${ip}（来自 ${url.host}）。链路本地/云元数据段任何情况下都不放行。`,
        ip
      )
    }
    if (isPrivateAddress(ip) && !opts.allowPrivateNetwork) {
      throw new SsrfError(
        `安全限制：${host} 指向内网地址 ${ip}。确需访问本机服务时，打开节点里的「允许内网地址」；` +
        `注意那等于让工作流能读局域网服务和云元数据，别人给的 JSON 里别开。`,
        ip
      )
    }
  }

  return url
}
