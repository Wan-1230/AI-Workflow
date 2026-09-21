import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { WorkflowEngine } from '../../electron/engine'
import { validateWorkflow, formatValidationIssues } from '@shared/validator'
import { ExecutionStorage } from '../../electron/engine/storage'
import { CredentialManager } from '../../electron/engine/storage/credentials'
import { ProjectStore } from '../../electron/engine/storage/projects'
import { ModelStore } from '../../electron/engine/storage/models'
import { PromptStore } from '../../electron/engine/storage/prompts'
import { SettingsStore } from '../../electron/engine/storage/settings'
import { workflowTemplates } from '../../electron/engine/templates'
import { runMigrations, MigrationError, type MigrationReport } from './db/index'
import { migrations } from './db/migrations'
import { redactSecrets, scanWorkflowSecrets } from '../../electron/engine/secrets-guard'
import type { WorkflowDefinition, ExecutionEvent } from '@shared/workflow'
import type { LlmModelInfo } from '@shared/node'
import type { CreateProjectInput } from '@shared/project'
import type { ModelConfigInput } from '@shared/model'
import type { PromptTemplateInput } from '@shared/prompt'
import type { AppSettingsInput } from '@shared/settings'

let mainWindow: BrowserWindow | null = null
const engine = new WorkflowEngine()

/** app.getPath 允许的路径类型 */
const ALLOWED_APP_PATHS = ['userData', 'documents', 'desktop', 'downloads', 'temp', 'home'] as const

/** 明文密钥的统一定位文案，供各写入口复用 */
function plaintextSecretError(
  findings: Array<{ nodeId: string; field: string; innerKey?: string }>
): string {
  const where = findings
    .map(f => `${f.nodeId}.${f.field}${f.innerKey ? `.${f.innerKey}` : ''}`)
    .join('、')
  return `工作流中存在明文密钥（位置：${where}）。请改为选择「模型配置」里的模型，`
    + `或在「设置 → 安全凭证」登记后引用凭证名 —— 密钥一旦写入项目文件，即视为泄露。`
}
let executionStorage: ExecutionStorage | null = null
let credentialManager: CredentialManager | null = null
let projectStore: ProjectStore | null = null
let modelStore: ModelStore | null = null
let promptStore: PromptStore | null = null
let settingsStore: SettingsStore | null = null
/**
 * 进行中的执行，按 executionId 索引。
 *
 * 此前用单个模块变量保存"当前执行 id"，两次快速点击运行会互相覆盖，
 * 导致取消操作打到错误的运行上。
 */
const activeRuns = new Map<string, { startedAt: number }>()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'AI Workflow',
    backgroundColor: '#f5f7fa',
    // 隐藏系统标题栏与窗口按钮，由渲染进程自绘标题栏（Codex 风格一体化）
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 最大化状态变化推送（供自绘标题栏切换按钮图标）
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false)
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
// 原生菜单栏已移除，所有菜单能力迁移到渲染进程自绘标题栏的汉堡菜单

function setupMenu() {
  Menu.setApplicationMenu(null)
}

// ===== IPC 处理 =====

function setupIPC() {
  // ===== 自绘标题栏：窗口控制 =====
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
      return false
    }
    mainWindow.maximize()
    return true
  })

  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false
  })

  // ===== 视图操作（原原生菜单「视图」迁移） =====
  ipcMain.handle('app:reload', () => {
    mainWindow?.webContents.reload()
  })

  ipcMain.handle('app:devtools', () => {
    mainWindow?.webContents.toggleDevTools()
  })

  ipcMain.handle('app:zoomIn', () => {
    const wc = mainWindow?.webContents
    if (wc) wc.setZoomLevel((wc.getZoomLevel() || 0) + 0.5)
  })

  ipcMain.handle('app:zoomOut', () => {
    const wc = mainWindow?.webContents
    if (wc) wc.setZoomLevel((wc.getZoomLevel() || 0) - 0.5)
  })

  ipcMain.handle('app:resetZoom', () => {
    mainWindow?.webContents.setZoomLevel(0)
  })

  // 执行工作流
  ipcMain.handle('workflow:execute', async (_event, wf: WorkflowDefinition, clientExecutionId?: string) => {
    try {
      // 输入校验
      const validation = validateWorkflow(wf)
      if (!validation.valid) {
        return { success: false, error: `工作流校验失败: ${formatValidationIssues(validation.errors)}` }
      }
      if (validation.warnings.length) {
        console.warn(`工作流校验告警: ${formatValidationIssues(validation.warnings)}`)
      }

      // 明文密钥不拒绝执行的话，用户会以为这套流程是"安全"的
      const leaked = scanWorkflowSecrets(wf)
      if (leaked.length) {
        return { success: false, error: plaintextSecretError(leaked) }
      }

      // 由渲染进程生成并在整个运行期间持有，取消才能精确命中自己启动的那一次
      const executionId = clientExecutionId?.trim() || `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const runStartedAt = Date.now()
      let runFinishedAt = 0
      activeRuns.set(executionId, { startedAt: runStartedAt })

      const onEvent = (evt: ExecutionEvent) => {
        if (evt.type === 'workflow:complete' || evt.type === 'workflow:cancelled' || evt.type === 'workflow:error') {
          runFinishedAt = evt.timestamp
        }
        mainWindow?.webContents.send('execution:update', evt)
      }

      // 注入凭证到执行上下文
      const secrets = credentialManager?.getAll() || {}

      // 注入模型运行时信息（含解密后的 API Key，仅存于主进程上下文，不回传渲染进程）
      const models: LlmModelInfo[] = (modelStore?.list() || []).map(m => ({
        id: m.id,
        baseUrl: m.baseUrl,
        model: m.model,
        apiKey: modelStore?.getApiKey(m.id) || '',
        temperature: m.temperature,
        maxTokens: m.maxTokens
      })).filter(m => m.apiKey)

      const result = await engine.execute(wf, onEvent, executionId, secrets, models)

      // 将 Map 转为普通对象以便 IPC 序列化
      const resultObj: Record<string, unknown> = {}
      for (const [key, value] of result) {
        resultObj[key] = value
      }

      // 保存执行历史：受 saveHistory 开关控制，且保留策略在此生效
      if (settingsStore?.getAll().saveHistory !== false) {
        const hasError = [...result.values()].some(r => r.status === 'error')
        const wasCancelled = [...result.values()].some(r => r.status === 'cancelled')
        try {
          executionStorage?.saveExecution({
            id: executionId,
            workflowId: wf.id || 'unknown',
            workflowName: wf.name || '未命名',
            status: wasCancelled ? 'cancelled' : hasError ? 'error' : 'completed',
            startedAt: runStartedAt,
            finishedAt: runFinishedAt || Date.now(),
            nodeResults: result
          })
          executionStorage?.pruneHistory()
        } catch (err) {
          // 历史写入失败不影响本次执行结果，但必须留痕
          console.error('写入执行历史失败:', err)
        }
      }

      activeRuns.delete(executionId)
      return { success: true, result: resultObj, executionId }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  // 取消执行：按 executionId 精确命中，不影响其他并发运行
  ipcMain.handle('workflow:cancel', async (_event, executionId?: string) => {
    const target = executionId ?? [...activeRuns.keys()].at(-1)
    if (!target || !activeRuns.has(target)) {
      return { success: false, error: '无活跃执行' }
    }
    const cancelled = engine.cancel(target)
    if (cancelled) activeRuns.delete(target)
    return { success: cancelled }
  })

  // 保存工作流到本地文件
  ipcMain.handle('workflow:save', async (_event, filePath: string, data: WorkflowDefinition) => {
    const fs = await import('fs/promises')
    const path = await import('path')

    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    // 导出是密钥离开应用的单向通道：命中明文即在落盘前替换为占位符
    await fs.writeFile(filePath, JSON.stringify(redactSecrets(data), null, 2), 'utf-8')
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
    // 导出内容与 workflow:save 同等对待：能按 JSON 解析就先脱敏再落盘
    let payload = content
    try {
      payload = JSON.stringify(redactSecrets(JSON.parse(content) as unknown), null, 2)
    } catch {
      /* 非 JSON 内容（如纯文本导出）原样写出 */
    }
    await fs.writeFile(result.filePath, payload, 'utf-8')
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

  // 获取用户数据目录：仅开放确有用途的几种，避免渲染进程借任意 name 探测系统路径
  ipcMain.handle('app:getPath', (_event, name: string) => {
    const allowed: readonly string[] = ALLOWED_APP_PATHS
    if (!allowed.includes(name)) {
      throw new Error(`不支持的路径类型: ${name}`)
    }
    return app.getPath(name as typeof ALLOWED_APP_PATHS[number])
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

  // ===== 项目库 =====

  // 模板列表
  ipcMain.handle('templates:list', () => {
    try {
      return {
        success: true,
        data: workflowTemplates.map(({ id, name, description, icon, category }) => ({ id, name, description, icon, category }))
      }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  // 新建项目（支持模板 / 复制源项目）
  ipcMain.handle('projects:create', (_event, input: CreateProjectInput) => {
    try {
      let workflow: WorkflowDefinition | null = null

      if (input.copyFromId) {
        // 复制已有项目
        const summary = projectStore?.duplicate(input.copyFromId, input.name)
        if (!summary) return { success: false, error: '源项目不存在' }
        const record = projectStore?.get(summary.id)
        if (!record) return { success: false, error: '复制项目失败' }
        workflow = record.workflow
      } else {
        // 模板或空白
        const template = workflowTemplates.find(t => t.id === input.templateId) || workflowTemplates[0]
        workflow = template.build()
        workflow.name = input.name
        workflow.updatedAt = new Date().toISOString()
      }

      const created = projectStore?.create(input, workflow)
      if (!created) return { success: false, error: '创建项目失败' }
      return { success: true, data: created }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 项目列表
  ipcMain.handle('projects:list', () => {
    try {
      return { success: true, data: projectStore?.list() || [] }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  // 项目详情（含完整工作流）
  ipcMain.handle('projects:get', (_event, id: string) => {
    try {
      const record = projectStore?.get(id) || null
      return { success: true, data: record }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  // 保存工作流内容
  ipcMain.handle('projects:saveWorkflow', (_event, id: string, workflow: WorkflowDefinition) => {
    // 写入前拦截明文密钥：它会随 workflow_json 落库并被导出，属于持久化泄露
    const leaked = scanWorkflowSecrets(workflow)
    if (leaked.length) {
      return { success: false, error: plaintextSecretError(leaked) }
    }
    try {
      const ok = projectStore?.saveWorkflow(id, workflow) || false
      return { success: ok, error: ok ? undefined : '项目不存在' }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  // 更新元信息（名称/描述）
  ipcMain.handle('projects:updateMeta', (_event, id: string, meta: { name?: string; description?: string }) => {
    try {
      const ok = projectStore?.updateMeta(id, meta) || false
      return { success: ok, error: ok ? undefined : '项目不存在' }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  // 删除项目
  ipcMain.handle('projects:delete', (_event, id: string) => {
    try {
      const ok = projectStore?.delete(id) || false
      return { success: ok, error: ok ? undefined : '项目不存在' }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  // ===== 模型库 =====

  ipcMain.handle('models:list', () => {
    try {
      return { success: true, data: modelStore?.list() || [] }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('models:create', (_event, input: ModelConfigInput) => {
    try {
      const config = modelStore?.create(input)
      return config ? { success: true, data: config } : { success: false, error: '创建失败' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('models:update', (_event, id: string, input: ModelConfigInput) => {
    try {
      const config = modelStore?.update(id, input)
      return config ? { success: true, data: config } : { success: false, error: '模型不存在' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('models:delete', (_event, id: string) => {
    try {
      const ok = modelStore?.delete(id) || false
      return { success: ok, error: ok ? undefined : '模型不存在' }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('models:setDefault', (_event, id: string) => {
    try {
      const ok = modelStore?.setDefault(id) || false
      return { success: ok, error: ok ? undefined : '模型不存在' }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('models:test', async (_event, id: string, apiKeyOverride?: string) => {
    try {
      const result = await modelStore?.testConnection(id, apiKeyOverride)
      return { success: true, data: result }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ===== 提示词库 =====

  ipcMain.handle('prompts:list', (_event, options?: { keyword?: string; category?: string; favoriteOnly?: boolean }) => {
    try {
      return { success: true, data: promptStore?.list(options) || [] }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('prompts:upsert', (_event, input: PromptTemplateInput) => {
    try {
      const template = promptStore?.upsert(input)
      return template ? { success: true, data: template } : { success: false, error: '保存失败' }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('prompts:delete', (_event, id: string) => {
    try {
      const ok = promptStore?.delete(id) || false
      return { success: ok, error: ok ? undefined : '模板不存在' }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('prompts:toggleFavorite', (_event, id: string) => {
    try {
      const ok = promptStore?.toggleFavorite(id) || false
      return { success: ok, error: ok ? undefined : '模板不存在' }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('prompts:categories', () => {
    try {
      return { success: true, data: promptStore?.categories() || [] }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('prompts:render', (_event, id: string, variables: Record<string, unknown>) => {
    try {
      const result = promptStore?.render(id, variables)
      return { success: true, data: result }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  // ===== 设置 =====

  ipcMain.handle('settings:get', () => {
    try {
      return { success: true, data: settingsStore?.getAll() }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('settings:update', (_event, input: AppSettingsInput) => {
    try {
      const next = settingsStore?.update(input)
      // 超时设置对执行器即时生效，无需重启
      if (next && typeof next.defaultTimeout === 'number') {
        engine.setDefaultTimeout(next.defaultTimeout)
      }
      return { success: true, data: next }
    } catch (err: unknown) {
      return { success: false, error: String(err) }
    }
  })
}

// ===== 应用生命周期 =====

/**
 * 启动期致命错误：中止启动，而不是带着读不开的库继续运行。
 *
 * 原先各 Store 构造失败只 console.error，随后各处 `store?.x() || []` 静默返回空，
 * 于是「数据库损坏」在界面上表现为「你一个项目都没有」——用户极可能就此重建并覆盖数据。
 */
function abortStartup(title: string, detail: unknown, backupHint?: string): never {
  const message = detail instanceof Error ? detail.message : String(detail)
  console.error(`${title}:`, detail)
  try {
    dialog.showMessageBoxSync({
      type: 'error',
      title,
      message: title,
      detail: backupHint ? `${message}\n\n${backupHint}` : message,
      buttons: ['退出']
    })
  } catch { /* 无图形界面时至少留下日志 */ }
  app.quit()
  throw detail
}

app.whenReady().then(() => {
  // 凭证管理器最先建立：迁移需要把明文密钥升格为加密凭证
  try {
    credentialManager = new CredentialManager()
  } catch (err) {
    return abortStartup('无法打开凭证存储', err)
  }

  // 数据迁移必须早于各 Store 打开
  let migrationReport: MigrationReport | null = null
  try {
    const { report, close } = runMigrations(migrations, {
      setCredential: (name, value, displayName) => {
        try {
          credentialManager?.set(name, value, displayName)
          return true
        } catch {
          return false
        }
      },
      credentialExists: name => (credentialManager?.list() ?? []).some(c => c.key === name),
      log: msg => console.log(`[migration] ${msg}`)
    })
    migrationReport = report
    close()
  } catch (err) {
    return abortStartup(
      '数据迁移失败，已阻止启动以保护现有数据',
      err,
      err instanceof MigrationError ? err.backupHint : undefined
    )
  }

  // 各存储：任一打开失败都必须中止启动，不得静默降级为空库
  const inits: Array<[string, () => void]> = [
    ['执行历史存储', () => { executionStorage = new ExecutionStorage() }],
    ['项目库', () => { projectStore = new ProjectStore() }],
    ['模型库', () => { modelStore = new ModelStore() }],
    ['提示词库', () => { promptStore = new PromptStore() }],
    ['设置存储', () => { settingsStore = new SettingsStore() }]
  ]
  for (const [label, init] of inits) {
    try {
      init()
    } catch (err) {
      return abortStartup(`初始化${label}失败`, err)
    }
  }

  // 应用与超时相关的全局设置：设置项此前只落库不被读取，故在此接线
  try {
    const settings = settingsStore?.getAll()
    if (settings?.defaultTimeout) engine.setDefaultTimeout(settings.defaultTimeout)
    executionStorage?.pruneHistory()
  } catch (err) {
    console.error('应用全局设置失败:', err)
  }

  setupIPC()
  setupMenu()
  createWindow()

  // 迁移改写过数据就必须告知，否则用户只会看到"密钥不见了"而无从理解
  if (migrationReport && migrationReport.applied.some(a => a.affected > 0)) {
    const lines = migrationReport.applied
      .filter(a => a.affected > 0)
      .map(a => `· ${a.name}：影响 ${a.affected} 项${a.backupDir ? `（备份：${a.backupDir}）` : ''}`)
    try {
      dialog.showMessageBoxSync({
        type: 'info',
        title: '数据已完成升级',
        message: `本次启动应用了 ${migrationReport.applied.length} 项数据迁移`,
        detail: `${lines.join('\n')}\n\n若迁移把项目中的明文密钥转成了加密凭证，你仍可在「设置 → 安全凭证」中查看与删除它们。`
      })
    } catch { /* 无图形界面时忽略 */ }
  }

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
  projectStore?.close()
  modelStore?.close()
  promptStore?.close()
  settingsStore?.close()
})
