/** @type {import('tailwindcss').Config} */
/**
 * 统一设计系统（单一事实来源）
 * 所有颜色通过 CSS 变量驱动，支持深浅色主题无缝切换。
 * 颜色采用 `rgb(var(--token) / <alpha-value>)` 模式，保留 Tailwind 透明度修饰符能力。
 */
export default {
  content: ['./src/**/*.{ts,tsx}', './src/renderer/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ===== 语义化表面层级 =====
        app: 'rgb(var(--c-app) / <alpha-value>)',          // 窗口最深层
        surface: 'rgb(var(--c-surface) / <alpha-value>)',  // 面板 / 侧栏 / 工具栏
        raised: 'rgb(var(--c-raised) / <alpha-value>)',    // 卡片 / 输入框 / 弹层
        overlay: 'rgb(var(--c-overlay) / <alpha-value>)',  // 悬停 / 凹陷区
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',    // 画布背景

        // ===== 描边 =====
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',

        // ===== 文字层级 =====
        'fg': 'rgb(var(--c-fg) / <alpha-value>)',
        'fg-secondary': 'rgb(var(--c-fg-secondary) / <alpha-value>)',
        'fg-muted': 'rgb(var(--c-fg-muted) / <alpha-value>)',
        'fg-faint': 'rgb(var(--c-fg-faint) / <alpha-value>)',
        'fg-inverse': 'rgb(var(--c-fg-inverse) / <alpha-value>)',

        // ===== 强调色 =====
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--c-accent-strong) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        'accent-fg': 'rgb(var(--c-accent-fg) / <alpha-value>)',

        // ===== 节点功能色 / 状态色（两套主题共享）=====
        'sig-blue': 'rgb(var(--c-blue) / <alpha-value>)',
        'sig-green': 'rgb(var(--c-green) / <alpha-value>)',
        'sig-amber': 'rgb(var(--c-amber) / <alpha-value>)',
        'sig-purple': 'rgb(var(--c-purple) / <alpha-value>)',
        'sig-red': 'rgb(var(--c-red) / <alpha-value>)',
        'sig-cyan': 'rgb(var(--c-cyan) / <alpha-value>)',
        'sig-gray': 'rgb(var(--c-gray) / <alpha-value>)',

        // 语义状态
        success: 'rgb(var(--c-green) / <alpha-value>)',
        warning: 'rgb(var(--c-amber) / <alpha-value>)',
        danger: 'rgb(var(--c-red) / <alpha-value>)',
        info: 'rgb(var(--c-blue) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', '"Segoe UI"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        display: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        '3xs': ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.02em' }],
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
      },
      borderRadius: {
        // 规范：常规组件 6px / 卡片节点 8px / 弹窗大卡片 12px
        DEFAULT: '8px', sm: '6px', md: '10px', lg: '12px', xl: '12px', '2xl': '16px',
      },
      transitionDuration: {
        DEFAULT: '150ms', fast: '80ms', slow: '300ms',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        node: 'var(--shadow-node)',
        'node-selected': '0 0 0 2px rgb(var(--c-accent) / 0.9), var(--shadow-card-hover)',
        glass: 'var(--shadow-glass)',
        modal: 'var(--shadow-modal)',
        pop: 'var(--shadow-pop)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-l': { '0%': { opacity: '0', transform: 'translateX(-8px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'slide-r': { '0%': { opacity: '0', transform: 'translateX(8px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        breathe: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
        'pulse-ring': { '0%': { boxShadow: '0 0 0 0 rgb(var(--c-accent) / 0.35)' }, '70%': { boxShadow: '0 0 0 6px rgb(var(--c-accent) / 0)' }, '100%': { boxShadow: '0 0 0 0 rgb(var(--c-accent) / 0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        'fade-up': 'fade-up 200ms ease-out',
        'fade-in': 'fade-in 150ms ease-out',
        'slide-l': 'slide-l 200ms ease-out',
        'slide-r': 'slide-r 200ms ease-out',
        'scale-in': 'scale-in 160ms ease-out',
        breathe: 'breathe 2s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}
