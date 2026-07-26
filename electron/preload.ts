import { contextBridge, ipcRenderer } from 'electron'
import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'

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
    ipcRenderer.invoke('credentials:delete', key)
})
