import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import {
  createEventAwareBindings,
  toolsToBindings,
} from './bindings/tool-to-binding'
import { stripTypeScript } from './strip-typescript'
import type { ServerTool, ToolExecutionContext } from '@tanstack/ai'
import type {
  CodeModeTool,
  CodeModeToolConfig,
  CodeModeToolResult,
  IsolateContext,
} from './types'

/**
 * Schema for the execute_typescript tool input
 */
const executeTypescriptInputSchema = z.object({
  typescriptCode: z
    .string()
    .describe(
      'TypeScript code to execute in the sandbox. ' +
        'Use external_* functions to call available APIs. ' +
        'Return a value to pass results back.',
    ),
})

/**
 * Schema for the execute_typescript tool output
 */
const executeTypescriptOutputSchema = z.object({
  success: z.boolean().describe('Whether execution completed without errors'),
  result: z
    .unknown()
    .optional()
    .describe('Return value from the executed code'),
  logs: z
    .array(z.string())
    .optional()
    .describe('Console output captured during execution'),
  error: z
    .object({
      message: z.string(),
      name: z.string().optional(),
      line: z.number().optional(),
    })
    .optional()
    .describe('Error details if execution failed'),
})

export type ExecuteTypescriptInput = z.infer<
  typeof executeTypescriptInputSchema
>
export type ExecuteTypescriptOutput = z.infer<
  typeof executeTypescriptOutputSchema
>

/**
 * Create an execute_typescript tool that can be used alongside other agent tools.
 *
 * This tool allows an LLM to execute TypeScript code in a secure sandbox.
 * Tools passed in the config become `external_*` functions available inside the sandbox.
 *
 * @example
 * ```typescript
 * import { createCodeMode } from '@tanstack/ai-code-mode'
 * import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
 *
 * const { tool, systemPrompt } = createCodeMode({
 *   driver: createNodeIsolateDriver(),
 *   tools: [weatherTool, dbTool],  // Become external_fetchWeather, external_dbQuery
 *   timeout: 30000,
 * })
 *
 * chat({
 *   systemPrompts: [myPrompt, systemPrompt],
 *   tools: [tool, searchTool, emailTool],
 *   messages,
 * })
 * ```
 */
export function createCodeModeTool(
  config: CodeModeToolConfig,
): ServerTool<
  typeof executeTypescriptInputSchema,
  typeof executeTypescriptOutputSchema,
  'execute_typescript'
> {
  const {
    driver,
    tools,
    timeout = 30000,
    memoryLimit = 128,
    getSkillBindings,
  } = config

  // Validate tools
  if (tools.length === 0) {
    throw new Error('At least one tool must be provided to createCodeModeTool')
  }

  // Transform tools to bindings with external_ prefix (static bindings)
  const staticBindings = toolsToBindings(tools, 'external_')

  // Create the tool definition
  const definition = toolDefinition({
    name: 'execute_typescript' as const,
    description: buildToolDescription(tools),
    inputSchema: executeTypescriptInputSchema,
    outputSchema: executeTypescriptOutputSchema,
  })

  // Return server tool with execute function that accepts context
  return definition.server(
    async (
      input,
      toolContext?: ToolExecutionContext,
    ): Promise<CodeModeToolResult> => {
      const { typescriptCode } = input

      // Get emitCustomEvent from context or use no-op
      const emitCustomEvent = toolContext?.emitCustomEvent || (() => {})

      if (!typescriptCode || typeof typescriptCode !== 'string') {
        return {
          success: false,
          error: {
            message: 'typescriptCode must be a non-empty string',
            name: 'ValidationError',
          },
        }
      }

      // Create a fresh sandbox context for this execution
      let isolateContext: IsolateContext | null = null

      // Emit execution started event immediately
      emitCustomEvent('code_mode:execution_started', {
        timestamp: Date.now(),
        codeLength: typescriptCode.length,
      })

      try {
        // Step 1: Strip TypeScript (also serves as syntax validation via esbuild)
        let strippedCode: string
        try {
          strippedCode = await stripTypeScript(typescriptCode)
        } catch (error) {
          // Type/syntax error from esbuild
          return {
            success: false,
            error: {
              message: error instanceof Error ? error.message : String(error),
              name: 'TypeScriptError',
            },
          }
        }

        // Step 2: Get dynamic skill bindings if available
        const skillBindings = getSkillBindings ? await getSkillBindings() : {}

        // Step 3: Merge static and dynamic bindings, then wrap with event awareness
        const allBindings = { ...staticBindings, ...skillBindings }
        const eventAwareBindings = createEventAwareBindings(
          allBindings,
          emitCustomEvent,
        )

        // Step 4: Create sandbox context with event-aware bindings
        isolateContext = await driver.createContext({
          bindings: eventAwareBindings,
          timeout,
          memoryLimit,
        })

        // Step 5: Execute the code in the sandbox
        const executionResult = await isolateContext.execute(strippedCode)

        // Emit console logs as custom events
        if (executionResult.logs && executionResult.logs.length > 0) {
          for (const log of executionResult.logs) {
            // Parse log level from prefix (added by sandbox console implementation)
            let level: 'log' | 'warn' | 'error' | 'info' = 'log'
            let message = log

            if (log.startsWith('ERROR: ')) {
              level = 'error'
              message = log.slice(7)
            } else if (log.startsWith('WARN: ')) {
              level = 'warn'
              message = log.slice(6)
            } else if (log.startsWith('INFO: ')) {
              level = 'info'
              message = log.slice(6)
            }

            emitCustomEvent('code_mode:console', {
              level,
              message,
              timestamp: Date.now(),
            })
          }
        }

        if (executionResult.success) {
          return {
            success: true,
            result: executionResult.value,
            logs: executionResult.logs,
          }
        } else {
          return {
            success: false,
            error: executionResult.error
              ? {
                  message: executionResult.error.message,
                  name: executionResult.error.name,
                }
              : { message: 'Unknown execution error' },
            logs: executionResult.logs,
          }
        }
      } catch (error) {
        return {
          success: false,
          error: {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : 'Error',
          },
        }
      } finally {
        // Always clean up the sandbox context
        if (isolateContext) {
          await isolateContext.dispose()
        }
      }
    },
  )
}

/**
 * Build the tool description including available external functions
 */
function buildToolDescription(tools: Array<CodeModeTool>): string {
  const externalFunctions = tools.map((t) => `external_${t.name}`).join(', ')

  return (
    `Execute TypeScript code in a secure sandbox environment. ` +
    `The code can use these external API functions: ${externalFunctions}. ` +
    `All external_* calls are async and must be awaited. ` +
    `Return a value to pass results back. Use console.log() for debugging.`
  )
}
