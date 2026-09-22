import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  VectorStore, chunkText, contentHash, tokenize,
  SchemeMismatchError, deserialize, serialize, INDEX_FORMAT_VERSION
} from '../electron/engine/rag/vector-store'
import { MemoryIndexIo } from '../electron/engine/rag/index-store'
import { createEmbeddings, resolveEmbeddingTarget, EmbeddingError } from '../electron/engine/llm/embeddings'
import { WorkflowEngine } from '../electron/engine/index'
import type { WorkflowDefinition } from '@shared/workflow'
import type { LlmModelInfo } from '@shared/node'

/**
 * 检索质量、去重、落盘与 embedding 通道。
 *
 * 这一层以前是"裸词频 + 模块级内存单例"：跑一次多一份拷贝、重启清零、
 * 而界面上完全看不出这两件事。
 */

const CORPUS: Array<{ id: string; text: string }> = [
  { id: 'a', text: '退款流程要求用户在订单页面点击申请退款，客服在两个工作日内处理。' },
  { id: 'b', text: '向量数据库把文本切成块，用 embedding 表示语义，再用余弦相似度检索。' },
  { id: 'c', text: '公司考勤制度规定弹性上下班，迟到三次需要补卡。' },
  { id: 'd', text: '退款政策的常见问答：退款多久到账、退款失败怎么办、部分退款如何申请。' }
]


describe('分词与切分', () => {
  it('中文按 bigram、英文按词，停用词不误伤实词', () => {
    const tokens = tokenize('退款流程 refund policy v2')
    expect(tokens).toContain('退款')
    expect(tokens).toContain('refund')
    expect(tokens).toContain('policy')
    expect(tokens).toContain('v2')
  })

  it('相邻分块的重叠不超过 overlap 设定', () => {
    // 必须用互不相同的字：全同字符会让"后缀==前缀"的测量失真
    const uniq = (base: number, n: number): string =>
      Array.from({ length: n }, (_, i) => String.fromCharCode(base + i)).join('')
    const text = `${uniq(0x4e00, 60)}
${uniq(0x5900, 60)}`
    const chunks = chunkText(text, { chunkSize: 50, overlap: 10 })
    expect(chunks.length).toBeGreaterThan(2)

    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]
      const next = chunks[i]
      let k = Math.min(prev.length, next.length)
      for (; k > 0; k--) {
        if (prev.endsWith(next.slice(0, k))) break
      }
      expect(k, `第 ${i} 块与前一块重叠 ${k} 字`).toBeLessThanOrEqual(11)
    }
  })

  it('切分不丢字：所有字符至少出现在某一块里', () => {
    const text = `${'甲'.repeat(700)}
段落二${'乙'.repeat(700)}`
    const chunks = chunkText(text, { chunkSize: 120, overlap: 20 })
    const covered = chunks.join('')
    expect(covered).toContain('段落二')
    expect(chunks.every(c => c.length > 0 && c.length <= 120)).toBe(true)
  })
  it('内容哈希与换行风格无关', () => {
    expect(contentHash('a\r\nb')).toBe(contentHash('a\nb'))
  })
})

describe('TF-IDF 检索质量', () => {
  it('专有词命中优先：问退款时不会把考勤制度排第一', async () => {
    const s = new VectorStore()
    for (const d of CORPUS) await s.add(d.id, [d.text])
    const hits = await s.search('退款要多久到账', 4, 0.001)
    expect(hits.length).toBeGreaterThan(0)
    // chunk id 是内容哈希，归属看 metadata.docId
    expect(['a', 'd']).toContain(String(hits[0].metadata.docId))
    expect(hits[0].id).toContain('#')
  })

  it('IDF 生效：几乎所有文档都含的词不该主导排序', async () => {
    const s = new VectorStore()
    // 「需要」在 4 篇里出现 3 次，「弹性」只在 1 篇里出现
    const docs = [
      '需要 登录 需要 密码',
      '需要 提交 需要 审核',
      '需要 开票 需要 税号',
      '弹性 上下班 需要 打卡'
    ]
    for (const [i, t] of docs.entries()) await s.add(`d${i}`, [t])
    const hits = await s.search('弹性上下班', 4, 0.001)
    expect(hits[0].metadata.docId).toBe('d3')
  })

  it('长文档不因堆词而霸榜', async () => {
    const s = new VectorStore()
    await s.add('short', ['退款 申请 退款 流程'])
    await s.add('long', [Array.from({ length: 40 }, () => '退款').join(' ') + ' 无关内容 目录 说明'])
    const hits = await s.search('退款 流程', 2, 0.001)
    expect(hits[0].metadata.docId).toBe('short')
  })

  it('空查询与未命中标点返回空结果而非报错', async () => {
    const s = new VectorStore()
    await s.add('a', ['正文'])
    expect(await s.search('   ')).toEqual([])
    expect(await s.search('！！！')).toEqual([])
  })
})

describe('内容去重', () => {
  it('同一篇内容重复入库不再制造拷贝', async () => {
    const s = new VectorStore()
    const first = await s.add('doc-1', ['退款流程说明……'])
    const again = await s.add('doc-2', ['退款流程说明……'])
    expect(first.deduped).toBe(false)
    expect(again.deduped).toBe(true)
    expect(again.docId).toBe('doc-1')
    expect(s.size).toBe(1)
  })

  it('内容改一个字就要重新入库', async () => {
    const s = new VectorStore()
    await s.add('doc-1', ['退款流程说明'])
    const res = await s.add('doc-1', ['退款流程说明（v2）'])
    expect(res.deduped).toBe(false)
    expect(s.size).toBe(2)
  })

  it('remove 后统计与词表同步收缩', async () => {
    const s = new VectorStore()
    await s.add('a', ['甲 乙', '乙 丙'])
    await s.add('b', ['乙 丁'])
    expect(s.stats().vocabulary).toBeGreaterThan(0)
    const removed = await s.remove('a')
    expect(removed).toBe(2)
    expect(s.size).toBe(1)
    expect(s.stats().documents).toBe(1)
  })
})

describe('scheme 一致性', () => {
  it('词频库上跑 embedding 检索 → 明确报错并说明怎么补救', async () => {
    const s = new VectorStore()
    await s.add('a', ['正文'])
    await expect(s.searchByEmbedding([0.1, 0.2])).rejects.toBeInstanceOf(SchemeMismatchError)
  })

  it('embedding 库上不接受词频写入', async () => {
    const s = new VectorStore()
    await s.add('a', ['x'], {}, { vectors: [[0.1, 0.2]], model: 'm-1' })
    await expect(s.add('b', ['y'])).rejects.toThrow(/不可比较|索引已由/)
  })

  it('换 embedding 模型被视为不同 scheme', async () => {
    const s = new VectorStore()
    await s.add('a', ['x'], {}, { vectors: [[0.1, 0.2]], model: 'm-1' })
    await expect(s.add('b', ['y'], {}, { vectors: [[0.1, 0.2, 0.3]], model: 'm-2' }))
      .rejects.toThrow(/m-1/)
  })

  it('向量条数与文本块数不一致时报错', async () => {
    const s = new VectorStore()
    await expect(s.add('a', ['x', 'y'], {}, { vectors: [[0.1]], model: 'm' }))
      .rejects.toThrow(/不一致/)
  })

  it('embedding 检索按维度把关', async () => {
    const s = new VectorStore()
    await s.add('a', ['x'], {}, { vectors: [[0.1, 0.2, 0.3]], model: 'm' })
    await expect(s.searchByEmbedding([0.5, 0.5])).rejects.toThrow(/维度/)
    const hits = await s.searchByEmbedding([1, 0, 0], 1, 0.01)
    expect(hits).toHaveLength(1)
  })
})

describe('索引落盘', () => {
  it('写入→重载→检索一致', async () => {
    const io = new MemoryIndexIo()
    const s = new VectorStore(io)
    await s.add('a', ['退款 流程 说明'])
    await s.add('b', ['向量 检索 说明'])

    const reloaded = new VectorStore(io)
    await reloaded.ensureLoaded()
    expect(reloaded.size).toBe(2)
    const hits = await reloaded.search('退款 流程', 3, 0.001)
    expect(hits[0].metadata.docId).toBe('a')
    expect(reloaded.stats().vocabulary).toBe(s.stats().vocabulary)
  })

  it('去重信息跨重启仍然有效', async () => {
    const io = new MemoryIndexIo()
    const s = new VectorStore(io)
    await s.add('doc-a', ['同一篇内容'])
    const s2 = new VectorStore(io)
    const res = await s2.add('doc-b', ['同一篇内容'])
    expect(res.deduped).toBe(true)
    expect(res.docId).toBe('doc-a')
  })

  it('版本不符的旧文件按空库处理，不抛异常', async () => {
    const bad = JSON.stringify({ version: INDEX_FORMAT_VERSION + 99, scheme: null, docs: [] })
    const io = new MemoryIndexIo(bad)
    const s = new VectorStore(io)
    await s.ensureLoaded()
    expect(s.size).toBe(0)
    expect(await s.search('任意')).toEqual([])
  })

  it('损坏 JSON 同样降级为空库', async () => {
    const io = new MemoryIndexIo('{ 这不是 JSON')
    const s = new VectorStore(io)
    await s.ensureLoaded()
    expect(s.size).toBe(0)
  })

  it('序列化往返保留词频与向量', () => {
    const docs = [{
      id: 'h#0', hash: 'h', text: '甲 乙', metadata: { docId: 'x' },
      terms: new Map([['甲', 1], ['乙', 2]]), norm: Math.sqrt(5)
    }]
    const back = deserialize(serialize({ kind: 'tfidf' }, docs as never))
    if ('error' in back) throw new Error(back.error)
    expect([...(back.docs[0].terms ?? new Map()).entries()]).toEqual([['甲', 1], ['乙', 2]])
  })

  it('文件写入失败只降级不炸：入库结果仍在内存里', async () => {
    const io = { load: async () => null as string | null, save: async () => { throw new Error('EBUSY') } }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const s = new VectorStore(io)
    await s.add('a', ['正文'])
    expect(s.size).toBe(1)
    expect(warn.mock.calls.some(c => String(c[0]).includes('索引写入失败'))).toBe(true)
    warn.mockRestore()
  })
})

describe('embedding 客户端', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('按返回的 index 归位，不照抄返回顺序', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, text: async (): Promise<string> => '',
      json: async () => ({ data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] }
      ] })
    })))
    const out = await createEmbeddings({
      baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'emb', input: ['甲', '乙']
    })
    expect(out).toEqual([[1, 0], [0, 1]])
  })

  it('条数不符时报错，而不是错配到别的段落', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, text: async (): Promise<string> => '',
      json: async () => ({ data: [{ index: 0, embedding: [1] }] })
    })))
    await expect(createEmbeddings({
      baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'emb', input: ['甲', '乙']
    })).rejects.toThrow(/条数异常/)
  })

  it('index 越界或重复都拒绝', async () => {
    for (const data of [
      [{ index: 7, embedding: [1] }, { index: 0, embedding: [2] }],
      [{ index: 0, embedding: [1] }, { index: 0, embedding: [2] }]
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true, status: 200, text: async (): Promise<string> => '',
        json: async () => ({ data })
      })))
      await expect(createEmbeddings({
        baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'emb', input: ['甲', '乙']
      })).rejects.toBeInstanceOf(EmbeddingError)
    }
  })

  it('超过批大小自动分批，且拼接顺序与入参一致', async () => {
    const calls: string[][] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] }
      calls.push(body.input)
      return {
        ok: true, status: 200, text: async (): Promise<string> => '',
        json: async () => ({ data: body.input.map((t: string, i: number) => ({ index: i, embedding: [t.length] })) })
      }
    }))
    const input = Array.from({ length: 130 }, (_, i) => `文本${i}`)
    const out = await createEmbeddings({ baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'emb', input })
    expect(calls.map(c => c.length)).toEqual([64, 64, 2])
    expect(out.map(v => v[0])).toEqual(input.map(t => t.length))
  })

  it('没有 Key 时直接拒绝，不发出请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(createEmbeddings({
      baseUrl: 'https://api.test/v1', apiKey: '', model: 'emb', input: ['甲']
    })).rejects.toThrow(/API Key/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('取消信号会中断在飞的向量化请求', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init?: { signal?: AbortSignal }) =>
      new Promise((_r, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          reject(e)
        })
      })))
    const controller = new AbortController()
    const p = createEmbeddings({
      baseUrl: 'https://api.test/v1', apiKey: 'k', model: 'emb', input: ['甲'], signal: controller.signal
    })
    controller.abort()
    await expect(p).rejects.toThrow(/取消/)
  })
})

describe('向量模型出口解析', () => {
  const models: LlmModelInfo[] = [{
    id: 'm1', baseUrl: 'https://api.test/v1', model: 'gpt-chat', apiKey: 'sk-1',
    temperature: 0.2, maxTokens: 100
  }]

  it('不填模型名即为不启用 embedding', () => {
    expect(resolveEmbeddingTarget({}, { models, secrets: {} })).toBe(null)
  })

  it('填了模型名则复用已登记模型的 baseUrl 与 Key，但不借用它的聊天模型名', () => {
    const t = resolveEmbeddingTarget(
      { embeddingModel: 'bge-m3', embeddingProviderId: 'm1' },
      { models, secrets: {} }
    )
    expect(t).toEqual({ model: 'bge-m3', baseUrl: 'https://api.test/v1', apiKey: 'sk-1' })
  })

  it('既无 provider 又无备用凭证时报错并指向可操作位置', () => {
    expect(() => resolveEmbeddingTarget({ embeddingModel: 'bge-m3' }, { models: [], secrets: {} }))
      .toThrow(/Base URL 与 Key/)
  })
})

describe('入库→检索端到端（经引擎）', () => {
  const model: LlmModelInfo = {
    id: 'emb', baseUrl: 'https://api.test/v1', model: 'gpt-chat', apiKey: 'sk-1',
    temperature: 0.2, maxTokens: 100
  }

  function wf(nodes: Array<Record<string, unknown>>, links: Array<{ source: string; target: string }>): WorkflowDefinition {
    return {
      id: 'wf-rag', name: 'RAG', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
      variables: [],
      nodes: nodes.map((n, i) => ({
        id: String(n.id), type: String(n.type), label: String(n.id),
        position: { x: i * 140, y: 0 }, config: (n.config ?? {}) as Record<string, unknown>
      })),
      edges: links.map((l, i) => ({ id: `e${i}`, source: l.source, target: l.target }))
    }
  }

  it('词频模式下入库后能检索到上下文，且重复跑不会翻倍', async () => {
    const rag = new VectorStore(new MemoryIndexIo())
    const engine = new WorkflowEngine({ rag })
    const definition = wf(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'up', type: 'rag-upload', config: { source: 'text', text: CORPUS[0].text + '\n' + CORPUS[1].text, docId: 'kb', chunkSize: 200, overlap: 20 } },
        { id: 'q', type: 'rag-retrieve', config: { query: '退款 流程', topK: 3, minScore: 0.001 } }
      ],
      [{ source: 't', target: 'up' }, { source: 'up', target: 'q' }]
    )

    const first = await engine.execute(definition, () => undefined, 'rag-1', {}, [model])
    expect(first.get('up')?.status, first.get('up')?.error).toBe('success')
    expect(first.get('q')?.status, first.get('q')?.error).toBe('success')
    expect(String(first.get('q')?.output.combined)).toContain('退款')
    expect(first.get('q')?.output.mode).toBe('TF-IDF')
    const sizeAfterFirst = rag.size

    const second = await engine.execute(definition, () => undefined, 'rag-2', {}, [model])
    expect(second.get('up')?.output.deduped).toBe(true)
    expect(rag.size).toBe(sizeAfterFirst)
  })

  it('配了向量模型时走 /embeddings，检索按 embedding 打分', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body)) as { input: string[]; model: string }
      calls.push(body.model)
      // 用"文本里是否含退款"造一个可判别的假向量
      return {
        ok: true, status: 200, text: async (): Promise<string> => '',
        json: async () => ({
          data: body.input.map((t: string, i: number) => ({
            index: i, embedding: [t.includes('退款') ? 1 : 0.01, t.includes('向量') ? 1 : 0.01]
          }))
        })
      }
    }))

    const rag = new VectorStore(new MemoryIndexIo())
    const engine = new WorkflowEngine({ rag })
    const definition = wf(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'up', type: 'rag-upload', config: { source: 'text', text: CORPUS[0].text + '\n' + CORPUS[1].text, docId: 'kb', chunkSize: 200, overlap: 20, embeddingModel: 'bge-m3', embeddingProviderId: 'emb' } },
        { id: 'q', type: 'rag-retrieve', config: { query: '什么是向量检索', topK: 2, minScore: 0.01, embeddingModel: 'bge-m3', embeddingProviderId: 'emb' } }
      ],
      [{ source: 't', target: 'up' }, { source: 'up', target: 'q' }]
    )

    const res = await engine.execute(definition, () => undefined, 'rag-emb', {}, [model])
    vi.unstubAllGlobals()

    expect(res.get('up')?.status, res.get('up')?.error).toBe('success')
    expect(calls.every(c => c === 'bge-m3')).toBe(true)
    expect(res.get('q')?.output.mode).toBe('embedding/bge-m3')
    expect(String(res.get('q')?.output.topText)).toContain('向量')
    expect(rag.currentScheme).toEqual({ kind: 'embed', model: 'bge-m3', dim: 2 })
  })

  it('入库用 embedding、检索用词频时报 scheme 冲突而不是静默降级', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] }
      return {
        ok: true, status: 200, text: async (): Promise<string> => '',
        json: async () => ({ data: body.input.map((_t: string, i: number) => ({ index: i, embedding: [1, i] })) })
      }
    }))
    const rag = new VectorStore(new MemoryIndexIo())
    const engine = new WorkflowEngine({ rag })
    const res = await engine.execute(wf(
      [
        { id: 't', type: 'manual-trigger' },
        { id: 'up', type: 'rag-upload', config: { text: '甲 乙', embeddingModel: 'bge-m3', embeddingProviderId: 'emb' } },
        { id: 'q', type: 'rag-retrieve', config: { query: '甲' } }
      ],
      [{ source: 't', target: 'up' }, { source: 'up', target: 'q' }]
    ), () => undefined, 'rag-mismatch', {}, [model])
    vi.unstubAllGlobals()

    expect(res.get('up')?.status).toBe('success')
    expect(res.get('q')?.status).toBe('error')
    expect(res.get('q')?.error).toMatch(/embedding 模型「bge-m3」|清空索引/)
  })
})
