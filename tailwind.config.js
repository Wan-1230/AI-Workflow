/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 浅色四层体系：画布(off-white) < 面板(white) < 卡片(white+border) < 悬停/凹陷(gray)
        ink:      '#eceef2',   // 窗口/最深层
        base:     '#f3f4f7',   // 画布背景 / 凹陷填充
        panel:    '#ffffff',   // 侧栏 / 工具栏 / 日志面板
        card:     '#ffffff',   // 卡片 / 输入框（靠 border 界定）
        overlay:  '#eef0f4',   // 悬停 / 激活 / 凹陷灰
        border:   '#e4e6ec',   // 标准发丝描边
        'border-light': '#eef0f3', // 更淡的分隔线

        // 强调色 — Mercor 靛蓝
        accent:   '#5b5bd6',
        'accent-muted': '#4a4ac0',

        // 节点功能色（在浅底上可读、克制）
        'sig-blue':   '#4f7cf0',
        'sig-green':  '#23a06b',
        'sig-amber':  '#cf9412',
        'sig-purple': '#7c5cf0',
        'sig-red':    '#e0524f',

        // 文字
        't-primary':   '#1b1b1f',
        't-secondary': '#5f6470',
        't-muted':     '#9ca1ac',
        't-faint':     '#b9bdc8',
      },
      fontFamily: {
        sans: ['"SF Pro Display"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        '3xs': ['0.625rem', { lineHeight: '0.85rem', letterSpacing: '0.02em' }],
        '2xs': ['0.6875rem', { lineHeight: '0.95rem', letterSpacing: '0.01em' }],
      },
      borderRadius: {
        DEFAULT: '8px', sm: '6px', md: '10px', lg: '12px', xl: '16px', '2xl': '20px',
      },
      transitionDuration: {
        DEFAULT: '180ms', fast: '100ms', slow: '350ms',
      },
      boxShadow: {
        'card': '0 1px 2px rgba(17,17,26,0.04), 0 1px 3px rgba(17,17,26,0.05)',
        'card-hover': '0 10px 30px rgba(17,17,26,0.10)',
        'node': '0 1px 2px rgba(17,17,26,0.05), 0 2px 6px rgba(17,17,26,0.05)',
        'node-selected': '0 0 0 1.5px #5b5bd6, 0 6px 20px rgba(91,91,214,0.18)',
        'glass': 'inset 0 1px 0 rgba(255,255,255,0.7), 0 4px 24px rgba(17,17,26,0.07)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity:'0', transform:'translateY(6px)' }, '100%': { opacity:'1', transform:'translateY(0)' } },
        'fade-in': { '0%': { opacity:'0' }, '100%': { opacity:'1' } },
        'slide-l': { '0%': { opacity:'0', transform:'translateX(-12px)' }, '100%': { opacity:'1', transform:'translateX(0)' } },
        'slide-r': { '0%': { opacity:'0', transform:'translateX(12px)' }, '100%': { opacity:'1', transform:'translateX(0)' } },
        'breathe': { '0%,100%': { opacity:'1' }, '50%': { opacity:'0.5' } },
        'glow': { '0%,100%': { boxShadow:'0 0 0 0 rgba(35,160,107,0.22)' }, '50%': { boxShadow:'0 0 0 6px rgba(35,160,107,0)' } },
      },
      animation: {
        'fade-up': 'fade-up 250ms ease-out',
        'fade-in': 'fade-in 220ms ease-out',
        'slide-l': 'slide-l 250ms ease-out',
        'slide-r': 'slide-r 250ms ease-out',
        'breathe': 'breathe 2s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 背景层级
        ink:      '#08090c',
        base:     '#0c0d12',
        panel:    '#111218',
        card:     '#16171e',
        overlay:  '#1c1d25',
        border:   '#24252e',
        'border-light': '#2e2f39',

        // 强调色
        accent:   '#5b8def',
        'accent-muted': '#3d5a9a',

        // 节点功能色
        'sig-blue':   '#6b9df2',
        'sig-green':  '#4db87a',
        'sig-amber':  '#d4a83c',
        'sig-purple': '#9b7cf0',
        'sig-red':    '#e85d5d',

        // 文字
        't-primary':   '#d4d6dc',
        't-secondary': '#8b8d98',
        't-muted':     '#585a65',
      },
      fontFamily: {
        sans: ['"SF Pro Display"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        '3xs': ['0.625rem', { lineHeight: '0.85rem', letterSpacing: '0.02em' }],
        '2xs': ['0.6875rem', { lineHeight: '0.95rem', letterSpacing: '0.01em' }],
      },
      borderRadius: {
        DEFAULT: '6px', sm: '4px', md: '8px', lg: '10px', xl: '14px', '2xl': '18px',
      },
      transitionDuration: {
        DEFAULT: '180ms', fast: '100ms', slow: '350ms',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.03)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.06)',
        'node': '0 2px 8px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.04)',
        'node-selected': '0 0 0 1.5px #5b8def, 0 4px 20px rgba(91,141,239,0.2)',
        'glass': '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity:'0', transform:'translateY(6px)' }, '100%': { opacity:'1', transform:'translateY(0)' } },
        'slide-l': { '0%': { opacity:'0', transform:'translateX(-12px)' }, '100%': { opacity:'1', transform:'translateX(0)' } },
        'slide-r': { '0%': { opacity:'0', transform:'translateX(12px)' }, '100%': { opacity:'1', transform:'translateX(0)' } },
        'breathe': { '0%,100%': { opacity:'1' }, '50%': { opacity:'0.55' } },
        'glow': { '0%,100%': { boxShadow:'0 0 0 0 rgba(77,184,122,0.25)' }, '50%': { boxShadow:'0 0 0 6px rgba(77,184,122,0)' } },
      },
      animation: {
        'fade-up': 'fade-up 250ms ease-out',
        'slide-l': 'slide-l 250ms ease-out',
        'slide-r': 'slide-r 250ms ease-out',
        'breathe': 'breathe 2s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
