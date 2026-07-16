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
