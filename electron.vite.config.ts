import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * 入口遵循 electron-vite 的约定式布局：src/main/index.ts、src/preload/index.ts、
 * src/renderer/index.html。该框架不接受通过 build.lib.entry / rollupOptions.input
 * 覆盖入口，只会静默回落到约定路径。
 *
 * ⚠️ 历史教训：本项目的实现一度放在 electron/main.ts，而入口位 src/main/index.ts
 * 停在 MVP 阶段的旧副本，构建静默采用旧副本，导致自绘标题栏 IPC、项目库、凭证加密、
 * 执行历史从未进入任何产物。请勿再把主进程/预加载实现移出约定位置；
 * .github/workflows/ci.yml 末尾有产物标记断言兜底。
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'packages/shared/src')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'packages/shared/src')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'packages/shared/src')
      }
    },
    plugins: [react()]
  }
})
