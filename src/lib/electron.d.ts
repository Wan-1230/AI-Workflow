import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'

export interface ElectronAPI {
  executeWorkflow: (wf: WorkflowDefinition) => Promise<{ success: boolean; result?: unknown; error?: string }>
  saveWorkflow: (filePath: string, data: WorkflowDefinition) => Promise<{ success: boolean }>
  loadWorkflow: (filePath: string) => Promise<WorkflowDefinition>
  listWorkflows: (dirPath: string) => Promise<{ name: string; path: string }[]>
  getAppPath: (name: string) => Promise<string>
  onExecutionUpdate: (callback: (event: ExecutionEvent) => void) => () => void
  dialogSave: (defaultName: string, content: string) => Promise<{ success: boolean; path?: string }>
  dialogOpen: () => Promise<{ success: boolean; data?: WorkflowDefinition }>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
