import { describe, it, expect } from 'vitest'
import { safeStorage, app } from 'electron'
import Database from 'better-sqlite3'

/**
 * 测试环境自检。
 * 这三条断言是脚手架本身的地基：别名生效、electron 桩可用、原生模块被显式拦截。
 * 它们失败意味着后面所有测试的可信度都不成立。
 */
describe('测试环境脚手架', () => {
  it('electron 别名指向桩，app.getPath 可用', () => {
    expect(typeof app.getPath).toBe('function')
    expect(app.getPath('userData')).toBeTruthy()
  })

  it('safeStorage 桩可逆，可用于断言密钥不以明文入库', () => {
    const secret = 'sk-test-abcdef0123456789'
    const encrypted = safeStorage.encryptString(secret)
    expect(encrypted.toString('utf-8')).not.toContain(secret)
    expect(safeStorage.decryptString(encrypted)).toBe(secret)
  })

  it('better-sqlite3 被显式拦截，避免依赖真库的测试静默通过', () => {
    expect(() => new Database(':memory:')).toThrow(/Electron ABI/)
  })
})
