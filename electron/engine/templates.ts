import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from '@shared/workflow'
import type { WorkflowTemplate } from '@shared/project'

/** 生成唯一节点 id */
function nid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** 构建基础工作流骨架 */
function baseWorkflow(name: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowDefinition {
  const now = new Date().toISOString()
  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    nodes,
    edges,
    variables: [],
    createdAt: now,
    updatedAt: now
  }
}

/** 空工作流：仅手动触发器 */
function buildBlank(): WorkflowDefinition {
  const trigger = nid('trigger')
  return baseWorkflow('未命名工作流', [
    {
      id: trigger,
      type: 'manual-trigger',
      label: '手动触发',
      position: { x: 120, y: 240 },
      config: {}
    }
  ], [])
}

/** 示例：LLM 对话助手（手动触发 → LLM 调用） */
function buildLlmChat(): WorkflowDefinition {
  const trigger = nid('trigger')
  const llm = nid('llm')
  return baseWorkflow('LLM 对话助手', [
    {
      id: trigger,
      type: 'manual-trigger',
      label: '手动触发',
      position: { x: 120, y: 240 },
      config: {}
    },
    {
      id: llm,
      type: 'llm-call',
      label: 'LLM 调用',
      position: { x: 420, y: 240 },
      config: {
        modelId: '', // 留空 = 使用模型库默认模型
        systemPrompt: '你是一个乐于助人的 AI 助手，回答要简洁准确。',
        userPrompt: '你好！请用一句话介绍你自己。',
        temperature: 0.7,
        maxTokens: 2048,
        stream: true
      }
    }
  ], [
    { id: `${trigger}_e_${llm}`, source: trigger, target: llm }
  ])
}

/** 示例：RAG 知识问答（文档入库 → 向量检索 → LLM 生成） */
function buildRagQA(): WorkflowDefinition {
  const trigger = nid('trigger')
  const ask = nid('ask')
  const upload = nid('upload')
  const retrieve = nid('retrieve')
  const llm = nid('llm')
  return baseWorkflow('RAG 知识问答', [
    {
      id: trigger,
      type: 'manual-trigger',
      label: '手动触发',
      position: { x: 80, y: 240 },
      config: {}
    },
    {
      id: ask,
      type: 'variable-set',
      label: '待答问题',
      position: { x: 80, y: 80 },
      config: { key: 'rag_question', value: '什么是 AI Agent？' }
    },
    {
      id: upload,
      type: 'rag-upload',
      label: '文档入库',
      position: { x: 360, y: 120 },
      config: {
        source: 'text',
        text: 'AI Agent 是一种能够自主感知环境、做出决策并执行动作的智能体。' +
          '它通常由大语言模型驱动，具备工具调用、记忆管理和任务规划能力。' +
          '工作流引擎将多个节点编排为有向无环图，按拓扑顺序依次执行。',
        chunkSize: 500,
        overlap: 80
      }
    },
    {
      id: retrieve,
      type: 'rag-retrieve',
      label: '向量检索',
      position: { x: 640, y: 120 },
      config: {
        query: '{{global.rag_question}}',
        topK: 3,
        minScore: 0.05
      }
    },
    {
      id: llm,
      type: 'llm-call',
      label: 'LLM 生成回答',
      position: { x: 920, y: 240 },
      config: {
        modelId: '',
        systemPrompt: '你是知识库问答助手。请严格依据提供的上下文回答，上下文不足时如实说明。',
        // 引用必须使用节点的真实 id：曾写作 {{retrieve.combined}}，
        // 而 id 带随机后缀，插值解析不到便原样送入提示词
        userPrompt: `根据以下检索到的知识片段回答问题：\n\n【知识片段】\n{{${retrieve}.combined}}\n\n问题：{{global.rag_question}}`,
        temperature: 0.3,
        maxTokens: 1024,
        stream: true
      }
    }
  ], [
    { id: `${trigger}_e_${ask}`, source: trigger, target: ask },
    { id: `${ask}_e_${upload}`, source: ask, target: upload },
    { id: `${upload}_e_${retrieve}`, source: upload, target: retrieve },
    { id: `${retrieve}_e_${llm}`, source: retrieve, target: llm }
  ])
}

/** 示例：文本处理流水线（取样例文本 → LLM 摘要 → 文本处理 → 文件保存） */
function buildTextPipeline(): WorkflowDefinition {
  const trigger = nid('trigger')
  const sample = nid('sample')
  const llm = nid('llm')
  const process = nid('process')
  const save = nid('save')
  return baseWorkflow('文本摘要流水线', [
    {
      id: trigger,
      type: 'manual-trigger',
      label: '手动触发',
      position: { x: 60, y: 240 },
      config: {}
    },
    {
      id: sample,
      type: 'variable-set',
      label: '样例文本',
      position: { x: 60, y: 80 },
      config: {
        key: 'article',
        value: 'Qoder 是一款面向开发者的智能编程助手。它把需求拆解、代码生成、终端执行与结果验证'
          + '串成一条可追溯的工作流。相比补全式的交互，它会更早地暴露假设与权衡，'
          + '因此在改动面较大的任务上更容易被审阅与纠正。'
      }
    },
    {
      id: llm,
      type: 'llm-call',
      label: 'LLM 摘要',
      position: { x: 340, y: 240 },
      config: {
        modelId: '',
        systemPrompt: '你是文本摘要专家。',
        // 曾引用 {{trigger.text}}：manual-trigger 并没有 text 输出，且 id 带随机后缀，
        // 该模板因此从未真正拿到待摘要文本
        userPrompt: '请将以下文本压缩为 3 句话以内的摘要：\n\n{{global.article}}',
        temperature: 0.4,
        maxTokens: 512,
        stream: false
      }
    },
    {
      id: process,
      type: 'text-process',
      label: '清理格式',
      position: { x: 620, y: 240 },
      config: {
        text: `{{${llm}.text}}`,
        operation: 'trim',
        uppercase: false,
        lowercase: false
      }
    },
    {
      id: save,
      type: 'file-io',
      label: '保存文件',
      position: { x: 900, y: 240 },
      config: {
        mode: 'write',
        // 目录声明的字段名是 path，曾误写成 filePath 导致路径配置不生效
        path: '{{env.USERPROFILE}}/Desktop/summary.txt',
        content: `摘要结果：\n{{${process}.text}}`,
        encoding: 'utf-8'
      }
    }
  ], [
    { id: `${trigger}_e_${sample}`, source: trigger, target: sample },
    { id: `${sample}_e_${llm}`, source: sample, target: llm },
    { id: `${llm}_e_${process}`, source: llm, target: process },
    { id: `${process}_e_${save}`, source: process, target: save }
  ])
}

/** 全部可用模板（注册顺序即展示顺序） */
export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: 'blank',
    name: '空白工作流',
    description: '从零开始搭建，仅包含一个手动触发节点',
    icon: '🆕',
    category: 'blank',
    build: buildBlank
  },
  {
    id: 'example-llm-chat',
    name: 'LLM 对话助手',
    description: '手动触发 → LLM 调用，体验流式输出',
    icon: '💬',
    category: 'example',
    build: buildLlmChat
  },
  {
    id: 'example-rag-qa',
    name: 'RAG 知识问答',
    description: '文档入库 → 向量检索 → LLM 生成回答',
    icon: '📚',
    category: 'example',
    build: buildRagQA
  },
  {
    id: 'example-text-pipeline',
    name: '文本摘要流水线',
    description: 'LLM 摘要 → 文本处理 → 保存文件',
    icon: '📝',
    category: 'example',
    build: buildTextPipeline
  }
]
