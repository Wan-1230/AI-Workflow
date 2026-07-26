import { app, BrowserWindow, ipcMain, shell, dialog, Menu, safeStorage } from 'electron'
import { join } from 'path'
import { WorkflowEngine } from './engine'
import { validateWorkflow } from './engine/validator'
import { ExecutionStorage } from './engine/storage'
import { CredentialManager } from './engine/storage/credentials'
import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'

let mainWindow: BrowserWindow | null = null
const engine = new WorkflowEngine()
let executionStorage: ExecutionStorage | null = null
let credentialManager: CredentialManager | null = null
let currentExecutionId: string | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'AI Workflow',
    backgroundColor: '#f5f2ed',
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
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 开发模式自动打开 DevTools
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ===== 应用菜单 =====

function setupMenu() {
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建工作流',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:event', 'new')
        },
        {
          label: '打开...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:event', 'open')
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:event', 'save')
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'resetZoom', label: '重置缩放' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '使用教程',
          accelerator: 'F1',
          click: () => mainWindow?.webContents.send('menu:event', 'help')
        },
        {
          label: 'GitHub',
          click: () => shell.openExternal('https://github.com')
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)
}

// ===== IPC 处理 =====

function setupIPC() {
  // 执行工作流
  ipcMain.handle('workflow:execute', async (_event, wf: WorkflowDefinition) => {
    try {
      // 输入校验
      const validation = validateWorkflow(wf)
      if (!validation.valid) {
        return { success: false, error: `工作流校验失败: ${validation.errors.join('; ')}` }
      }

      currentExecutionId = `exec_${Date.now()}`

      const onEvent = (evt: ExecutionEvent) => {
        mainWindow?.webContents.send('execution:update', evt)
      }

      // 注入凭证到执行上下文
      const secrets = credentialManager?.getAll() || {}
      const result = await engine.execute(wf, onEvent, currentExecutionId, secrets)

      // 将 Map 转为普通对象以便 IPC 序列化
      const resultObj: Record<string, unknown> = {}
      for (const [key, value] of result) {
        resultObj[key] = value
      }

      // 保存执行历史
      const hasError = [...result.values()].some(r => r.status === 'error')
      const wasCancelled = [...result.values()].some(r => r.status === 'cancelled')
      try {
        executionStorage?.saveExecution({
          id: currentExecutionId,
          workflowId: wf.id || 'unknown',
          workflowName: wf.name || '未命名',
          status: wasCancelled ? 'cancelled' : hasError ? 'error' : 'completed',
          startedAt: Date.now() - 1, // 近似值
          finishedAt: Date.now(),
          nodeResults: result
        })
      } catch { /* 存储失败不影响主流程 */ }

      currentExecutionId = null
      return { success: true, result: resultObj }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      currentExecutionId = null
      return { success: false, error: message }
    }
  })

  // 取消执行
  ipcMain.handle('workflow:cancel', async () => {
    if (currentExecutionId) {
      const cancelled = engine.cancel(currentExecutionId)
      return { success: cancelled }
    }
    return { success: false, error: '无活跃执行' }
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

  // 文件保存对话框
  ipcMain.handle('dialog:save', async (_event, defaultName: string, content: string) => {
    if (!mainWindow) return { success: false }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存工作流',
      defaultPath: defaultName,
      filters: [
        { name: '工作流文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false }
    }

    const fs = await import('fs/promises')
    await fs.writeFile(result.filePath, content, 'utf-8')
    return { success: true, path: result.filePath }
  })

  // 文件打开对话框
  ipcMain.handle('dialog:open', async () => {
    if (!mainWindow) return { success: false }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '打开工作流',
      filters: [
        { name: '工作流文件', extensions: ['json', 'yml', 'yaml'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }

    const fs = await import('fs/promises')
    const content = await fs.readFile(result.filePaths[0], 'utf-8')

    try {
      const data = JSON.parse(content)
      return { success: true, data }
    } catch {
      return { success: false, error: '文件格式无效' }
    }
  })

  // 获取用户数据目录
  ipcMain.handle('app:getPath', (_event, name: string) => {
    return app.getPath(name as any)
  })

  // 执行历史查询
  ipcMain.handle('history:list', (_event, options?: { workflowId?: string; limit?: number; offset?: number }) => {
    try {
      return { success: true, data: executionStorage?.getHistory(options) || [] }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('history:get', (_event, id: string) => {
    try {
      return { success: true, data: executionStorage?.getExecution(id) || null }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('history:stats', () => {
    try {
      return { success: true, data: executionStorage?.getStats() || null }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  // 凭证管理
  ipcMain.handle('credentials:list', () => {
    try {
      return { success: true, data: credentialManager?.list() || [] }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('credentials:set', (_event, key: string, value: string, displayName?: string) => {
    try {
      credentialManager?.set(key, value, displayName)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('credentials:delete', (_event, key: string) => {
    try {
      const deleted = credentialManager?.delete(key) || false
      return { success: deleted }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })
}

// ===== 应用生命周期 =====

app.whenReady().then(() => {
  // 初始化执行历史存储
  try {
    executionStorage = new ExecutionStorage()
  } catch (err) {
    console.error('初始化执行历史存储失败:', err)
  }

  // 初始化凭证管理器
  try {
    credentialManager = new CredentialManager()
  } catch (err) {
    console.error('初始化凭证管理器失败:', err)
  }

  setupIPC()
  setupMenu()
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

app.on('before-quit', () => {
  executionStorage?.close()
  credentialManager?.close()
})
