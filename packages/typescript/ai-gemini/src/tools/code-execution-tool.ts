
import type { Tool } from '@tanstack/ai'

export interface CodeExecutionTool { }

export function convertCodeExecutionToolToAdapterFormat(_tool: Tool) {
  return {
    codeExecution: {},
  }
}

export function codeExecutionTool(): Tool {
  return {
    name: 'code_execution',
    description: '',
    metadata: {},
  }
}
