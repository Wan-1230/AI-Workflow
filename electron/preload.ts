import { contextBridge, ipcRenderer } from 'electron'
import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'
import type { CreateProjectInput, ProjectSummary, ProjectRecord, WorkflowTemplate } from '@shared/project'
import type { ModelConfig, ModelConfigInput, ModelTestResult } from '@shared/model'
import type { PromptTemplate, PromptTemplateInput, PromptRenderResult } from '@shared/prompt'
import type { AppSettings, AppSettingsInput } from '@shared/settings'

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('api', {
  // 执行工作流
  executeWorkflow: (wf: WorkflowDefinition) =>
    ipcRenderer.invoke('workflow:execute', wf),

  // 取消执行
  cancelExecution: () =>
    ipcRenderer.invoke('workflow:cancel'),

  // 保存/加载工作流
  saveWorkflow: (filePath: string, data: WorkflowDefinition) =>
    ipcRenderer.invoke('workflow:save', filePath, data),

  loadWorkflow: (filePath: string) =>
    ipcRenderer.invoke('workflow:load', filePath),

  listWorkflows: (dirPath: string) =>
    ipcRenderer.invoke('workflow:list', dirPath),

  // 文件对话框
  dialogSave: (defaultName: string, content: string) =>
    ipcRenderer.invoke('dialog:save', defaultName, content),

  dialogOpen: () =>
    ipcRenderer.invoke('dialog:open'),

  // 获取应用路径
  getAppPath: (name: string) =>
    ipcRenderer.invoke('app:getPath', name),

  // 执行事件推送
  onExecutionUpdate: (callback: (event: ExecutionEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ExecutionEvent) => callback(data)
    ipcRenderer.on('execution:update', handler)
    // 返回取消监听的函数
    return () => ipcRenderer.removeListener('execution:update', handler)
  },

  // 菜单事件监听
  onMenuEvent: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('menu:event', handler)
    return () => ipcRenderer.removeListener('menu:event', handler)
  },

  // 执行历史
  getHistory: (options?: { workflowId?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('history:list', options),

  getExecutionDetail: (id: string) =>
    ipcRenderer.invoke('history:get', id),

  getHistoryStats: () =>
    ipcRenderer.invoke('history:stats'),

  // 凭证管理
  getCredentials: () =>
    ipcRenderer.invoke('credentials:list'),

  setCredential: (key: string, value: string, displayName?: string) =>
    ipcRenderer.invoke('credentials:set', key, value, displayName),

  deleteCredential: (key: string) =>
    ipcRenderer.invoke('credentials:delete', key),

  // ===== 项目库 =====

  listTemplates: (): Promise<{ success: boolean; data?: Pick<WorkflowTemplate, 'id' | 'name' | 'description' | 'icon' | 'category'>[]; error?: string }> =>
    ipcRenderer.invoke('templates:list'),

  createProject: (input: CreateProjectInput): Promise<{ success: boolean; data?: ProjectSummary; error?: string }> =>
    ipcRenderer.invoke('projects:create', input),

  listProjects: (): Promise<{ success: boolean; data?: ProjectSummary[]; error?: string }> =>
    ipcRenderer.invoke('projects:list'),

  getProject: (id: string): Promise<{ success: boolean; data?: ProjectRecord | null; error?: string }> =>
    ipcRenderer.invoke('projects:get', id),

  saveProjectWorkflow: (id: string, workflow: WorkflowDefinition): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('projects:saveWorkflow', id, workflow),

  updateProjectMeta: (id: string, meta: { name?: string; description?: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('projects:updateMeta', id, meta),

  deleteProject: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('projects:delete', id),

  // ===== 模型库 =====

  listModels: (): Promise<{ success: boolean; data?: ModelConfig[]; error?: string }> =>
    ipcRenderer.invoke('models:list'),

  createModel: (input: ModelConfigInput): Promise<{ success: boolean; data?: ModelConfig; error?: string }> =>
    ipcRenderer.invoke('models:create', input),

  updateModel: (id: string, input: ModelConfigInput): Promise<{ success: boolean; data?: ModelConfig; error?: string }> =>
    ipcRenderer.invoke('models:update', id, input),

  deleteModel: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('models:delete', id),

  setDefaultModel: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('models:setDefault', id),

  testModel: (id: string, apiKeyOverride?: string): Promise<{ success: boolean; data?: ModelTestResult; error?: string }> =>
    ipcRenderer.invoke('models:test', id, apiKeyOverride),

  // ===== 提示词库 =====

  listPrompts: (options?: { keyword?: string; category?: string; favoriteOnly?: boolean }): Promise<{ success: boolean; data?: PromptTemplate[]; error?: string }> =>
    ipcRenderer.invoke('prompts:list', options),

  upsertPrompt: (input: PromptTemplateInput): Promise<{ success: boolean; data?: PromptTemplate; error?: string }> =>
    ipcRenderer.invoke('prompts:upsert', input),

  deletePrompt: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompts:delete', id),

  togglePromptFavorite: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('prompts:toggleFavorite', id),

  listPromptCategories: (): Promise<{ success: boolean; data?: string[]; error?: string }> =>
    ipcRenderer.invoke('prompts:categories'),

  renderPrompt: (id: string, variables: Record<string, unknown>): Promise<{ success: boolean; data?: PromptRenderResult; error?: string }> =>
    ipcRenderer.invoke('prompts:render', id, variables),

  // ===== 设置 =====

  getSettings: (): Promise<{ success: boolean; data?: AppSettings; error?: string }> =>
    ipcRenderer.invoke('settings:get'),

  updateSettings: (input: AppSettingsInput): Promise<{ success: boolean; data?: AppSettings; error?: string }> =>
    ipcRenderer.invoke('settings:update', input)
})
