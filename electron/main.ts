import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { WorkflowEngine } from './engine'
import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'

let mainWindow: BrowserWindow | null = null
const engine = new WorkflowEngine()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'AI Workflow',
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 开发模式加载 localhost，生产模式加载文件
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  // 开发模式自动打开 DevTools
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ===== IPC 处理 =====

function setupIPC() {
  // 执行工作流
  ipcMain.handle('workflow:execute', async (_event, wf: WorkflowDefinition) => {
    try {
      const onEvent = (evt: ExecutionEvent) => {
        mainWindow?.webContents.send('execution:update', evt)
      }

      const result = await engine.execute(wf, onEvent)
      return { success: true, result }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  // 保存工作流到本地文件
  ipcMain.handle('workflow:save', async (_event, filePath: string, data: WorkflowDefinition) => {
    const fs = await import('fs/promises')
    const path = await import('path')

    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  })

  // 加载工作流
  ipcMain.handle('workflow:load', async (_event, filePath: string) => {
    const fs = await import('fs/promises')
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as WorkflowDefinition
  })

  // 列出所有工作流
  ipcMain.handle('workflow:list', async (_event, dirPath: string) => {
    const fs = await import('fs/promises')
    const path = await import('path')

    try {
      await fs.mkdir(dirPath, { recursive: true })
      const files = await fs.readdir(dirPath)
      return files
        .filter((f: string) => f.endsWith('.json') || f.endsWith('.yml') || f.endsWith('.yaml'))
        .map((f: string) => ({
          name: f.replace(/\.(json|yml|yaml)$/, ''),
          path: path.join(dirPath, f)
        }))
    } catch {
      return []
    }
  })

  // 获取用户数据目录
  ipcMain.handle('app:getPath', (_event, name: string) => {
    return app.getPath(name as any)
  })
}

// ===== 应用生命周期 =====

app.whenReady().then(() => {
  setupIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
