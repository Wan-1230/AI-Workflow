import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react'
import { AlertCircle } from 'lucide-react'

/* =====================================================================
   表单基元：Input / Textarea / Select / Switch
   统一 label / hint / error / disabled 视觉，符合全局设计系统
   ===================================================================== */

interface FieldWrapperProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactNode
}

/** 字段包装：label + hint + error 布局 */
function FieldWrapper({ label, hint, error, required, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {label && (
        <label className="text-xs font-medium text-fg-secondary flex items-center gap-1">
          {label}
          {required && <span className="text-sig-red">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="text-2xs text-sig-red flex items-center gap-1">
          <AlertCircle size={11} /> {error}
        </span>
      ) : hint ? (
        <span className="text-2xs text-fg-muted leading-relaxed">{hint}</span>
      ) : null}
    </div>
  )
}

const baseControlClass =
  'w-full bg-raised border border-line rounded-DEFAULT px-2.5 text-sm text-fg placeholder:text-fg-faint ' +
  'transition-all duration-fast hover:border-line-strong focus:border-accent focus:shadow-none ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  hint?: ReactNode
  /** 与 hint 等价（配置面板 schema 字段使用） */
  help?: ReactNode
  error?: string
  /** 左侧图标 */
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, help, error, icon, className = '', id, ...rest },
  ref
) {
  const control = (
    <div className="relative">
      {icon && (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none [&>svg]:size-3.5">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        id={id}
        className={[baseControlClass, 'h-8', icon ? 'pl-8' : '', error ? '!border-sig-red' : '', className].join(' ')}
        {...rest}
      />
    </div>
  )
  return (
    <FieldWrapper label={label} hint={hint ?? help} error={error}>
      {control}
    </FieldWrapper>
  )
})

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  hint?: ReactNode
  /** 与 hint 等价（配置面板 schema 字段使用） */
  help?: ReactNode
  error?: string
  /** 固定最小高度 */
  minRows?: number
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, help, error, minRows = 3, className = '', ...rest },
  ref
) {
  return (
    <FieldWrapper label={label} hint={hint ?? help} error={error}>
      <textarea
        ref={ref}
        className={[baseControlClass, 'py-2 leading-relaxed resize-y', error ? '!border-sig-red' : '', className].join(' ')}
        style={{ minHeight: `${minRows * 1.5 + 1}rem` }}
        {...rest}
      />
    </FieldWrapper>
  )
})

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className = '', ...rest },
  ref
) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      <select
        ref={ref}
        className={[
          baseControlClass,
          'h-8 appearance-none pr-8 bg-no-repeat bg-[right_0.6rem_center]',
          "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')]",
          error ? '!border-sig-red' : '',
          className,
        ].join(' ')}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  )
})

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  hint?: ReactNode
  disabled?: boolean
}

/** 开关控件 */
export function Switch({ checked, onChange, label, hint, disabled = false }: SwitchProps) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      {(label || hint) && (
        <div className="flex flex-col min-w-0">
          {label && <span className="text-sm text-fg">{label}</span>}
          {hint && <span className="text-2xs text-fg-muted">{hint}</span>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          checked ? 'bg-accent' : 'bg-line-strong',
          disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-fast',
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
          ].join(' ')}
        />
      </button>
    </div>
  )
}
