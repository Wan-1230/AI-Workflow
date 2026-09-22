import { useEffect, useRef, useId, type ReactNode } from 'react'
import { FOCUSABLE, nextIndex, trapDecision } from '../../lib/focus-trap'
import { X } from 'lucide-react'
import { Button, type ButtonVariant } from './Button'
import { IconButton } from './Button'

/* =====================================================================
   Modal 弹窗基元：遮罩 + 居中面板 + ESC 关闭 + 动画
   ===================================================================== */

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** 面板宽度（默认 480px） */
  width?: number
  children: ReactNode
  /** 底部操作区 */
  footer?: ReactNode
  /** 点击遮罩关闭（默认 true） */
  maskClosable?: boolean
  /** 面板无内边距（用于自定义布局） */
  noPadding?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  width = 480,
  children,
  footer,
  maskClosable = true,
  noPadding = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  // 打开时：记住触发器 → 把焦点送进面板 → 关闭后还回去。
  // 以前只处理了 Escape，键盘用户一进弹层就"掉进黑洞"。
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusFirst = (): void => {
      const panel = panelRef.current
      if (!panel) return
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ;(items[0] ?? panel).focus({ preventScroll: true })
    }
    // 面板刚挂载，等一帧再找可聚焦元素
    const raf = requestAnimationFrame(focusFirst)

    const onKey = (e: KeyboardEvent): void => {
      const decision = trapDecision(e.key, e.shiftKey, Boolean(panelRef.current?.contains(document.activeElement)))
      if (decision === 'escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (decision === 'trap' && panelRef.current) {
        e.preventDefault()
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        if (items.length === 0) return
        const at = items.indexOf(document.activeElement as HTMLElement)
        items[nextIndex(items.length, at, e.shiftKey)]?.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey, true)
      restoreRef.current?.focus({ preventScroll: true })
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title !== undefined ? titleId : undefined}
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in"
        onClick={maskClosable ? onClose : undefined}
      />
      {/* 面板 */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative bg-surface border border-line rounded-xl shadow-modal animate-scale-in flex flex-col max-h-[85vh] max-w-[92vw] outline-none"
        style={{ width }}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-5 h-12 border-b border-line shrink-0">
            <h3 id={titleId} className="text-sm font-semibold text-fg truncate">{title}</h3>
            <IconButton size="sm" tooltip="关闭 (Esc)" onClick={onClose}>
              <X />
            </IconButton>
          </div>
        )}
        <div className={`min-h-0 flex-1 overflow-auto ${noPadding ? '' : 'px-5 py-4'}`}>{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line shrink-0 bg-app/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* =====================================================================
   ConfirmDialog 确认对话框（危险操作统一走这里）
   ===================================================================== */

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const btnVariant: ButtonVariant = variant === 'danger' ? 'danger' : 'primary'
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width={400}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={btnVariant} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-sm text-fg-secondary leading-relaxed">{message}</div>
    </Modal>
  )
}
