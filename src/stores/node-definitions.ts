// 前端节点定义（与后端 nodeRegistry 一一对应，供节点面板/画布/配置面板使用）
// icon 使用 emoji，与后端 NodeDefinition.icon 保持一致

export type NodeCategory = 'trigger' | 'action' | 'logic' | 'ai' | 'agent' | 'rag'

/** 配置字段 schema（驱动 NodeConfig 面板渲染） */
export interface UIFieldSchema {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'json'
  help?: string
  placeholder?: string
  options?: { value: string; label: string }[]
  rows?: number
}

/** 节点输出字段（供配置面板变量引用提示） */
export interface UIOutputField {
  name: string
  label: string
  type: string
}

export interface UINodeDefinition {
  type: string
  displayName: string
  description: string
  category: NodeCategory
  color: string
  icon: string
  defaultConfig: Record<string, unknown>
  /** 配置面板字段顺序与类型 */
  fields: UIFieldSchema[]
  /** 执行后产生的输出（与后端 execute 返回一致） */
  outputs: UIOutputField[]
}

// ===== 运算符中文映射 =====
export const operatorLabels: Record<string, string> = {
  equals: '等于 (==)',
  not_equals: '不等于 (!=)',
  contains: '包含',
  greater: '大于 (>)',
  less: '小于 (<)',
  greater_or_equal: '大于等于 (>=)',
  less_or_equal: '小于等于 (<=)',
  is_empty: '为空',
  is_not_empty: '不为空',
}

export const nodeDefinitions: Record<string, UINodeDefinition> = {
  // ===== 触发器 =====
  'manual-trigger': {
    type: 'manual-trigger',
    displayName: '手动触发',
    description: '点击运行按钮启动工作流',
    category: 'trigger',
    color: '#5b9cf5',
    icon: '⚡',
    defaultConfig: {},
    fields: [],
    outputs: [{ name: 'triggered', label: '触发时间', type: 'string' }]
  },

  // ===== 动作 =====
  'http-request': {
    type: 'http-request',
    displayName: 'HTTP 请求',
    description: '发送 HTTP 请求（GET / POST / PUT / DELETE）',
    category: 'action',
    color: '#4cc38a',
    icon: '🌐',
    defaultConfig: {
      url: 'https://api.github.com/zen',
      method: 'GET',
      headers: '{}',
      body: ''
    },
    fields: [
      { key: 'url', label: '请求地址', type: 'text', placeholder: 'https://...' },
      { key: 'method', label: '请求方法', type: 'select', options: [
        { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' }, { value: 'DELETE', label: 'DELETE' }
      ] },
      { key: 'headers', label: '请求头 (JSON)', type: 'json', help: '如 {"Authorization": "Bearer xxx"}' },
      { key: 'body', label: '请求体', type: 'textarea', rows: 3, help: 'POST/PUT 时使用' }
    ],
    outputs: [
      { name: 'status', label: 'HTTP 状态码', type: 'number' },
      { name: 'data', label: '响应体', type: 'any' },
      { name: 'headers', label: '响应头', type: 'object' }
    ]
  },
  'code-exec': {
    type: 'code-exec',
    displayName: '代码执行',
    description: '在沙箱中执行 JavaScript，输入在 input 变量，用 return 返回',
    category: 'action',
    color: '#4cc38a',
    icon: '💻',
    defaultConfig: {
      code: '// 输入数据在 input 变量中\n// 用 return 返回结果\nconst result = input;\nreturn { result };'
    },
    fields: [
      { key: 'code', label: '执行代码', type: 'textarea', rows: 12, help: 'input 为上游数据，return 对象作为输出' }
    ],
    outputs: [
      { name: 'result', label: 'return 结果', type: 'any' },
      { name: 'logs', label: '运行日志', type: 'string[]' }
    ]
  },
  'notification': {
    type: 'notification',
    displayName: '通知输出',
    description: '在工作流日志中输出通知消息',
    category: 'action',
    color: '#4cc38a',
    icon: '🔔',
    defaultConfig: {
      message: '工作流执行完成！',
      level: 'info'
    },
    fields: [
      { key: 'message', label: '通知内容', type: 'textarea', rows: 3, help: '支持 {{nodeId.field}} 插值' },
      { key: 'level', label: '日志级别', type: 'select', options: [
        { value: 'info', label: '信息' }, { value: 'warning', label: '警告' }, { value: 'error', label: '错误' }
      ] }
    ],
    outputs: [
      { name: 'sent', label: '是否发送', type: 'boolean' },
      { name: 'message', label: '消息内容', type: 'string' }
    ]
  },
  'text-process': {
    type: 'text-process',
    displayName: '文本处理',
    description: '替换/拆分/切片/正则等文本操作',
    category: 'action',
    color: '#4cc38a',
    icon: '✂️',
    defaultConfig: {
      text: '',
      operation: 'trim',
      search: '',
      replacement: '',
      separator: ',',
      start: 0,
      end: 100,
      uppercase: false
    },
    fields: [
      { key: 'text', label: '输入文本', type: 'textarea', rows: 4, help: '支持 {{nodeId.field}} 插值' },
      { key: 'operation', label: '操作', type: 'select', options: [
        { value: 'trim', label: '去除首尾空白' }, { value: 'replace', label: '替换' },
        { value: 'split', label: '按分隔符拆分' }, { value: 'slice', label: '截取片段' },
        { value: 'join', label: '数组转文本' }, { value: 'regex', label: '正则提取' }
      ] },
      { key: 'search', label: '查找内容', type: 'text', help: 'replace / regex 操作使用' },
      { key: 'replacement', label: '替换为', type: 'text', help: 'replace 操作使用' },
      { key: 'separator', label: '分隔符', type: 'text', help: 'split / join 操作使用，默认逗号' },
      { key: 'start', label: '起始位置', type: 'number', help: 'slice 操作使用' },
      { key: 'end', label: '结束位置', type: 'number', help: 'slice 操作使用' },
      { key: 'uppercase', label: '转大写', type: 'boolean' }
    ],
    outputs: [
      { name: 'text', label: '处理结果', type: 'string' },
      { name: 'parts', label: '拆分结果', type: 'any[]' },
      { name: 'length', label: '长度', type: 'number' }
    ]
  },
  'file-io': {
    type: 'file-io',
    displayName: '文件读写',
    description: '读取或写入本地文件',
    category: 'action',
    color: '#4cc38a',
    icon: '📄',
    defaultConfig: {
      mode: 'read',
      path: '',
      content: '',
      encoding: 'utf-8'
    },
    fields: [
      { key: 'mode', label: '模式', type: 'select', options: [
        { value: 'read', label: '读取文件' }, { value: 'write', label: '写入文件' }
      ] },
      { key: 'path', label: '文件路径', type: 'text', placeholder: 'C:/data/input.txt', help: '支持 {{env.VAR}} 环境变量' },
      { key: 'content', label: '写入内容', type: 'textarea', rows: 5, help: 'write 模式使用' },
      { key: 'encoding', label: '编码', type: 'select', options: [
        { value: 'utf-8', label: 'UTF-8' }, { value: 'base64', label: 'Base64' }
      ] }
    ],
    outputs: [
      { name: 'content', label: '文件内容', type: 'string' },
      { name: 'fileName', label: '文件名', type: 'string' },
      { name: 'size', label: '大小 (字节)', type: 'number' },
      { name: 'encoding', label: '编码', type: 'string' }
    ]
  },

  // ===== 逻辑 =====
  'condition': {
    type: 'condition',
    displayName: '条件分支',
    description: '根据条件判断路由到不同分支（True/False）',
    category: 'logic',
    color: '#d4a83c',
    icon: '🔀',
    defaultConfig: {
      left: '{{input}}',
      right: '',
      operator: 'equals'
    },
    fields: [
      { key: 'left', label: '左值', type: 'text', help: '支持 {{nodeId.field}} 插值' },
      { key: 'operator', label: '运算符', type: 'select', options: Object.entries(operatorLabels).map(([value, label]) => ({ value, label })) },
      { key: 'right', label: '右值', type: 'text', help: 'is_empty / is_not_empty 时忽略' }
    ],
    outputs: [
      { name: 'result', label: '判断结果', type: 'boolean' },
      { name: 'branch', label: '命中的分支', type: 'string' }
    ]
  },
  'loop': {
    type: 'loop',
    displayName: '循环',
    description: '对数组逐项渲染模板，输出结果数组',
    category: 'logic',
    color: '#d4a83c',
    icon: '🔁',
    defaultConfig: {
      itemsSource: '{{input}}',
      items: '[]',
      template: '第 {{index}} 项: {{item}}',
      mode: 'template'
    },
    fields: [
      { key: 'itemsSource', label: '数组来源', type: 'text', help: '上游节点输出引用，解析后须为数组，如 {{http.data.items}}' },
      { key: 'items', label: '或直接填数组 (JSON)', type: 'json' },
      { key: 'template', label: '每项模板', type: 'textarea', rows: 4, help: '支持 {{item}} / {{item.field}} / {{index}} / {{count}}' },
      { key: 'mode', label: '处理方式', type: 'select', options: [{ value: 'template', label: '模板渲染' }] }
    ],
    outputs: [
      { name: 'results', label: '逐项结果数组', type: 'any[]' },
      { name: 'count', label: '循环次数', type: 'number' },
      { name: 'items', label: '原始数组', type: 'any[]' }
    ]
  },
  'variable-set': {
    type: 'variable-set',
    displayName: '变量设置',
    description: '写入全局变量，后续节点用 {{global.KEY}} 引用',
    category: 'logic',
    color: '#d4a83c',
    icon: '📌',
    defaultConfig: {
      key: 'myVar',
      value: ''
    },
    fields: [
      { key: 'key', label: '变量名', type: 'text', placeholder: 'myVar', help: '后续用 {{global.myVar}} 引用' },
      { key: 'value', label: '变量值', type: 'textarea', rows: 3, help: '支持 {{nodeId.field}} 插值' }
    ],
    outputs: [
      { name: 'key', label: '变量名', type: 'string' },
      { name: 'value', label: '写入后的值', type: 'string' }
    ]
  },
  'sub-workflow': {
    type: 'sub-workflow',
    displayName: '子工作流',
    description: '嵌套执行内嵌的子工作流 JSON',
    category: 'logic',
    color: '#d4a83c',
    icon: '📂',
    defaultConfig: {
      workflowJson: '{}',
      input: ''
    },
    fields: [
      { key: 'workflowJson', label: '子工作流 JSON', type: 'textarea', rows: 12, help: '粘贴完整工作流 JSON（与导出格式一致）' },
      { key: 'input', label: '输入数据', type: 'text', help: '可选，子流程内可用 {{global.sub_input}} 引用' }
    ],
    outputs: [
      { name: 'results', label: '子流程各节点结果', type: 'object' },
      { name: 'status', label: '执行状态', type: 'string' }
    ]
  },

  // ===== AI =====
  'llm-call': {
    type: 'llm-call',
    displayName: 'LLM 调用',
    description: '调用大模型（OpenAI 兼容接口，支持流式输出）',
    category: 'ai',
    color: '#8b5cf6',
    icon: '🤖',
    defaultConfig: {
      modelId: '',
      systemPrompt: '你是一个有用的AI助手。',
      userPrompt: '你好！',
      temperature: 0.7,
      maxTokens: 2048,
      stream: true
    },
    fields: [
      { key: 'modelId', label: '模型配置', type: 'select', help: '留空 = 使用默认模型（需先在「模型配置」页添加）' },
      { key: 'systemPrompt', label: '系统提示词', type: 'textarea', rows: 3 },
      { key: 'userPrompt', label: '用户提示词', type: 'textarea', rows: 5, help: '支持 {{nodeId.field}} / {{global.KEY}} 插值' },
      { key: 'temperature', label: '温度', type: 'number', help: '0~2，越高越随机' },
      { key: 'maxTokens', label: '最大 Token', type: 'number' },
      { key: 'stream', label: '流式输出', type: 'boolean', help: '开启后在运行面板实时显示输出' }
    ],
    outputs: [
      { name: 'text', label: '模型回复', type: 'string' },
      { name: 'model', label: '使用的模型', type: 'string' },
      { name: 'usage', label: 'Token 用量', type: 'object' },
      { name: 'duration', label: '耗时 (ms)', type: 'number' }
    ]
  },
  'prompt-template': {
    type: 'prompt-template',
    displayName: '提示词模板',
    description: '渲染模板并输出文本，可用于拼装复杂提示词',
    category: 'ai',
    color: '#8b5cf6',
    icon: '📝',
    defaultConfig: {
      template: '请帮我总结以下内容：\n{{input.text}}',
      variables: '{}'
    },
    fields: [
      { key: 'template', label: '模板内容', type: 'textarea', rows: 8, help: '{{varName}} 占位符；配置 variables 或上游输出可自动填充' },
      { key: 'variables', label: '变量映射 (JSON)', type: 'json', help: '如 {"varName": "{{nodeId.field}}"}' }
    ],
    outputs: [
      { name: 'text', label: '渲染结果', type: 'string' },
      { name: 'variables', label: '填充的变量', type: 'object' },
      { name: 'missing', label: '缺失的变量', type: 'string[]' }
    ]
  },

  // ===== Agent =====
  'tool-call': {
    type: 'tool-call',
    displayName: '工具调用',
    description: '调用内置工具或 MCP 服务器工具',
    category: 'agent',
    color: '#e85d5d',
    icon: '🛠️',
    defaultConfig: {
      toolType: 'builtin',
      toolName: 'http-get',
      arguments: '{"url": "https://api.github.com/zen"}',
      mcpCommand: 'npx',
      mcpArgs: '-y @modelcontextprotocol/server-everything',
      mcpUrl: '',
      timeoutMs: 30000
    },
    fields: [
      { key: 'toolType', label: '工具来源', type: 'select', options: [
        { value: 'builtin', label: '内置工具' }, { value: 'mcp', label: 'MCP 服务器' }
      ] },
      { key: 'toolName', label: '内置工具', type: 'select', options: [
        { value: 'http-get', label: 'HTTP GET' }, { value: 'http-post', label: 'HTTP POST' },
        { value: 'now', label: '当前时间' }, { value: 'math', label: '数学计算' }, { value: 'uuid', label: '生成 UUID' }
      ] },
      { key: 'arguments', label: '参数 (JSON)', type: 'json', help: 'http-get: {"url": "..."}；math: {"expression": "1+2*3"}' },
      { key: 'mcpCommand', label: 'MCP 启动命令', type: 'text', help: '如 npx / node' },
      { key: 'mcpArgs', label: 'MCP 启动参数', type: 'text', help: '如 -y @modelcontextprotocol/server-everything' },
      { key: 'mcpUrl', label: '或 MCP SSE 地址', type: 'text', placeholder: 'http://localhost:3001/sse' },
      { key: 'timeoutMs', label: '超时 (ms)', type: 'number' }
    ],
    outputs: [
      { name: 'result', label: '工具返回结果', type: 'any' },
      { name: 'tool', label: '使用的工具', type: 'string' },
      { name: 'duration', label: '耗时 (ms)', type: 'number' }
    ]
  },
  'agent-delegate': {
    type: 'agent-delegate',
    displayName: '子 Agent 委派',
    description: '以指定角色委派 LLM 完成子任务',
    category: 'agent',
    color: '#e85d5d',
    icon: '🧠',
    defaultConfig: {
      task: '请分析以下数据并给出结论',
      contextData: '',
      role: '你是一名专业的分析助手，请基于提供的上下文完成任务。',
      modelId: '',
      temperature: 0.3,
      maxTokens: 2048
    },
    fields: [
      { key: 'role', label: '角色提示词', type: 'textarea', rows: 3 },
      { key: 'task', label: '任务描述', type: 'textarea', rows: 4 },
      { key: 'contextData', label: '上下文数据', type: 'textarea', rows: 4, help: '支持 {{nodeId.field}} 插值' },
      { key: 'modelId', label: '模型配置', type: 'select', help: '留空 = 使用默认模型' },
      { key: 'temperature', label: '温度', type: 'number' },
      { key: 'maxTokens', label: '最大 Token', type: 'number' }
    ],
    outputs: [
      { name: 'response', label: 'Agent 回复', type: 'string' },
      { name: 'task', label: '任务描述', type: 'string' },
      { name: 'duration', label: '耗时 (ms)', type: 'number' }
    ]
  },

  // ===== RAG =====
  'rag-upload': {
    type: 'rag-upload',
    displayName: '文档入库',
    description: '文本/文件切分向量化，写入本地向量库',
    category: 'rag',
    color: '#06b6d4',
    icon: '📚',
    defaultConfig: {
      source: 'text',
      text: '',
      filePath: '',
      docId: '',
      chunkSize: 500,
      overlap: 80
    },
    fields: [
      { key: 'source', label: '内容来源', type: 'select', options: [
        { value: 'text', label: '直接输入文本' }, { value: 'file', label: '读取本地文件' }
      ] },
      { key: 'text', label: '文本内容', type: 'textarea', rows: 8 },
      { key: 'filePath', label: '文件路径', type: 'text', help: 'source=file 时使用，UTF-8 编码' },
      { key: 'docId', label: '文档 ID', type: 'text', placeholder: '留空自动生成' },
      { key: 'chunkSize', label: '分块大小 (字符)', type: 'number' },
      { key: 'overlap', label: '重叠 (字符)', type: 'number', help: '相邻分块重叠，提升检索连续性' }
    ],
    outputs: [
      { name: 'docId', label: '文档 ID', type: 'string' },
      { name: 'chunkCount', label: '分块数', type: 'number' },
      { name: 'chunks', label: '分块列表', type: 'object[]' },
      { name: 'totalSize', label: '总字符数', type: 'number' }
    ]
  },
  'rag-retrieve': {
    type: 'rag-retrieve',
    displayName: '向量检索',
    description: '按语义相似度从向量库检索相关内容',
    category: 'rag',
    color: '#06b6d4',
    icon: '🎯',
    defaultConfig: {
      query: '',
      topK: 5,
      minScore: 0.05
    },
    fields: [
      { key: 'query', label: '检索问题', type: 'textarea', rows: 3, help: '支持 {{nodeId.field}} 插值' },
      { key: 'topK', label: '返回条数', type: 'number' },
      { key: 'minScore', label: '最低相似度', type: 'number', help: '0~1，过滤低相关片段' }
    ],
    outputs: [
      { name: 'results', label: '检索结果数组', type: 'object[]' },
      { name: 'topText', label: '最相关片段文本', type: 'string' },
      { name: 'combined', label: '合并后的上下文', type: 'string' },
      { name: 'count', label: '返回条数', type: 'number' }
    ]
  }
}

// ===== 分类组织（供节点面板渲染） =====
export const nodeCategories: { category: NodeCategory; label: string; color: string; nodes: UINodeDefinition[] }[] = [
  { category: 'trigger', label: '触发器', color: '#5b9cf5', nodes: [] },
  { category: 'action', label: '动作', color: '#4cc38a', nodes: [] },
  { category: 'logic', label: '逻辑', color: '#d4a83c', nodes: [] },
  { category: 'ai', label: 'AI 节点', color: '#8b5cf6', nodes: [] },
  { category: 'agent', label: 'Agent', color: '#e85d5d', nodes: [] },
  { category: 'rag', label: 'RAG', color: '#06b6d4', nodes: [] }
]

for (const def of Object.values(nodeDefinitions)) {
  const cat = nodeCategories.find(c => c.category === def.category)
  if (cat) cat.nodes.push(def)
}
