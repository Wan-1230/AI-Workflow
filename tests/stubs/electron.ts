/**
 * 纯 Node 测试环境下替代 `electron` 的最小桩。
 * 只提供引擎与存储层实际用到的表面，其余成员被访问时显式失败，
 * 避免测试在缺失能力时静默走偏。
 */
const notImplemented = (name: string) => () => {
  throw new Error(`electron stub: ${name} 未在测试环境中实现`)
}

const userDataPath = process.env.TEST_USER_DATA_DIR || process.cwd()

export const app = {
  getPath: (name: string) => (name === 'userData' ? userDataPath : userDataPath),
  getName: () => 'ai-workflow-test',
  getAppPath: () => process.cwd(),
  getVersion: () => '0.0.0-test',
  whenReady: () => Promise.resolve(),
  on: notImplemented('app.on'),
  quit: notImplemented('app.quit')
}

/**
 * safeStorage 桩：base64 模拟加解密。
 * 选 base64 而非可读前缀，是为了让「密文中不得出现明文」这一类断言真实成立——
 * 若桩本身把明文摊在密文里，密钥链路测试会通过却毫无意义。
 */
export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`v1:${Buffer.from(value, 'utf-8').toString('base64')}`, 'utf-8'),
  decryptString: (buf: Buffer) => {
    const text = buf.toString('utf-8')
    if (!text.startsWith('v1:')) throw new Error('stub decrypt: 非法密文')
    return Buffer.from(text.slice(3), 'base64').toString('utf-8')
  }
}

export const BrowserWindow = class {
  static getAllWindows = () => []
}

export const ipcMain = {
  handle: notImplemented('ipcMain.handle'),
  on: notImplemented('ipcMain.on')
}

export const dialog = {
  showMessageBox: () => Promise.resolve({ response: 0 }),
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
  showSaveDialog: () => Promise.resolve({ canceled: true, filePath: '' })
}

export const Menu = {
  setApplicationMenu: () => undefined,
  buildFromTemplate: () => ({})
}

export const shell = { openExternal: notImplemented('shell.openExternal') }

export default { app, safeStorage, BrowserWindow, ipcMain, dialog, Menu, shell }
