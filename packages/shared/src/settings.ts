// ===== 应用设置类型 =====

export type AppLanguage = 'zh-CN' | 'en-US'

/** 应用全局设置（持久化于主进程 settings.db） */
export interface AppSettings {
  /** 外观主题（与渲染进程 theme-store 同步） */
  theme: 'light' | 'dark' | 'system'
  language: AppLanguage
  /** 工作流存储目录（默认 userData/workflows） */
  storagePath: string
  /** 高级调试开关：输出更详细日志 */
  debugMode: boolean
  /** 执行时默认超时（ms） */
  defaultTimeout: number
  /** 是否保存执行历史 */
  saveHistory: boolean
}

export type AppSettingsInput = Partial<AppSettings>
