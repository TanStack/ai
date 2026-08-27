import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import {
  createEventAwareBindings,
  toolsToBindings,
} from './bindings/tool-to-binding'
import { stripTypeScript } from './strip-typescript'
import { warnIfBindingsExposeSecrets } from './validate-bindings'
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
      stack: z.string().optional(),
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
    getSnippetBindings,
    onSecretParameter,
    transpile = stripTypeScript,
  } = config

  // Validate tools
  if (tools.length === 0) {
    throw new Error('At least one tool must be provided to createCodeModeTool')
  }

  // Transform tools to bindings with external_ prefix (static bindings)
  const staticBindings = toolsToBindings(tools, 'external_')

  // Shared across static + dynamic (snippet) binding scans so a given
  // (toolName, paramPath) pair surfaces at most once per code-mode instance.
  const secretDedupCache = new Set<string>()

  warnIfBindingsExposeSecrets(Object.values(staticBindings), {
    handler: onSecretParameter,
    dedupCache: secretDedupCache,
  })

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
      const startedAt = Date.now()

      // Get emitCustomEvent from context or use no-op
      const emitCustomEvent = toolContext?.emitCustomEvent || (() => {})

      const finish = (
        result: CodeModeToolResult,
        phase: string,
      ): CodeModeToolResult => {
        const durationMs = Date.now() - startedAt
        const payload = {
          timestamp: Date.now(),
          durationMs,
          phase,
          success: result.success,
          logCount: result.logs?.length ?? 0,
          error: result.error
            ? {
                name: result.error.name,
                message: result.error.message,
                ...(result.error.stack !== undefined && {
                  stack: result.error.stack,
                }),
                ...(result.error.line !== undefined && {
                  line: result.error.line,
                }),
              }
            : undefined,
        }
        emitCustomEvent('code_mode:execution_finished', payload)
        if (!result.success) {
          console.error('[code-mode] execute_typescript failed', payload)
        } else if (typeof process !== 'undefined') {
          if (process.env?.CODE_MODE_DEBUG === '1') {
            console.info('[code-mode] execute_typescript ok', {
              durationMs,
              phase,
              logCount: payload.logCount,
            })
          }
        }
        return result
      }

      if (!typescriptCode) {
        return finish(
          {
            success: false,
            error: {
              message: 'typescriptCode must be a non-empty string',
              name: 'ValidationError',
            },
          },
          'validate-input',
        )
      }
      if (typeof typescriptCode !== 'string') {
        return finish(
          {
            success: false,
            error: {
              message: 'typescriptCode must be a non-empty string',
              name: 'ValidationError',
            },
          },
          'validate-input',
        )
      }

      // Emit execution started event immediately
      emitCustomEvent('code_mode:execution_started', {
        timestamp: Date.now(),
        codeLength: typescriptCode.length,
      })

      try {
        return await runCodeModeExecution({
          typescriptCode,
          transpile,
          getSnippetBindings,
          onSecretParameter,
          secretDedupCache,
          staticBindings,
          emitCustomEvent,
          driver,
          timeout,
          memoryLimit,
          finish,
        })
      } catch (error) {
        return finish(
          {
            success: false,
            error: codeModeCaughtError(error),
          },
          'unhandled',
        )
      }
    },
  )
}

function codeModeCaughtError(
  error: unknown,
): NonNullable<CodeModeToolResult['error']> {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'Error',
    ...(error instanceof Error &&
      error.stack !== undefined && { stack: error.stack }),
  }
}

function emitCodeModeConsoleLogs(
  logs: Array<string> | undefined,
  emitCustomEvent: ToolExecutionContext['emitCustomEvent'],
): void {
  if (!logs) return
  if (logs.length === 0) return
  for (const log of logs) {
    const parsed = parseCodeModeLog(log)
    emitCustomEvent('code_mode:console', {
      ...parsed,
      timestamp: Date.now(),
    })
  }
}

function parseCodeModeLog(log: string): {
  level: 'log' | 'warn' | 'error' | 'info'
  message: string
} {
  if (log.startsWith('ERROR: '))
    return { level: 'error', message: log.slice(7) }
  if (log.startsWith('WARN: ')) return { level: 'warn', message: log.slice(6) }
  if (log.startsWith('INFO: ')) return { level: 'info', message: log.slice(6) }
  return { level: 'log', message: log }
}

async function runCodeModeExecution(args: {
  typescriptCode: string
  transpile: (code: string) => Promise<string> | string
  getSnippetBindings: CodeModeToolConfig['getSnippetBindings']
  onSecretParameter: CodeModeToolConfig['onSecretParameter']
  secretDedupCache: Set<string>
  staticBindings: ReturnType<typeof toolsToBindings>
  emitCustomEvent: ToolExecutionContext['emitCustomEvent']
  driver: CodeModeToolConfig['driver']
  timeout: number
  memoryLimit: number
  finish: (result: CodeModeToolResult, phase: string) => CodeModeToolResult
}): Promise<CodeModeToolResult> {
  let strippedCode: string
  try {
    strippedCode = await args.transpile(args.typescriptCode)
  } catch (error) {
    return args.finish(
      {
        success: false,
        error: {
          ...codeModeCaughtError(error),
          name: 'TypeScriptError',
        },
      },
      'transpile',
    )
  }

  const snippetBindings = args.getSnippetBindings
    ? await args.getSnippetBindings()
    : {}
  const snippetBindingValues = Object.values(snippetBindings)
  if (snippetBindingValues.length > 0) {
    warnIfBindingsExposeSecrets(snippetBindingValues, {
      handler: args.onSecretParameter,
      dedupCache: args.secretDedupCache,
    })
  }

  const eventAwareBindings = createEventAwareBindings(
    { ...args.staticBindings, ...snippetBindings },
    args.emitCustomEvent,
  )

  let isolateContext: IsolateContext
  try {
    isolateContext = await args.driver.createContext({
      bindings: eventAwareBindings,
      timeout: args.timeout,
      memoryLimit: args.memoryLimit,
    })
  } catch (error) {
    const caught = codeModeCaughtError(error)
    return args.finish(
      {
        success: false,
        error: {
          ...caught,
          name: error instanceof Error ? error.name : 'CreateContextError',
        },
      },
      'create-context',
    )
  }
  try {
    const executionResult = await isolateContext.execute(strippedCode)
    emitCodeModeConsoleLogs(executionResult.logs, args.emitCustomEvent)

    if (executionResult.success) {
      return args.finish(
        {
          success: true,
          result: executionResult.value,
          logs: executionResult.logs,
        },
        'execute',
      )
    }

    return args.finish(
      {
        success: false,
        error: executionResult.error
          ? {
              message: executionResult.error.message,
              name: executionResult.error.name,
              ...(executionResult.error.stack !== undefined && {
                stack: executionResult.error.stack,
              }),
            }
          : { message: 'Unknown execution error', name: 'UnknownError' },
        logs: executionResult.logs,
      },
      'execute',
    )
  } finally {
    await isolateContext.dispose()
  }
}

/**
 * Build the tool description including available external functions
 */
function buildToolDescription(tools: Array<CodeModeTool>): string {
  const eager = tools.filter((t) => !t.lazy)
  const hasLazy = tools.some((t) => t.lazy)
  const externalFunctions = eager.map((t) => `external_${t.name}`).join(', ')

  const discoverable = hasLazy
    ? ` Additional functions can be discovered via the discover_tools tool.`
    : ''

  return (
    `Execute TypeScript code in a secure sandbox environment. ` +
    `The code can use these external API functions: ${externalFunctions}.${discoverable} ` +
    `All external_* calls are async and must be awaited. ` +
    `Return a value to pass results back. Use console.log() for debugging.`
  )
}
