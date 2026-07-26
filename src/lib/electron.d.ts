import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'

export interface ElectronAPI {
  executeWorkflow: (wf: WorkflowDefinition) => Promise<{ success: boolean; result?: unknown; error?: string }>
  cancelExecution: () => Promise<{ success: boolean; error?: string }>
  saveWorkflow: (filePath: string, data: WorkflowDefinition) => Promise<{ success: boolean }>
  loadWorkflow: (filePath: string) => Promise<WorkflowDefinition>
  listWorkflows: (dirPath: string) => Promise<{ name: string; path: string }[]>
  getAppPath: (name: string) => Promise<string>
  onExecutionUpdate: (callback: (event: ExecutionEvent) => void) => () => void
  dialogSave: (defaultName: string, content: string) => Promise<{ success: boolean; path?: string }>
  dialogOpen: () => Promise<{ success: boolean; data?: WorkflowDefinition; error?: string }>
  onMenuEvent: (callback: (action: string) => void) => () => void
  getHistory: (options?: { workflowId?: string; limit?: number; offset?: number }) => Promise<{ success: boolean; data?: ExecutionRecord[] }>
  getExecutionDetail: (id: string) => Promise<{ success: boolean; data?: ExecutionRecord | null }>
  getHistoryStats: () => Promise<{ success: boolean; data?: { total: number; completed: number; error: number; avgDuration: number } }>
  getCredentials: () => Promise<{ success: boolean; data?: { key: string; displayName: string; createdAt: string; updatedAt: string }[] }>
  setCredential: (key: string, value: string, displayName?: string) => Promise<{ success: boolean; error?: string }>
  deleteCredential: (key: string) => Promise<{ success: boolean; error?: string }>
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
