import { toolDefinition } from '@tanstack/ai'
import {
  createEventAwareBindings,
  stripTypeScript,
  toolsToBindings,
} from '@tanstack/ai-code-mode'
import { z } from 'zod'
import type {
  SchemaInput,
  ServerTool,
  ToolExecutionContext,
} from '@tanstack/ai'
import type {
  CodeModeTool,
  IsolateDriver,
  ToolBinding,
} from '@tanstack/ai-code-mode'
import type { Snippet, SnippetStorage } from './types'

/**
 * Options for converting a single snippet to a tool
 */
export interface SnippetToToolOptions {
  /**
     * The snippet to convert
     */
  snippet: Snippet

  /**
     * Isolate driver for executing snippet code
     */
  driver: IsolateDriver

  /**
     * Pre-computed bindings for external_* functions
     */
  bindings: Record<string, ToolBinding>

  /**
     * Storage for updating execution stats
     */
  storage: SnippetStorage

  /**
     * Timeout for snippet execution in ms
     * @default 30000
     */
  timeout?: number

  /**
     * Memory limit in bytes
     * @default 128
     */
  memoryLimit?: number
}

interface SnippetsToToolsOptions {
  /**
     * Snippets to convert to tools
     */
  snippets: Array<Snippet>

  driver: IsolateDriver

  /**
     * Original tools that become external_* bindings
     * (so snippets can call external_* functions)
     */
  tools: Array<CodeModeTool>

  storage: SnippetStorage

  timeout?: number

  memoryLimit?: number
}

/**
 * Convert JSON Schema to Zod schema.
 * This is a simplified converter that handles common cases.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  const type = schema.type as string

  if (type === 'string') {
    let zodString = z.string()
    if (schema.description) {
      zodString = zodString.describe(schema.description as string)
    }
    return zodString
  }
  if (type === 'number') {
    let zodNum = z.number()
    if (schema.description) {
      zodNum = zodNum.describe(schema.description as string)
    }
    return zodNum
  }
  if (type === 'integer') {
    let zodNum = z.number()
    if (schema.description) {
      zodNum = zodNum.describe(schema.description as string)
    }
    return zodNum
  }
  if (type === 'boolean') {
    let zodBool = z.boolean()
    if (schema.description) {
      zodBool = zodBool.describe(schema.description as string)
    }
    return zodBool
  }
  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined
    if (items) {
      return z.array(jsonSchemaToZod(items))
    }
    return z.array(z.unknown())
  }
  if (type === 'object') {
    const properties = schema.properties as
      | Record<string, Record<string, unknown>>
      | undefined
    const required = (schema.required as Array<string> | undefined) ?? []

    if (properties) {
      const shape: Record<string, z.ZodType> = {}
      const propertyEntries = Object.entries(properties)
      for (const [key, propSchema] of propertyEntries) {
        let zodProp = jsonSchemaToZod(propSchema)
        if (!required.includes(key)) {
          zodProp = zodProp.optional()
        }
        shape[key] = zodProp
      }
      return z.object(shape)
    }
    return z.record(z.string(), z.unknown())
  }

  // Fallback
  return z.unknown()
}

/**
 * Convert a single snippet to a ServerTool that the LLM can call directly.
 * The snippet executes its code in the sandbox with access to external_* bindings.
 */
export function snippetToTool({
  snippet,
  driver,
  bindings,
  storage,
  timeout = 30000,
  memoryLimit = 128,
}: SnippetToToolOptions): ServerTool<SchemaInput, SchemaInput, string> {
  // Generate input and output schemas from JSON Schema
  const inputSchema = jsonSchemaToZod(snippet.inputSchema)
  const outputSchema = jsonSchemaToZod(snippet.outputSchema)

  return toolDefinition({
    name: snippet.name,
    description: `[SNIPPET] ${snippet.description}`,
    inputSchema,
    outputSchema,
  }).server(async (input: unknown, context?: ToolExecutionContext) => {
    const startTime = Date.now()
    const emitCustomEvent = context?.emitCustomEvent || (() => {})

    // Emit snippet call event
    emitCustomEvent('code_mode:snippet_call', {
      snippet: snippet.name,
      input,
      timestamp: startTime,
    })

    let isolateContext = null

    try {
      console.log(
        `[Snippet:${snippet.name}] Starting execution with input:`,
        JSON.stringify(input).substring(0, 200),
      )

      // Wrap the snippet code to receive input as a variable
      const wrappedCode = `
          const input = ${JSON.stringify(input)};
          ${snippet.code}
        `
      console.log(
        `[Snippet:${snippet.name}] Wrapped code (first 500 chars):`,
        wrappedCode.substring(0, 500),
      )

      // Strip TypeScript to JavaScript
      const strippedCode = await stripTypeScript(wrappedCode)
      console.log(
        `[Snippet:${snippet.name}] Stripped code (first 500 chars):`,
        strippedCode.substring(0, 500),
      )

      // Create event-aware bindings
      const eventAwareBindings = createEventAwareBindings(
        bindings,
        emitCustomEvent,
      )
      console.log(
        `[Snippet:${snippet.name}] Event-aware bindings:`,
        Object.keys(eventAwareBindings),
      )

      // Create sandbox context
      console.log(`[Snippet:${snippet.name}] Creating sandbox context...`)
      isolateContext = await driver.createContext({
        bindings: eventAwareBindings,
        timeout,
        memoryLimit,
      })
      console.log(`[Snippet:${snippet.name}] Sandbox context created`)

      // Execute the code
      console.log(`[Snippet:${snippet.name}] Executing code...`)
      const executionResult = await isolateContext.execute(strippedCode)
      console.log(`[Snippet:${snippet.name}] Execution result:`, {
        success: executionResult.success,
        hasValue: 'value' in executionResult,
        error: executionResult.error,
        logs: executionResult.logs,
      })

      const duration = Date.now() - startTime

      if (!executionResult.success) {
        console.error(
          `[Snippet:${snippet.name}] Execution failed:`,
          executionResult.error,
        )
        throw new Error(
          executionResult.error?.message || 'Snippet execution failed',
        )
      }

      // Emit success event
      emitCustomEvent('code_mode:snippet_result', {
        snippet: snippet.name,
        result: executionResult.value,
        duration,
        timestamp: Date.now(),
      })

      // Update stats (async, don't await to not block)
      storage.updateStats(snippet.name, true).catch(() => {
        // Silently ignore stats update failures
      })

      return executionResult.value
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`[Snippet:${snippet.name}] CAUGHT ERROR:`, {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration,
      })

      // Emit error event
      emitCustomEvent('code_mode:snippet_error', {
        snippet: snippet.name,
        error: error instanceof Error ? error.message : String(error),
        duration,
        timestamp: Date.now(),
      })

      // Update stats (async, don't await)
      storage.updateStats(snippet.name, false).catch(() => {
        // Silently ignore stats update failures
      })

      throw error
    } finally {
      if (isolateContext) {
        await isolateContext.dispose()
      }
    }
  })
}

/**
 * Convert multiple snippets to ServerTools that the LLM can call directly.
 * Snippets become real tools that execute their code in the sandbox.
 */
export function snippetsToTools({
  snippets,
  driver,
  tools,
  storage,
  timeout = 30000,
  memoryLimit = 128,
}: SnippetsToToolsOptions): Array<
  ServerTool<SchemaInput, SchemaInput, string>
> {
  // Pre-compute bindings from tools (these are shared across all snippet executions)
  console.log(
    '[SnippetsToTools] Creating bindings from tools:',
    tools.map((t) => t.name),
  )
  const bindings = toolsToBindings(tools, 'external_')
  console.log('[SnippetsToTools] Created bindings:', Object.keys(bindings))

  return snippets.map((snippet) =>
    snippetToTool({
      snippet,
      driver,
      bindings,
      storage,
      timeout,
      memoryLimit,
    }),
  )
}
