/**
 * `better-sqlite3` 在测试环境不可用的显式桩。
 *
 * 真实模块按 Electron ABI 构建，纯 Node 下 require 会抛 NODE_MODULE_VERSION 不匹配。
 * 这里把它替换成「一用即失败」的桩，目的是让依赖真库的测试**立刻暴露**而不是静默跳过：
 * 需要真实 SQLite 的验证归入 S4（届时通过注入驱动使其可测）。
 */
export class DatabaseStub {
  constructor(_path?: string) {
    throw new Error(
      'better-sqlite3 在测试环境不可用（原生模块按 Electron ABI 构建）。' +
        '请把待测逻辑改写为不依赖 DB 的纯函数，或留待 S4 的注入式驱动。'
    )
  }
}

export default DatabaseStub
