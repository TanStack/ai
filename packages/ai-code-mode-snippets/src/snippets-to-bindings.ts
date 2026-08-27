import type { ToolExecutionContext } from '@tanstack/ai'
import type { ToolBinding } from '@tanstack/ai-code-mode'
import type { Snippet, SnippetStorage } from './types'

interface SnippetsToBindingsOptions {
  /**
     * Snippets to convert to bindings
     */
  snippets: Array<Snippet>

  /**
     * Tool execution context for emitting custom events
     */
  context?: ToolExecutionContext

  /**
     * Function to execute snippet code in the sandbox
     * The snippet code receives `input` as a variable
     */
  executeInSandbox: (code: string, input: unknown) => Promise<unknown>

  /**
     * Storage for updating execution stats
     */
  storage: SnippetStorage
}

/**
 * Convert snippets to sandbox bindings with the snippet_ prefix.
 * Snippets become callable functions inside the sandbox.
 */
export function snippetsToBindings({
  snippets,
  context,
  executeInSandbox,
  storage,
}: SnippetsToBindingsOptions): Record<string, ToolBinding> {
  const bindings: Record<string, ToolBinding> = {}

  for (const snippet of snippets) {
    const bindingName = `snippet_${snippet.name}`

    bindings[bindingName] = {
      name: bindingName,
      description: snippet.description,
      inputSchema: snippet.inputSchema,
      outputSchema: snippet.outputSchema,
      execute: async (input: unknown) => {
        const startTime = Date.now()

        // Emit snippet call event
        context?.emitCustomEvent('code_mode:snippet_call', {
          snippet: snippet.name,
          input,
          timestamp: startTime,
        })

        try {
          // Wrap the snippet code to receive input as a variable
          const wrappedCode = `
            const input = ${JSON.stringify(input)};
            ${snippet.code}
          `

          const result = await executeInSandbox(wrappedCode, input)
          const duration = Date.now() - startTime

          // Emit success event
          context?.emitCustomEvent('code_mode:snippet_result', {
            snippet: snippet.name,
            result,
            duration,
            timestamp: Date.now(),
          })

          // Update stats (async, don't await to not block)
          storage.updateStats(snippet.name, true).catch(() => {
            // Silently ignore stats update failures
          })

          return result
        } catch (error) {
          const duration = Date.now() - startTime

          // Emit error event
          context?.emitCustomEvent('code_mode:snippet_error', {
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
        }
      },
    }
  }

  return bindings
}

/**
 * Create a simple binding record for snippets without full sandbox execution.
 * This is used when snippets are being documented in the system prompt
 * but not yet being executed.
 */
export function snippetsToSimpleBindings(
  snippets: Array<Snippet>,
): Record<string, ToolBinding> {
  const bindings: Record<string, ToolBinding> = {}

  for (const snippet of snippets) {
    const bindingName = `snippet_${snippet.name}`

    bindings[bindingName] = {
      name: bindingName,
      description: snippet.description,
      inputSchema: snippet.inputSchema,
      outputSchema: snippet.outputSchema,
      execute: () =>
        Promise.reject(
          new Error(
            `Snippet ${snippet.name} is not available for execution in this context`,
          ),
        ),
    }
  }

  return bindings
}
