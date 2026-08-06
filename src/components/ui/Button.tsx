import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** 图标（置于文字前） */
  icon?: ReactNode
  block?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg hover:bg-accent-strong disabled:bg-fg-faint disabled:text-fg-inverse ' +
    'shadow-sm font-medium',
  secondary:
    'bg-raised text-fg border border-line hover:bg-overlay hover:border-line-strong disabled:opacity-50',
  ghost:
    'bg-transparent text-fg-secondary hover:bg-overlay hover:text-fg disabled:opacity-50',
  danger:
    'bg-sig-red text-white hover:opacity-90 disabled:opacity-50 font-medium',
  outline:
    'bg-transparent text-accent border border-accent/40 hover:bg-accent-soft disabled:opacity-50 font-medium',
}

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-2xs gap-1 rounded-sm',
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3.5 text-sm gap-2',
  lg: 'h-9 px-5 text-sm gap-2',
}

/**
 * 全局统一按钮基元
 * 支持 5 种视觉变体、4 种尺寸、loading 状态
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, block, className = '', children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center select-none transition-all duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        'disabled:cursor-not-allowed press-feedback rounded-DEFAULT',
        variantClasses[variant],
        sizeClasses[size],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" /> : icon}
      {children}
    </button>
  )
})

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  tooltip?: string
  active?: boolean
}

const iconVariantClasses: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost: 'text-fg-secondary hover:bg-overlay hover:text-fg',
  secondary: 'text-fg bg-raised border border-line hover:bg-overlay hover:border-line-strong',
  danger: 'text-fg-secondary hover:bg-sig-red/10 hover:text-sig-red',
}

const iconSizeClasses: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'h-6 w-6 [&>svg]:size-3.5',
  md: 'h-7.5 w-7.5 [&>svg]:size-4',
  lg: 'h-9 w-9 [&>svg]:size-4.5',
}

/** 图标按钮（tooltip 提示） */
export function IconButton({
  variant = 'ghost',
  size = 'md',
  active = false,
  tooltip,
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      title={tooltip}
      aria-label={tooltip}
      className={[
        'inline-flex items-center justify-center rounded-md transition-all duration-fast press-feedback',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40 disabled:cursor-not-allowed',
        iconVariantClasses[variant],
        iconSizeClasses[size],
        active ? 'bg-accent-soft text-accent' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
