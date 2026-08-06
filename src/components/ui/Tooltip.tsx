import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/* =====================================================================
   Tooltip 提示：hover / focus 显示，纯 CSS 定位，无需外部依赖
   ===================================================================== */

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  /** 位置 */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** 延迟显示（ms） */
  delay?: number
  /** 宽度约束 */
  maxWidth?: number
}

const sideClasses = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
} as const

export function Tooltip({ content, children, side = 'top', delay = 300, maxWidth = 260 }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<number | null>(null)

  const show = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setVisible(true), delay)
  }, [delay])

  const hide = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setVisible(false)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  if (!content) return <>{children}</>

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <span
          role="tooltip"
          className={[
            'absolute z-50 pointer-events-none whitespace-normal rounded-md bg-fg px-2 py-1',
            'text-2xs text-fg-inverse shadow-pop animate-fade-in leading-snug',
            sideClasses[side],
          ].join(' ')}
          style={{ maxWidth }}
        >
          {content}
        </span>
      )}
    </span>
  )
}
