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
