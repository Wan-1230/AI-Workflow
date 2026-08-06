import type { NodeDefinition, NodeContext, NodeExecuteFn } from '@shared/node'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, basename } from 'path'

export const definition: NodeDefinition = {
  id: 'file-io',
  category: 'action',
  displayName: '文件读写',
  description: '读取本地文件内容 / 写入内容到本地文件',
  icon: '📄',
  color: '#22c55e',
  inputs: [
    { name: 'path', label: '文件路径', type: 'string' },
    { name: 'content', label: '写入内容', type: 'string' }
  ],
  outputs: [
    { name: 'content', label: '文件内容', type: 'string' },
    { name: 'fileName', label: '文件名', type: 'string' },
    { name: 'size', label: '字节数', type: 'number' },
    { name: 'encoding', label: '编码', type: 'string' }
  ],
  defaultConfig: {
    mode: 'read',
    path: '',
    content: '',
    encoding: 'utf-8'
  }
}

export const execute: NodeExecuteFn = async (ctx: NodeContext) => {
  const config = ctx.config
  const mode = String(config.mode || 'read')
  const filePath = String(config.path || '')
  const encoding = String(config.encoding || 'utf-8') as BufferEncoding

  if (!filePath.trim()) {
    throw new Error('文件路径为空，请填写 path')
  }

  if (mode === 'read') {
    try {
      const content = await readFile(filePath, { encoding })
      ctx.logger(`读取文件成功: ${basename(filePath)} (${content.length} 字符)`)
      return {
        content,
        fileName: basename(filePath),
        size: Buffer.byteLength(content, encoding),
        encoding,
        path: filePath
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`读取文件失败: ${message}`)
    }
  }

  if (mode === 'write') {
    const content = String(config.content ?? '')
    try {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, content, { encoding })
      ctx.logger(`写入文件成功: ${basename(filePath)} (${content.length} 字符)`)
      return {
        content,
        fileName: basename(filePath),
        size: Buffer.byteLength(content, encoding),
        encoding,
        path: filePath,
        wrote: true
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`写入文件失败: ${message}`)
    }
  }

  throw new Error(`未知的模式: ${mode}（支持 read / write）`)
}
