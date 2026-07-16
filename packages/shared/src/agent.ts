// ===== Agent 系统类型 =====

export interface AgentConfig {
  model: string
  maxSteps: number
  systemPrompt: string
  temperature?: number
}

export interface AgentStep {
  stepNumber: number
  thought: string
  action?: string
  actionInput?: Record<string, unknown>
  observation?: string
  result?: string
}

export interface AgentRunState {
  id: string
  goal: string
  status: 'thinking' | 'acting' | 'observing' | 'finished' | 'error'
  steps: AgentStep[]
  finalOutput?: string
  error?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export type AgentRole = 'planner' | 'executor' | 'reviewer' | 'custom'

export interface AgentRoleConfig {
  role: AgentRole
  name: string
  systemPrompt: string
  tools: string[]
}
