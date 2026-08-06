import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/* =====================================================================
   Tabs 药丸滑块导航：激活项高亮 + 滑块平滑挪动
   用于底部 Tab 导航栏与面板内部分组切换
   ===================================================================== */

export interface TabItem<T extends string = string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  /** 可选角标（数字/红点） */
  badge?: number | null
  disabled?: boolean
}

interface TabsProps<T extends string = string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  /** 样式：'pill' 药丸导航（底部栏）/ 'underline' 下划线（面板内） */
  variant?: 'pill' | 'underline'
  /** 滑块动画时长（ms） */
  duration?: number
  className?: string
}

/**
 * 通用 Tab 组件：激活项高亮 + 滑块平滑挪动动效
 * - pill：对比色高亮药丸（底部全局导航用）
 * - underline：下划线风格（面板内分组用）
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'pill',
  duration = 220,
  className = '',
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)
  const [slider, setSlider] = useState<{ left: number; width: number } | null>(null)

  // 计算激活项位置，驱动滑块
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const activeEl = list.querySelector<HTMLElement>(`[data-tab-value="${value}"]`)
    if (!activeEl) return
    setSlider({ left: activeEl.offsetLeft, width: activeEl.offsetWidth })
  }, [value, items])

  const base = variant === 'pill'
    ? 'relative flex items-center gap-1 bg-overlay/60 rounded-full p-1'
    : 'relative flex items-center gap-1 border-b border-line'

  const itemBase = variant === 'pill'
    ? 'relative z-10 flex items-center justify-center gap-1.5 h-8 px-4 rounded-full text-sm transition-colors duration-fast whitespace-nowrap'
    : 'relative z-10 flex items-center gap-1.5 h-9 px-3 text-sm transition-colors duration-fast whitespace-nowrap'

  const activeText = variant === 'pill'
    ? 'text-accent-fg font-medium'
    : 'text-fg font-medium'

  const inactiveText = 'text-fg-secondary hover:text-fg'

  return (
    <div ref={listRef} className={[base, className].join(' ')} role="tablist">
      {/* 滑块 */}
      {slider && variant === 'pill' && (
        <div
          className="absolute top-1 bottom-1 rounded-full bg-accent shadow-sm transition-all ease-out"
          style={{ left: slider.left, width: slider.width, transitionDuration: `${duration}ms` }}
        />
      )}
      {slider && variant === 'underline' && (
        <div
          className="absolute bottom-0 h-0.5 rounded-full bg-accent transition-all ease-out"
          style={{ left: slider.left, width: slider.width, transitionDuration: `${duration}ms` }}
        />
      )}
      {items.map(item => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-tab-value={item.value}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={[
              itemBase,
              active ? activeText : inactiveText,
              item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            {item.icon}
            <span className="leading-none inline-flex items-center gap-1.5">
              {item.label}
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span
                  className={[
                    'min-w-4 h-4 px-1 rounded-full text-2xs flex items-center justify-center',
                    active ? 'bg-accent-fg/20 text-accent-fg' : 'bg-accent/15 text-accent',
                  ].join(' ')}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
