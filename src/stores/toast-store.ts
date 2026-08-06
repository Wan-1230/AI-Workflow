import { create } from 'zustand'
import { v4 as uuid } from 'uuid'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
  duration: number
}

interface ToastStore {
  toasts: ToastItem[]
  show: (toast: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => string
  dismiss: (id: string) => void
  clear: () => void
}

/**
 * 全局 Toast 通知（成功/错误/警告/信息）
 * 供所有异步操作反馈使用，杜绝"静默失败"
 */
export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  show: ({ type, title, message, duration = 3200 }) => {
    const id = uuid()
    set({ toasts: [...get().toasts, { id, type, title, message, duration }] })
    // 自动消失（error 类消息停留更久）
    const timeout = duration + (type === 'error' ? 2000 : 0)
    window.setTimeout(() => get().dismiss(id), timeout)
    return id
  },

  dismiss: (id) => {
    set({ toasts: get().toasts.filter(t => t.id !== id) })
  },

  clear: () => set({ toasts: [] }),
}))

/** 便捷 API：在任意组件外直接调用 */
export const toast = {
  info: (title: string, message?: string) => useToastStore.getState().show({ type: 'info', title, message }),
  success: (title: string, message?: string) => useToastStore.getState().show({ type: 'success', title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().show({ type: 'warning', title, message }),
  error: (title: string, message?: string) => useToastStore.getState().show({ type: 'error', title, message, duration: 5000 }),
}
