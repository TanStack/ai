import { convertSchemaToJsonSchema } from '@tanstack/ai'
import type { ToolExecutionContext } from '@tanstack/ai'
import type { CodeModeTool, ToolBinding } from '../types'

/**
 * Convert an array of TanStack AI tools to a Record of ToolBindings
 *
 * @param tools - Array of tools to convert
 * @param prefix - Optional prefix to add to binding names (e.g., 'external_')
 */
export function toolsToBindings(
  tools: Array<CodeModeTool>,
  prefix: string = '',
): Record<string, ToolBinding> {
  const bindings: Record<string, ToolBinding> = {}

  for (const tool of tools) {
    const bindingName = `${prefix}${tool.name}`
    bindings[bindingName] = toolToBinding(tool, prefix)
  }

  return bindings
}

/**
 * Convert a single TanStack AI tool to a ToolBinding
 *
 * @param tool - Tool to convert
 * @param prefix - Optional prefix to add to binding name (e.g., 'external_')
 * @throws Error if the tool doesn't have an execute function
 */
export function toolToBinding(
  tool: CodeModeTool,
  prefix: string = '',
): ToolBinding {
  // Convert schemas (Zod or Standard Schema) to JSON Schema
  const inputSchema = convertSchemaToJsonSchema(tool.inputSchema) || {
    type: 'object',
    properties: {},
  }

  const outputSchema = tool.outputSchema
    ? convertSchemaToJsonSchema(tool.outputSchema)
    : undefined

  // Get execute function
  // ServerTool has execute, ToolDefinition (without .server()) does not
  let execute: (
    args: unknown,
    context?: ToolExecutionContext,
  ) => Promise<unknown>

  if ('execute' in tool && typeof tool.execute === 'function') {
    const toolExecute = tool.execute
    execute = (args: unknown, context?: ToolExecutionContext) => {
      // Pass context to the underlying tool so it can emit custom events
      return Promise.resolve(toolExecute(args, context))
    }
  } else if ('__toolSide' in tool && tool.__toolSide === 'definition') {
    throw new Error(
      `Tool "${tool.name}" is a ToolDefinition without an execute function. ` +
        `Call .server(fn) to provide an implementation before using with Code Mode.`,
    )
  } else {
    throw new Error(
      `Tool "${tool.name}" does not have an execute function. ` +
        `Code Mode requires tools with implementations.`,
    )
  }

  return {
    name: `${prefix}${tool.name}`,
    description: tool.description,
    inputSchema,
    outputSchema,
    execute,
  }
}

/**
 * Create event-aware bindings that emit custom events for each external function call.
 * Wraps each binding's execute function to emit events before and after execution.
 *
 * @param bindings - Original tool bindings
 * @param emitCustomEvent - Callback to emit custom events to the stream
 */
export function createEventAwareBindings(
  bindings: Record<string, ToolBinding>,
  emitCustomEvent: (eventName: string, data: Record<string, any>) => void,
): Record<string, ToolBinding> {
  const wrapped: Record<string, ToolBinding> = {}

  for (const [name, binding] of Object.entries(bindings)) {
    wrapped[name] = {
      ...binding,
      execute: async (args: unknown) => {
        // Emit call event
        emitCustomEvent('code_mode:external_call', {
          function: name,
          args,
          timestamp: Date.now(),
        })

        const startTime = Date.now()
        try {
          // Create context for the underlying tool so it can also emit events
          const toolContext: ToolExecutionContext = { emitCustomEvent }
          const result = await binding.execute(args, toolContext)

          // Emit result event
          emitCustomEvent('code_mode:external_result', {
            function: name,
            result,
            duration: Date.now() - startTime,
          })

          return result
        } catch (error) {
          // Emit error event
          emitCustomEvent('code_mode:external_error', {
            function: name,
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
          })
          throw error
        }
      },
    }
  }

  return wrapped
}
