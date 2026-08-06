import type { WorkflowDefinition, ExecutionEvent, NodeResult } from '@shared/workflow'
import type { ProjectSummary, ProjectRecord, WorkflowTemplate } from '@shared/project'
import type { ModelConfig, ModelConfigInput, ModelTestResult } from '@shared/model'
import type { PromptTemplate, PromptTemplateInput, PromptRenderResult } from '@shared/prompt'
import type { AppSettings, AppSettingsInput } from '@shared/settings'

export interface ElectronAPI {
  // 执行工作流
  executeWorkflow: (wf: WorkflowDefinition) => Promise<{ success: boolean; result?: Record<string, NodeResult>; error?: string }>
  cancelExecution: () => Promise<{ success: boolean; error?: string }>

  // 保存/加载工作流（文件系统）
  saveWorkflow: (filePath: string, data: WorkflowDefinition) => Promise<{ success: boolean }>
  loadWorkflow: (filePath: string) => Promise<WorkflowDefinition>
  listWorkflows: (dirPath: string) => Promise<{ name: string; path: string }[]>

  // 文件对话框
  dialogSave: (defaultName: string, content: string) => Promise<{ success: boolean; path?: string }>
  dialogOpen: () => Promise<{ success: boolean; data?: WorkflowDefinition; error?: string }>

  getAppPath: (name: string) => Promise<string>

  // 事件监听
  onExecutionUpdate: (callback: (event: ExecutionEvent) => void) => () => void
  onMenuEvent: (callback: (action: string) => void) => () => void

  // 执行历史
  getHistory: (options?: { workflowId?: string; limit?: number; offset?: number }) => Promise<{ success: boolean; data?: ExecutionRecord[]; error?: string }>
  getExecutionDetail: (id: string) => Promise<{ success: boolean; data?: ExecutionRecord | null; error?: string }>
  getHistoryStats: () => Promise<{ success: boolean; data?: { total: number; completed: number; error: number; avgDuration: number }; error?: string }>

  // 凭证管理
  getCredentials: () => Promise<{ success: boolean; data?: { key: string; displayName: string; createdAt: string; updatedAt: string }[]; error?: string }>
  setCredential: (key: string, value: string, displayName?: string) => Promise<{ success: boolean; error?: string }>
  deleteCredential: (key: string) => Promise<{ success: boolean; error?: string }>

  // 项目库
  listTemplates: () => Promise<{ success: boolean; data?: Pick<WorkflowTemplate, 'id' | 'name' | 'description' | 'icon' | 'category'>[]; error?: string }>
  createProject: (input: { name: string; description?: string; templateId?: string; copyFromId?: string }) => Promise<{ success: boolean; data?: ProjectSummary; error?: string }>
  listProjects: () => Promise<{ success: boolean; data?: ProjectSummary[]; error?: string }>
  getProject: (id: string) => Promise<{ success: boolean; data?: ProjectRecord | null; error?: string }>
  saveProjectWorkflow: (id: string, workflow: WorkflowDefinition) => Promise<{ success: boolean; error?: string }>
  updateProjectMeta: (id: string, meta: { name?: string; description?: string }) => Promise<{ success: boolean; error?: string }>
  deleteProject: (id: string) => Promise<{ success: boolean; error?: string }>

  // 模型库
  listModels: () => Promise<{ success: boolean; data?: ModelConfig[]; error?: string }>
  createModel: (input: ModelConfigInput) => Promise<{ success: boolean; data?: ModelConfig; error?: string }>
  updateModel: (id: string, input: ModelConfigInput) => Promise<{ success: boolean; data?: ModelConfig; error?: string }>
  deleteModel: (id: string) => Promise<{ success: boolean; error?: string }>
  setDefaultModel: (id: string) => Promise<{ success: boolean; error?: string }>
  testModel: (id: string, apiKeyOverride?: string) => Promise<{ success: boolean; data?: ModelTestResult; error?: string }>

  // 提示词库
  listPrompts: (options?: { keyword?: string; category?: string; favoriteOnly?: boolean }) => Promise<{ success: boolean; data?: PromptTemplate[]; error?: string }>
  upsertPrompt: (input: PromptTemplateInput) => Promise<{ success: boolean; data?: PromptTemplate; error?: string }>
  deletePrompt: (id: string) => Promise<{ success: boolean; error?: string }>
  togglePromptFavorite: (id: string) => Promise<{ success: boolean; error?: string }>
  listPromptCategories: () => Promise<{ success: boolean; data?: string[]; error?: string }>
  renderPrompt: (id: string, variables: Record<string, unknown>) => Promise<{ success: boolean; data?: PromptRenderResult; error?: string }>

  // 设置
  getSettings: () => Promise<{ success: boolean; data?: AppSettings; error?: string }>
  updateSettings: (input: AppSettingsInput) => Promise<{ success: boolean; data?: AppSettings; error?: string }>
}

export interface ExecutionRecord {
  id: string
  workflowId: string
  workflowName: string
  status: 'completed' | 'error' | 'cancelled'
  startedAt: string
  finishedAt: string
  duration: number
  nodeCount: number
  resultsJson: string
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
