// ===== 项目（多项目管理）类型 =====

import type { WorkflowDefinition } from './workflow'

/** 项目摘要（列表展示用，不含完整数据） */
export interface ProjectSummary {
  id: string
  name: string
  description: string
  /** 模板标识（由模板创建时记录） */
  template?: string
  /** 节点/边数量（便于列表展示规模） */
  nodeCount: number
  edgeCount: number
  createdAt: string
  updatedAt: string
  /** 最后执行状态（可选） */
  lastStatus?: 'completed' | 'error' | 'cancelled' | null
}

/** 项目完整数据 */
export interface ProjectRecord {
  summary: ProjectSummary
  workflow: WorkflowDefinition
}

/** 可用工作流模板 */
export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  /** 模板封面图标 */
  icon: string
  /** 模板类别：空工作流 / 示例 */
  category: 'blank' | 'example'
  build: () => WorkflowDefinition
}

/** 新建项目参数 */
export interface CreateProjectInput {
  name: string
  description?: string
  /** 基于模板创建时传入模板 id */
  templateId?: string
  /** 复制项目时传入源项目 id */
  copyFromId?: string
}
