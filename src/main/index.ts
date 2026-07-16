import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron'
import { join } from 'path'
import { WorkflowEngine } from '../../electron/engine'
import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'

let mainWindow: BrowserWindow | null = null
const engine = new WorkflowEngine()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'AI 工作流',
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
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

  // 原生保存对话框
  ipcMain.handle('dialog:save', async (_event, defaultName: string, content: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '保存工作流',
      defaultPath: defaultName,
      filters: [
        { name: '工作流文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (!result.canceled && result.filePath) {
      const fs = await import('fs/promises')
      await fs.writeFile(result.filePath, content, 'utf-8')
      return { success: true, path: result.filePath }
    }
    return { success: false }
  })

  // 原生打开对话框
  ipcMain.handle('dialog:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '打开工作流',
      filters: [
        { name: '工作流文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const fs = await import('fs/promises')
      const content = await fs.readFile(result.filePaths[0], 'utf-8')
      return { success: true, data: JSON.parse(content) }
    }
    return { success: false }
  })

  // 获取用户数据目录
  ipcMain.handle('app:getPath', (_event, name: string) => {
    return app.getPath(name as any)
  })
}

// ===== 应用生命周期 =====

function setupMenu() {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: 'AI 工作流',
      submenu: [
        { label: '关于 AI 工作流', role: 'about' as const },
        { type: 'separator' as const },
        { label: '隐藏', role: 'hide' as const },
        { label: '隐藏其他', role: 'hideOthers' as const },
        { label: '全部显示', role: 'unhide' as const },
        { type: 'separator' as const },
        { label: '退出', role: 'quit' as const },
      ]
    }] : []),

    {
      label: '文件',
      submenu: [
        {
          label: '新建工作流',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new')
        },
        {
          label: '打开…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open')
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save')
        },
        { type: 'separator' },
        ...(isMac ? [] : [{ label: '退出', accelerator: 'Alt+F4', role: 'quit' as const }]),
      ]
    },

    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' as const },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' as const },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' as const },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' as const },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' as const },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' as const },
      ]
    },

    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' as const },
        { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' as const },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' as const },
        { type: 'separator' },
        { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' as const },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' as const },
        { label: '重置缩放', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' as const },
      ]
    },

    {
      label: '帮助',
      submenu: [
        {
          label: '使用教程',
          accelerator: 'F1',
          click: () => mainWindow?.webContents.send('menu:help')
        },
        { type: 'separator' },
        {
          label: '关于 AI 工作流',
          click: () => {
            const { dialog } = require('electron')
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: '关于 AI 工作流',
              message: 'AI 工作流自动化工具',
              detail: '版本 0.1.0\n\n可视化的 AI 工作流自动化桌面工具。\n像搭积木一样编排你的自动化流程。',
            })
          }
        },
      ]
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// ===== 应用生命周期 =====

app.whenReady().then(() => {
  setupMenu()
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
