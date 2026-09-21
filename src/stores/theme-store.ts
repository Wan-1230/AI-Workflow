import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_KEY = 'aiwf.theme'

/** 解析当前生效的主题（'system' 跟随系统偏好） */
function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

/** 读取持久化的主题设置 */
function loadStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch { /* localStorage 不可用 */ }
  return 'system'
}

/** 将主题模式写入 localStorage 并应用到 <html> */
function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch { /* 忽略写入失败 */ }
}

/** 系统偏好监听器句柄，供重复 init 时撤销上一次注册 */
let systemQuery: MediaQueryList | null = null
let systemHandler: (() => void) | null = null

interface ThemeStore {  mode: ThemeMode
  /** 当前实际生效的主题（light | dark） */
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  /** 切换浅色/深色（便捷方法） */
  toggle: () => void
  init: () => void
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: 'system',
  resolved: 'light',

  init: () => {
    const mode = loadStoredTheme()
    applyTheme(mode)
    set({ mode, resolved: resolveTheme(mode) })

    // 跟随系统偏好变化（仅 'system' 模式时生效）。
    // init 可能被重复调用（StrictMode 下 effect 执行两次），
    // 因此注册前先撤销上一次的监听，避免监听器不断累积。
    if (systemQuery && systemHandler) {
      systemQuery.removeEventListener('change', systemHandler)
    }
    systemHandler = () => {
      const m = get().mode
      if (m === 'system') {
        applyTheme(m)
        set({ resolved: resolveTheme(m) })
      }
    }
    systemQuery = window.matchMedia('(prefers-color-scheme: dark)')
    systemQuery.addEventListener('change', systemHandler)
  },

  setMode: (mode) => {
    applyTheme(mode)
    set({ mode, resolved: resolveTheme(mode) })
  },

  toggle: () => {
    const next: ThemeMode = get().resolved === 'dark' ? 'light' : 'dark'
    get().setMode(next)
  },
}))
