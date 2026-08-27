import { convertSchemaToJsonSchema } from './schema-converter'
import { renderLazyCatalogEntry } from './lazy-tools'
import type { AnyTool, LazyToolsConfig, Tool } from '../../../types'

export const DISCOVERY_TOOL_NAME = '__lazy__tool__discovery__'

export class LazyToolManager {
  private readonly eagerTools: ReadonlyArray<Tool>
  private readonly lazyToolMap: Map<string, Tool>
  private readonly discoveredTools: Set<string>
  private hasNewDiscoveries: boolean
  private readonly discoveryTool: Tool | null
  private readonly lazyToolsConfig: LazyToolsConfig

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
    lazyToolsConfig: LazyToolsConfig = {},
  ) {
    this.lazyToolsConfig = lazyToolsConfig
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
    const hasDiscoveryTool =
      this.discoveryTool && this.discoveredTools.size < this.lazyToolMap.size
    if (hasDiscoveryTool) {
      active.push(this.discoveryTool)
    }

    return active
  }

  getExecutableTools(
    activeTools: ReadonlyArray<AnyTool>,
    pendingToolCallNames: ReadonlyArray<string>,
  ): ReadonlyArray<AnyTool> {
    const hasDiscoveryTool =
      this.discoveryTool &&
      pendingToolCallNames.includes(DISCOVERY_TOOL_NAME) &&
      !activeTools.some((t) => t.name === DISCOVERY_TOOL_NAME)
    if (hasDiscoveryTool) {
      return [...activeTools, this.discoveryTool]
    }
    return activeTools
  }

  hasNewlyDiscoveredTools(): boolean {
    return this.hasNewDiscoveries
  }

  isUndiscoveredLazyTool(name: string): boolean {
    return this.lazyToolMap.has(name) && !this.discoveredTools.has(name)
  }

  getUndiscoveredToolError(name: string): string {
    return `Error: Tool '${name}' must be discovered first. Call ${DISCOVERY_TOOL_NAME} with toolNames: ['${name}'] to discover it.`
  }

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
      const isAssistant = msg.role === 'assistant' && msg.toolCalls
      if (isAssistant) {
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
      const isTool =
        msg.role === 'tool' &&
        msg.toolCallId &&
        discoveryCallIds.has(msg.toolCallId)
      if (isTool) {
        try {
          const content =
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content)
          const parsed = JSON.parse(content)
          const isInvalidParsed = parsed && Array.isArray(parsed.tools)
          if (isInvalidParsed) {
            for (const tool of parsed.tools) {
              const isString =
                tool &&
                typeof tool.name === 'string' &&
                this.lazyToolMap.has(tool.name)
              if (isString) {
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

    // Build the static description, rendering each entry per includeDescription.
    // With the default 'none' this is byte-identical to the legacy output.
    const include = this.lazyToolsConfig.includeDescription ?? 'none'
    const allLazyEntries = Array.from(this.lazyToolMap.values()).map((t) =>
      renderLazyCatalogEntry(t.name, t.description, include),
    )
    const description = `You have access to additional tools that can be discovered. Available tools: [${allLazyEntries.join(', ')}]. Call this tool with a list of tool names to discover their full descriptions and argument schemas before using them.`

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
            if (!manager.discoveredTools.has(name)) {
              manager.discoveredTools.add(name)
              manager.hasNewDiscoveries = true
            }
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
