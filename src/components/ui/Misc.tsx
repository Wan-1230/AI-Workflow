import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

/* =====================================================================
   辅助基元：Spinner / Badge / EmptyState / Card / SectionTitle
   ===================================================================== */

/** 加载指示器 */
export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-fg-muted">
      <Loader2 size={size} className="animate-spin" />
      {label && <span className="text-xs">{label}</span>}
    </span>
  )
}

/** 全屏/区域加载遮罩 */
export function LoadingBlock({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-10">
      <Spinner size={20} label={label} />
    </div>
  )
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const badgeToneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-overlay text-fg-secondary',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/12 text-info',
}

/** 徽标 / 状态标签 */
export function Badge({ tone = 'neutral', children, className = '' }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium whitespace-nowrap',
        badgeToneClasses[tone],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

/** 空状态提示（带图标 + 标题 + 描述 + 操作按钮） */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'} px-6`}>
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-overlay text-fg-muted [&>svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className={`${compact ? 'text-sm' : 'text-base'} font-medium text-fg`}>{title}</h3>
      {description && <p className="mt-1.5 text-xs text-fg-muted leading-relaxed max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** 卡片容器 */
export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-raised border border-line rounded-lg shadow-card',
        onClick ? 'cursor-pointer transition-all duration-fast hover:shadow-card-hover hover:border-line-strong' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

/** 区块标题（面板内分组） */
export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-2xs font-semibold uppercase tracking-wider text-fg-muted">{children}</h4>
      {extra}
    </div>
  )
}

/** 等宽字体数值（耗时/时间等） */
export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono ${className}`}>{children}</span>
}
