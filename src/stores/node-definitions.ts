// 前端节点定义（与后端 nodeRegistry 对应，供 UI 面板使用）
// Lucide 图标名在组件中动态导入

export interface UINodeDefinition {
  type: string
  displayName: string
  description: string
  category: 'trigger' | 'action' | 'logic' | 'ai' | 'agent'
  color: string
  icon: string          // Lucide 图标名，如 'play', 'globe', 'code-2'
  defaultConfig: Record<string, unknown>
}

// ===== 配置字段中文映射（按节点类型） =====
export const configLabels: Record<string, Record<string, string>> = {
  'manual-trigger': {},
  'http-request': {
    url: '请求地址',
    method: '请求方法',
    headers: '请求头',
    body: '请求体',
  },
  'code-exec': {
    code: '执行代码',
  },
  'condition': {
    left: '左值',
    right: '右值',
    operator: '运算符',
  },
  'notification': {
    message: '通知内容',
    level: '日志级别',
  },
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
  'manual-trigger': {
    type: 'manual-trigger',
    displayName: '手动触发',
    description: '点击运行按钮启动工作流',
    category: 'trigger',
    color: '#6b9df2',
    icon: 'play',
    defaultConfig: {}
  },
  'http-request': {
    type: 'http-request',
    displayName: 'HTTP 请求',
    description: '发送 HTTP 请求（GET / POST / PUT / DELETE）',
    category: 'action',
    color: '#4cc38a',
    icon: 'globe',
    defaultConfig: {
      url: 'https://api.github.com/zen',
      method: 'GET',
      headers: '{}',
      body: ''
    }
  },
  'code-exec': {
    type: 'code-exec',
    displayName: '代码执行',
    description: '在安全沙箱中执行 JavaScript 代码',
    category: 'action',
    color: '#4cc38a',
    icon: 'code-2',
    defaultConfig: {
      code: '// 输入数据在 input 变量中\n// 使用 return 返回结果\nconst result = JSON.stringify(input, null, 2);\nreturn { result };'
    }
  },
  'condition': {
    type: 'condition',
    displayName: '条件分支',
    description: '根据条件判断选择不同执行路径',
    category: 'logic',
    color: '#d4a83c',
    icon: 'git-branch',
    defaultConfig: {
      left: '',
      right: '',
      operator: 'equals'
    }
  },
  'notification': {
    type: 'notification',
    displayName: '通知输出',
    description: '在工作流日志中输出通知消息',
    category: 'action',
    color: '#4cc38a',
    icon: 'bell',
    defaultConfig: {
      message: '工作流执行完成！',
      level: 'info'
    }
  }
}

// 按分类组织节点（从颜色中提取色条，不再用 emoji）
export const nodeCategories: { category: string; label: string; color: string; nodes: UINodeDefinition[] }[] = [
  { category: 'trigger', label: '触发器', color: '#6b9df2', nodes: [] },
  { category: 'action',   label: '动作',   color: '#4db87a', nodes: [] },
  { category: 'logic',    label: '逻辑',   color: '#d4a83c', nodes: [] },
  { category: 'ai',       label: 'AI 节点', color: '#9b7cf0', nodes: [] },
  { category: 'agent',    label: 'Agent 节点', color: '#e85d5d', nodes: [] },
]

for (const def of Object.values(nodeDefinitions)) {
  const cat = nodeCategories.find(c => c.category === def.category)
  if (cat) cat.nodes.push(def)
}
