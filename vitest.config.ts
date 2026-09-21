import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/**
 * 测试专用配置。
 *
 * 两个必须绕开的原生/运行时约束：
 * 1. `electron` 模块在纯 Node 下不可用 → 指向 tests/stubs/electron.ts
 * 2. `better-sqlite3` 本地按 Electron ABI 构建，纯 Node 加载即抛 NODE_MODULE_VERSION 不匹配
 *    → 指向 tests/stubs/better-sqlite3.ts，需要真库的存储测试留到 S4（届时注入驱动）
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'packages/shared/src'),
      '@': resolve(__dirname, 'src'),
      electron: resolve(__dirname, 'tests/stubs/electron.ts'),
      'better-sqlite3': resolve(__dirname, 'tests/stubs/better-sqlite3.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['electron/engine/**', 'packages/shared/src/**'],
      exclude: ['electron/engine/storage/**', '**/*.d.ts']
    }
  }
})
