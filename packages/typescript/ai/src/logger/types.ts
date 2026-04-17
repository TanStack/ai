export interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

export interface DebugCategories {
  provider?: boolean
  output?: boolean
  middleware?: boolean
  tools?: boolean
  agentLoop?: boolean
  config?: boolean
  errors?: boolean
  request?: boolean
}

export interface DebugConfig extends DebugCategories {
  logger?: Logger
}

export type DebugOption = boolean | DebugConfig
