/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Warm Precision 四层体系
        ink:      '#e8e4de',   // 窗口最深层 / 暖灰
        base:     '#f5f2ed',   // 画布背景 / 暖象牙
        panel:    '#faf8f5',   // 侧栏 / 工具栏 / 日志面板
        card:     '#ffffff',   // 卡片 / 输入框
        overlay:  '#ede9e3',   // 悬停 / 凹陷
        border:   '#e2ddd6',   // 暖发丝描边
        'border-light': '#ece8e2',

        // 强调色 — 琥珀铜 (burnt amber)
        accent:   '#b45309',
        'accent-muted': '#92400e',
        'accent-light': '#fef3c7',

        // 节点功能色（暖底可读）
        'sig-blue':   '#2563eb',
        'sig-green':  '#059669',
        'sig-amber':  '#d97706',
        'sig-purple': '#7c3aed',
        'sig-red':    '#dc2626',

        // 文字（stone 暖灰阶）
        't-primary':   '#1c1917',
        't-secondary': '#57534e',
        't-muted':     '#a8a29e',
        't-faint':     '#d6d3d1',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        '3xs': ['0.625rem', { lineHeight: '0.85rem', letterSpacing: '0.04em' }],
        '2xs': ['0.6875rem', { lineHeight: '0.95rem', letterSpacing: '0.02em' }],
      },
      borderRadius: {
        DEFAULT: '6px', sm: '4px', md: '8px', lg: '10px', xl: '14px', '2xl': '18px',
      },
      transitionDuration: {
        DEFAULT: '150ms', fast: '80ms', slow: '300ms',
      },
      boxShadow: {
        'card': '0 1px 2px rgba(28,25,23,0.04), 0 0 0 1px rgba(28,25,23,0.04)',
        'card-hover': '0 4px 12px rgba(28,25,23,0.08), 0 0 0 1px rgba(28,25,23,0.06)',
        'node': '0 1px 3px rgba(28,25,23,0.06), 0 0 0 1px rgba(28,25,23,0.05)',
        'node-selected': '0 0 0 2px #b45309, 0 4px 12px rgba(180,83,9,0.12)',
        'glass': '0 2px 8px rgba(28,25,23,0.06), 0 0 0 1px rgba(28,25,23,0.04)',
        'press': 'inset 0 1px 3px rgba(28,25,23,0.1)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity:'0', transform:'translateY(4px)' }, '100%': { opacity:'1', transform:'translateY(0)' } },
        'fade-in': { '0%': { opacity:'0' }, '100%': { opacity:'1' } },
        'slide-l': { '0%': { opacity:'0', transform:'translateX(-8px)' }, '100%': { opacity:'1', transform:'translateX(0)' } },
        'slide-r': { '0%': { opacity:'0', transform:'translateX(8px)' }, '100%': { opacity:'1', transform:'translateX(0)' } },
        'breathe': { '0%,100%': { opacity:'1' }, '50%': { opacity:'0.4' } },
        'glow': { '0%,100%': { boxShadow:'0 0 0 0 rgba(5,150,105,0.2)' }, '50%': { boxShadow:'0 0 0 4px rgba(5,150,105,0)' } },
      },
      animation: {
        'fade-up': 'fade-up 200ms ease-out',
        'fade-in': 'fade-in 180ms ease-out',
        'slide-l': 'slide-l 200ms ease-out',
        'slide-r': 'slide-r 200ms ease-out',
        'breathe': 'breathe 2s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
