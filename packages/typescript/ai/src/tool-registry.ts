import type { Tool } from './types'

/**
 * A registry that holds tools and allows dynamic tool management.
 *
 * The registry can be either mutable (allowing additions/removals during execution)
 * or frozen (static tool list, for backward compatibility with tools arrays).
 */
export interface ToolRegistry {
  /**
   * Get all current tools in the registry.
   * Called each agent loop iteration to get the latest tool list.
   */
  getTools: () => ReadonlyArray<Tool>

  /**
   * Add a tool to the registry dynamically.
   * For frozen registries, this is a no-op.
   *
   * @param tool - The tool to add
   */
  add: (tool: Tool) => void

  /**
   * Remove a tool from the registry by name.
   * For frozen registries, this always returns false.
   *
   * @param name - The name of the tool to remove
   * @returns true if the tool was removed, false if not found or frozen
   */
  remove: (name: string) => boolean

  /**
   * Check if a tool exists in the registry.
   *
   * @param name - The name of the tool to check
   */
  has: (name: string) => boolean

  /**
   * Get a tool by name.
   *
   * @param name - The name of the tool to get
   * @returns The tool if found, undefined otherwise
   */
  get: (name: string) => Tool | undefined

  /**
   * Whether this registry is frozen (immutable).
   * Frozen registries don't allow add/remove operations.
   */
  readonly isFrozen: boolean
}

/**
 * Create a mutable tool registry for dynamic tool scenarios.
 *
 * Tools can be added and removed during chat execution, and the
 * changes will be reflected in subsequent agent loop iterations.
 *
 * @param initialTools - Optional initial set of tools
 * @returns A mutable ToolRegistry
 *
 * @example
 * ```typescript
 * const registry = createToolRegistry([toolA, toolB])
 *
 * const stream = chat({
 *   adapter,
 *   messages,
 *   toolRegistry: registry,
 * })
 *
 * // Later, during tool execution:
 * registry.add(newTool)  // Immediately available to LLM
 * ```
 */
export function createToolRegistry(
  initialTools: Array<Tool> = [],
): ToolRegistry {
  const tools = new Map<string, Tool>()

  for (const tool of initialTools) {
    tools.set(tool.name, tool)
  }

  return {
    getTools: () => Array.from(tools.values()),

    add: (tool: Tool) => {
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

/**
 * Create a frozen (immutable) tool registry from a tools array.
 *
 * This is used internally to wrap static `tools` arrays for backward compatibility.
 * Add and remove operations are no-ops on frozen registries.
 *
 * @param tools - The static array of tools
 * @returns A frozen ToolRegistry
 */
export function createFrozenRegistry(tools: Array<Tool> = []): ToolRegistry {
  const toolMap = new Map<string, Tool>()

  for (const tool of tools) {
    toolMap.set(tool.name, tool)
  }

  const frozenTools = Object.freeze([...tools])

  return {
    getTools: () => frozenTools,

    add: (_tool: Tool) => {
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
