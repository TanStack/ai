import type { AnyTool } from './types'

export interface ToolRegistry<TTool extends AnyTool = AnyTool> {
  getTools: () => Array<TTool>

  add: (tool: TTool) => void

  remove: (name: string) => boolean

  has: (name: string) => boolean

  get: (name: string) => TTool | undefined

  readonly isFrozen: boolean
}

export function createToolRegistry<TTool extends AnyTool = AnyTool>(
  initialTools: Array<TTool> = [],
): ToolRegistry<TTool> {
  const tools = new Map<string, TTool>()

  for (const tool of initialTools) {
    tools.set(tool.name, tool)
  }

  return {
    getTools: () => Array.from(tools.values()),

    add: (tool: TTool) => {
      tools.set(tool.name, tool)
    },

    remove: (name: string) => {
      return tools.delete(name)
    },

    has: (name: string) => {
      return tools.has(name)
    },

    get: (name: string) => {
      return tools.get(name)
    },

    isFrozen: false,
  }
}

export function createFrozenRegistry<TTool extends AnyTool = AnyTool>(
  tools: Array<TTool> = [],
): ToolRegistry<TTool> {
  const toolMap = new Map<string, TTool>()

  for (const tool of tools) {
    toolMap.set(tool.name, tool)
  }

  const frozenTools = Object.freeze([...tools])

  return {
    getTools: () => [...frozenTools],

    add: (_tool: TTool) => {
      // No-op for frozen registry
    },

    remove: (_name: string) => {
      // No-op for frozen registry
      return false
    },

    has: (name: string) => {
      return toolMap.has(name)
    },

    get: (name: string) => {
      return toolMap.get(name)
    },

    isFrozen: true,
  }
}
