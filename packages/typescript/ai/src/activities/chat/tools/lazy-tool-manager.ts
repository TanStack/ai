import { convertSchemaToJsonSchema } from './schema-converter'
import type { Tool } from '../../../types'

const DISCOVERY_TOOL_NAME = '__lazy__tool__discovery__'

/**
 * Manages lazy tool discovery for the chat agent loop.
 *
 * Lazy tools are not sent to the LLM initially. Instead, a synthetic
 * "discovery tool" is provided that lets the LLM discover lazy tools
 * by name, receiving their full descriptions and schemas on demand.
 */
export class LazyToolManager {
  private readonly eagerTools: ReadonlyArray<Tool>
  private readonly lazyToolMap: Map<string, Tool>
  private readonly discoveredTools: Set<string>
  private hasNewDiscoveries: boolean
  private readonly discoveryTool: Tool | null

  constructor(
    tools: ReadonlyArray<Tool>,
    messages: ReadonlyArray<{
      role: string
      content?: any
      toolCalls?: Array<{
        id: string
        type: string
        function: { name: string; arguments: string }
      }>
      toolCallId?: string
    }>,
  ) {
    const eager: Array<Tool> = []
    this.lazyToolMap = new Map()
    this.discoveredTools = new Set()
    this.hasNewDiscoveries = false

    // Separate tools into eager and lazy
    for (const tool of tools) {
      if (tool.lazy) {
        this.lazyToolMap.set(tool.name, tool)
      } else {
        eager.push(tool)
      }
    }
    this.eagerTools = eager

    // If no lazy tools, no discovery tool needed
    if (this.lazyToolMap.size === 0) {
      this.discoveryTool = null
      return
    }

    // Scan message history to pre-populate discoveredTools
    this.scanMessageHistory(messages)

    // Create the synthetic discovery tool
    this.discoveryTool = this.createDiscoveryTool()
  }

  /**
   * Returns the set of tools that should be sent to the LLM:
   * eager tools + discovered lazy tools + discovery tool (if undiscovered tools remain).
   * Resets the hasNewDiscoveries flag.
   */
  getActiveTools(): Array<Tool> {
    this.hasNewDiscoveries = false

    const active: Array<Tool> = [...this.eagerTools]

    // Add discovered lazy tools
    for (const name of this.discoveredTools) {
      const tool = this.lazyToolMap.get(name)
      if (tool) {
        active.push(tool)
      }
    }

    // Add discovery tool if there are still undiscovered lazy tools
    if (
      this.discoveryTool &&
      this.discoveredTools.size < this.lazyToolMap.size
    ) {
      active.push(this.discoveryTool)
    }

    return active
  }

  /**
   * Returns whether new tools have been discovered since the last getActiveTools() call.
   */
  hasNewlyDiscoveredTools(): boolean {
    return this.hasNewDiscoveries
  }

  /**
   * Returns true if the given name is a lazy tool that has not yet been discovered.
   */
  isUndiscoveredLazyTool(name: string): boolean {
    return this.lazyToolMap.has(name) && !this.discoveredTools.has(name)
  }

  /**
   * Returns a helpful error message for when an undiscovered lazy tool is called.
   */
  getUndiscoveredToolError(name: string): string {
    return `Error: Tool '${name}' must be discovered first. Call ${DISCOVERY_TOOL_NAME} with toolNames: ['${name}'] to discover it.`
  }

  /**
   * Scans message history to find previously discovered lazy tools.
   * Looks for assistant messages with discovery tool calls and their
   * corresponding tool result messages.
   */
  private scanMessageHistory(
    messages: ReadonlyArray<{
      role: string
      content?: any
      toolCalls?: Array<{
        id: string
        type: string
        function: { name: string; arguments: string }
      }>
      toolCallId?: string
    }>,
  ): void {
    // Collect tool call IDs for discovery tool invocations
    const discoveryCallIds = new Set<string>()

    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.function.name === DISCOVERY_TOOL_NAME) {
            discoveryCallIds.add(tc.id)
          }
        }
      }
    }

    if (discoveryCallIds.size === 0) return

    // Find corresponding tool result messages
    for (const msg of messages) {
      if (
        msg.role === 'tool' &&
        msg.toolCallId &&
        discoveryCallIds.has(msg.toolCallId)
      ) {
        try {
          const content =
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content)
          const parsed = JSON.parse(content)
          if (parsed && Array.isArray(parsed.tools)) {
            for (const tool of parsed.tools) {
              if (
                tool &&
                typeof tool.name === 'string' &&
                this.lazyToolMap.has(tool.name)
              ) {
                this.discoveredTools.add(tool.name)
              }
            }
          }
        } catch {
          // Malformed JSON — skip gracefully
        }
      }
    }
  }

  /**
   * Creates the synthetic discovery tool that the LLM can call
   * to discover lazy tools' descriptions and schemas.
   */
  private createDiscoveryTool(): Tool {
    const undiscoveredNames = (): Array<string> => {
      const names: Array<string> = []
      for (const [name] of this.lazyToolMap) {
        if (!this.discoveredTools.has(name)) {
          names.push(name)
        }
      }
      return names
    }

    const lazyToolMap = this.lazyToolMap

    // Build the static description with all lazy tool names
    const allLazyNames = Array.from(this.lazyToolMap.keys())
    const description = `You have access to additional tools that can be discovered. Available tools: [${allLazyNames.join(', ')}]. Call this tool with a list of tool names to discover their full descriptions and argument schemas before using them.`

    // Use the arrow function to capture `this` context
    const manager = this

    return {
      name: DISCOVERY_TOOL_NAME,
      description,
      inputSchema: {
        type: 'object',
        properties: {
          toolNames: {
            type: 'array',
            items: { type: 'string' },
            description:
              'List of tool names to discover. Each name must match one of the available tools.',
          },
        },
        required: ['toolNames'],
      },
      execute: (args: { toolNames: Array<string> }) => {
        const tools: Array<{
          name: string
          description: string
          inputSchema?: any
        }> = []
        const errors: Array<string> = []

        for (const name of args.toolNames) {
          const tool = lazyToolMap.get(name)
          if (tool) {
            manager.discoveredTools.add(name)
            manager.hasNewDiscoveries = true
            const jsonSchema = tool.inputSchema
              ? convertSchemaToJsonSchema(tool.inputSchema)
              : undefined
            tools.push({
              name: tool.name,
              description: tool.description,
              ...(jsonSchema ? { inputSchema: jsonSchema } : {}),
            })
          } else {
            errors.push(
              `Unknown tool: '${name}'. Available tools: [${undiscoveredNames().join(', ')}]`,
            )
          }
        }

        const result: {
          tools: typeof tools
          errors?: Array<string>
        } = { tools }

        if (errors.length > 0) {
          result.errors = errors
        }

        return result
      },
    }
  }
}
