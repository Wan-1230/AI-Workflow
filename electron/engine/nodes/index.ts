import type { NodeExecuteFn, RegisteredNode } from '@shared/node'
import { nodeCatalog } from '@shared/node-catalog'

// ---------- 触发器 ----------
import { execute as manualTriggerExec } from './triggers/manual-trigger'

// ---------- 动作 ----------
import { execute as httpRequestExec } from './actions/http-request'
import { execute as codeExecExec } from './actions/code-exec'
import { execute as notificationExec } from './actions/notification'
import { execute as textProcessExec } from './actions/text-process'
import { execute as fileIoExec } from './actions/file-io'

// ---------- 逻辑 ----------
import { execute as conditionExec } from './logic/condition'
import { execute as loopExec } from './logic/loop'
import { execute as loopEndExec } from './logic/loop-end'
import { execute as variableSetExec } from './logic/variable-set'
import { execute as subWorkflowExec } from './logic/sub-workflow'

// ---------- AI ----------
import { execute as llmCallExec } from './ai/llm-call'
import { execute as promptTemplateExec } from './ai/prompt-template'

// ---------- Agent ----------
import { execute as toolCallExec } from './agent/tool-call'
import { execute as agentDelegateExec } from './agent/agent-delegate'

// ---------- RAG ----------
import { execute as ragUploadExec } from './rag/rag-upload'
import { execute as ragRetrieveExec } from './rag/rag-retrieve'

/** 节点实现。元数据一律来自 @shared/node-catalog，此处只登记执行函数。 */
const executors: Record<string, NodeExecuteFn> = {
  'manual-trigger': manualTriggerExec,
  'http-request': httpRequestExec,
  'code-exec': codeExecExec,
  'notification': notificationExec,
  'text-process': textProcessExec,
  'file-io': fileIoExec,
  'condition': conditionExec,
  'loop': loopExec,
  'loop-end': loopEndExec,
  'variable-set': variableSetExec,
  'sub-workflow': subWorkflowExec,
  'llm-call': llmCallExec,
  'prompt-template': promptTemplateExec,
  'tool-call': toolCallExec,
  'agent-delegate': agentDelegateExec,
  'rag-upload': ragUploadExec,
  'rag-retrieve': ragRetrieveExec
}

/**
 * 全局节点注册表 —— 由 catalog 装配。
 *
 * catalog 与 executors 必须严格互相覆盖：任一侧多出条目都属于配置漂移，
 * 在启动期直接失败，而不是等到用户点击某个节点时才暴露。
 */
export const nodeRegistry = new Map<string, RegisteredNode>()

for (const [id, definition] of Object.entries(nodeCatalog)) {
  const execute = executors[id]
  if (!execute) {
    throw new Error(`节点目录声明了 "${id}" 但缺少 execute 实现（electron/engine/nodes/index.ts）`)
  }
  nodeRegistry.set(id, { definition, execute })
}

for (const id of Object.keys(executors)) {
  if (!nodeCatalog[id]) {
    throw new Error(`节点实现 "${id}" 未登记进节点目录（packages/shared/src/node-catalog.ts）`)
  }
}
