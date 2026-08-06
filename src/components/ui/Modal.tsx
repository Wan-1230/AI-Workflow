import { useEffect, type ReactNode } from 'react'
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
  // ESC 关闭 + 打开时锁定背景滚动
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in"
        onClick={maskClosable ? onClose : undefined}
      />
      {/* 面板 */}
      <div
        className="relative bg-surface border border-line rounded-xl shadow-modal animate-scale-in flex flex-col max-h-[85vh] max-w-[92vw]"
        style={{ width }}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-5 h-12 border-b border-line shrink-0">
            <h3 className="text-sm font-semibold text-fg truncate">{title}</h3>
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
