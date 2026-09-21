import { describe, it, expect } from 'vitest'
import { nodeCatalog, catalogNodeTypes } from '@shared/node-catalog'
import { nodeRegistry } from '../electron/engine/nodes/index'

/**
 * 节点目录契约测试。
 *
 * 这组断言针对的是历史上真实发生过的缺陷：引擎注册表有 16 类节点，
 * 而校验器另有一份手工维护的 5 类白名单，导致 11 类节点被判「类型无效」无法运行；
 * 同时引擎与渲染层各有一份节点元数据副本，颜色与默认配置已经漂移。
 * 任何一条失败都意味着单一事实来源被破坏。
 */
describe('节点目录契约', () => {
  it('catalog 与引擎注册表严格一一对应', () => {
    expect([...nodeRegistry.keys()].sort()).toEqual([...catalogNodeTypes].sort())
  })

  it('每个 catalog 条目的 id 与键名一致，且必备元数据齐备', () => {
    for (const [key, def] of Object.entries(nodeCatalog)) {
      expect(def.id, `节点 ${key} 的 id 与键名不一致`).toBe(key)
      expect(def.displayName, `${key} 缺少 displayName`).toBeTruthy()
      expect(def.description, `${key} 缺少 description`).toBeTruthy()
      expect(def.icon, `${key} 缺少 icon`).toBeTruthy()
      expect(def.color, `${key} 缺少 color`).toMatch(/^#[0-9A-F]{6}$/)
      expect(def.outputs.length, `${key} 必须至少声明一个输出`).toBeGreaterThan(0)
    }
  })

  it('分类取值合法，且六大分类均有节点', () => {
    const legal = new Set(['trigger', 'action', 'logic', 'ai', 'agent', 'rag'])
    const seen = new Set<string>()
    for (const def of Object.values(nodeCatalog)) {
      expect(legal.has(def.category), `节点 ${def.id} 分类非法: ${def.category}`).toBe(true)
      seen.add(def.category)
    }
    expect(seen.size).toBe(6)
  })

  it('fields 的键都在 defaultConfig 中有对应默认值', () => {
    for (const def of Object.values(nodeCatalog)) {
      for (const field of def.fields) {
        expect(
          Object.hasOwn(def.defaultConfig, field.key),
          `${def.id} 的字段 ${field.key} 缺少 defaultConfig 默认值`
        ).toBe(true)
      }
    }
  })

  it('select 字段必须显式给出选项来源：静态 options 或 dataSource', () => {
    for (const def of Object.values(nodeCatalog)) {
      for (const field of def.fields) {
        if (field.type !== 'select') continue
        const hasSource = Boolean(field.options?.length) || Boolean(field.dataSource)
        expect(hasSource, `${def.id}.${field.key} 既无 options 也无 dataSource`).toBe(true)
        if (field.dataSource) {
          expect(['models', 'credentials']).toContain(field.dataSource)
          expect(field.options, `${def.id}.${field.key} 动态来源不应同时携带静态选项`).toBeUndefined()
        }
        if (field.key === 'modelId') {
          expect(field.dataSource, `${def.id}.modelId 应声明 dataSource=models`).toBe('models')
        }
      }
    }
  })

  it('默认配置中不含疑似明文密钥', () => {
    const suspicious = /(sk-[A-Za-z0-9_-]{8,})|api[_-]?key\s*[:=]\s*['"][^'"]{8,}/i
    for (const def of Object.values(nodeCatalog)) {
      for (const [k, v] of Object.entries(def.defaultConfig)) {
        if (typeof v === 'string') {
          expect(suspicious.test(v), `${def.id}.${k} 默认值疑似含明文密钥`).toBe(false)
        }
      }
    }
  })

  it('多出口节点声明 sourceHandles，其余节点不声明', () => {
    const branching = catalogNodeTypes.filter(t => nodeCatalog[t].sourceHandles?.length)
    expect(branching).toContain('condition')
    for (const type of branching) {
      const handles = nodeCatalog[type].sourceHandles!
      expect(handles.length, `${type} 的分支出口应成对`).toBeGreaterThanOrEqual(2)
      expect(new Set(handles).size, `${type} 的 handle id 不得重复`).toBe(handles.length)
    }
  })
})
