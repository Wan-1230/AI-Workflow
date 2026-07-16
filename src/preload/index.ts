import { contextBridge, ipcRenderer } from 'electron'
import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('api', {
  // 执行工作流
  executeWorkflow: (wf: WorkflowDefinition) =>
    ipcRenderer.invoke('workflow:execute', wf),

  // 保存/加载工作流
  saveWorkflow: (filePath: string, data: WorkflowDefinition) =>
    ipcRenderer.invoke('workflow:save', filePath, data),

  loadWorkflow: (filePath: string) =>
    ipcRenderer.invoke('workflow:load', filePath),

  listWorkflows: (dirPath: string) =>
    ipcRenderer.invoke('workflow:list', dirPath),

  // 获取应用路径
  getAppPath: (name: string) =>
    ipcRenderer.invoke('app:getPath', name),

  // 执行事件推送
  onExecutionUpdate: (callback: (event: ExecutionEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ExecutionEvent) => callback(data)
    ipcRenderer.on('execution:update', handler)
    return () => ipcRenderer.removeListener('execution:update', handler)
  },

  // 原生对话框
  dialogSave: (defaultName: string, content: string) =>
    ipcRenderer.invoke('dialog:save', defaultName, content),

  dialogOpen: () =>
    ipcRenderer.invoke('dialog:open'),
})
