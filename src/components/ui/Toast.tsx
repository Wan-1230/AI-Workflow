import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { useToastStore, type ToastType } from '../../stores/toast-store'
import { IconButton } from './Button'

/* =====================================================================
   Toast 视图容器：渲染全局通知（固定在窗口底部中央）
   ===================================================================== */

const typeStyles: Record<ToastType, { icon: React.ReactNode; bar: string }> = {
  success: { icon: <CheckCircle2 size={16} className="text-success shrink-0" />, bar: 'bg-success' },
  error: { icon: <XCircle size={16} className="text-danger shrink-0" />, bar: 'bg-danger' },
  warning: { icon: <AlertTriangle size={16} className="text-warning shrink-0" />, bar: 'bg-warning' },
  info: { icon: <Info size={16} className="text-info shrink-0" />, bar: 'bg-info' },
}

export function ToastViewport() {
  const toasts = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)

  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md">
      {toasts.map(t => {
        const s = typeStyles[t.type]
        return (
          <div
            key={t.id}
            className="pointer-events-auto w-full bg-surface border border-line rounded-lg shadow-pop animate-fade-up overflow-hidden"
          >
            <div className="flex items-start gap-2.5 px-3.5 py-2.5">
              <span className="mt-0.5">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-fg leading-snug">{t.title}</div>
                {t.message && (
                  <div className="text-xs text-fg-secondary mt-0.5 leading-relaxed break-all line-clamp-3">{t.message}</div>
                )}
              </div>
              <IconButton size="sm" tooltip="关闭" onClick={() => dismiss(t.id)}>
                <X />
              </IconButton>
            </div>
            <div className={`h-0.5 ${s.bar} opacity-70`} />
          </div>
        )
      })}
    </div>
  )
}
