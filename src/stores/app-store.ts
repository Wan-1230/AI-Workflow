import { create } from 'zustand'
import type { ProjectSummary } from '@shared/project'

/** 应用视图：首页 / 编辑器 / 模型 / 提示词 / 日志 / 设置 */
export type AppView = 'home' | 'editor' | 'models' | 'prompts' | 'logs' | 'settings'

interface AppStore {
  view: AppView
  /** 当前打开的项目 */
  currentProject: ProjectSummary | null
  /** 首页项目列表缓存 */
  projects: ProjectSummary[]
  projectsLoaded: boolean
  /** 是否正在保存（防止并发） */
  saving: boolean

  setView: (view: AppView) => void
  openProject: (project: ProjectSummary | null) => void
  setProjects: (projects: ProjectSummary[]) => void
  setSaving: (saving: boolean) => void

  /** 刷新项目列表（重新拉取） */
  refreshProjects: () => Promise<void>
  /** 离开编辑器时持久化工作流 */
  saveCurrentWorkflow: (workflow: unknown) => Promise<boolean>
}

export const useAppStore = create<AppStore>((set, get) => ({
  view: 'home',
  currentProject: null,
  projects: [],
  projectsLoaded: false,
  saving: false,

  setView: view => set({ view }),
  openProject: project => set({ currentProject: project, view: project ? 'editor' : 'home' }),
  setProjects: projects => set({ projects, projectsLoaded: true }),
  setSaving: saving => set({ saving }),

  refreshProjects: async () => {
    try {
      const res = await window.api.listProjects()
      if (res.success && res.data) {
        set({ projects: res.data, projectsLoaded: true })
      }
    } catch {
      // 静默失败，保持旧列表
    }
  },

  saveCurrentWorkflow: async workflow => {
    const { currentProject, saving } = get()
    if (!currentProject || saving) return false
    set({ saving: true })
    try {
      const res = await window.api.saveProjectWorkflow(currentProject.id, workflow as never)
      if (res.success) {
        await get().refreshProjects()
        return true
      }
      return false
    } catch {
      return false
    } finally {
      set({ saving: false })
    }
  }
}))
