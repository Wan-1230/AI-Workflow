import type { RegisteredNode } from '@shared/node'

// 全局节点注册表
export const nodeRegistry = new Map<string, RegisteredNode>()

// ---------- 手动触发器 ----------
import { definition as manualTriggerDef, execute as manualTriggerExec } from './triggers/manual-trigger'
nodeRegistry.set('manual-trigger', { definition: manualTriggerDef, execute: manualTriggerExec })

// ---------- HTTP 请求 ----------
import { definition as httpRequestDef, execute as httpRequestExec } from './actions/http-request'
nodeRegistry.set('http-request', { definition: httpRequestDef, execute: httpRequestExec })

// ---------- 代码执行 ----------
import { definition as codeExecDef, execute as codeExecExec } from './actions/code-exec'
nodeRegistry.set('code-exec', { definition: codeExecDef, execute: codeExecExec })

// ---------- 条件分支 ----------
import { definition as conditionDef, execute as conditionExec } from './logic/condition'
nodeRegistry.set('condition', { definition: conditionDef, execute: conditionExec })

// ---------- 通知 ----------
import { definition as notificationDef, execute as notificationExec } from './actions/notification'
nodeRegistry.set('notification', { definition: notificationDef, execute: notificationExec })

// ---------- LLM 调用 ----------
import { definition as llmCallDef, execute as llmCallExec } from './ai/llm-call'
nodeRegistry.set('llm-call', { definition: llmCallDef, execute: llmCallExec })

// ---------- 提示词模板 ----------
import { definition as promptTemplateDef, execute as promptTemplateExec } from './ai/prompt-template'
nodeRegistry.set('prompt-template', { definition: promptTemplateDef, execute: promptTemplateExec })

// ---------- 文本处理 ----------
import { definition as textProcessDef, execute as textProcessExec } from './actions/text-process'
nodeRegistry.set('text-process', { definition: textProcessDef, execute: textProcessExec })

// ---------- 文件读写 ----------
import { definition as fileIoDef, execute as fileIoExec } from './actions/file-io'
nodeRegistry.set('file-io', { definition: fileIoDef, execute: fileIoExec })

// ---------- 变量设置 ----------
import { definition as variableSetDef, execute as variableSetExec } from './logic/variable-set'
nodeRegistry.set('variable-set', { definition: variableSetDef, execute: variableSetExec })

// ---------- 循环 ----------
import { definition as loopDef, execute as loopExec } from './logic/loop'
nodeRegistry.set('loop', { definition: loopDef, execute: loopExec })

// ---------- 子工作流（实际递归执行由引擎处理） ----------
import { definition as subWorkflowDef, execute as subWorkflowExec } from './logic/sub-workflow'
nodeRegistry.set('sub-workflow', { definition: subWorkflowDef, execute: subWorkflowExec })

// ---------- 工具调用 ----------
import { definition as toolCallDef, execute as toolCallExec } from './agent/tool-call'
nodeRegistry.set('tool-call', { definition: toolCallDef, execute: toolCallExec })

// ---------- 子 Agent 委派 ----------
import { definition as agentDelegateDef, execute as agentDelegateExec } from './agent/agent-delegate'
nodeRegistry.set('agent-delegate', { definition: agentDelegateDef, execute: agentDelegateExec })

// ---------- 文档入库 ----------
import { definition as ragUploadDef, execute as ragUploadExec } from './rag/rag-upload'
nodeRegistry.set('rag-upload', { definition: ragUploadDef, execute: ragUploadExec })

// ---------- 向量检索 ----------
import { definition as ragRetrieveDef, execute as ragRetrieveExec } from './rag/rag-retrieve'
nodeRegistry.set('rag-retrieve', { definition: ragRetrieveDef, execute: ragRetrieveExec })
