import {
  createCodeModeSystemPrompt,
  createCodeModeTool,
  toolsToBindings,
} from '@tanstack/ai-code-mode'
import { createToolRegistry } from '@tanstack/ai'
import { selectRelevantSnippets } from './select-relevant-snippets'
import { createSnippetManagementTools } from './create-snippet-management-tools'
import { createSnippetsSystemPrompt } from './create-snippets-system-prompt'
import { snippetsToTools } from './snippets-to-tools'
import type {
  CodeModeWithSnippetsOptions,
  CodeModeWithSnippetsResult,
  Snippet,
} from './types'
import type { ToolBinding } from '@tanstack/ai-code-mode'

export type { CodeModeWithSnippetsOptions, CodeModeWithSnippetsResult }

/**
 * Create Code Mode tools and system prompt with snippets integration.
 *
 * This function:
 * 1. Loads the snippet index from storage
 * 2. Uses a cheap/fast LLM to select relevant snippets based on conversation context
 * 3. Creates the execute_typescript tool with dynamic snippet bindings
 * 4. Creates snippet management tools (search, get, register)
 * 5. Generates system prompts documenting available snippets
 * 6. Returns a ToolRegistry that allows dynamic snippet additions mid-stream
 *
 * @example
 * ```typescript
 * // Node-only file storage lives behind the `/storage` subpath:
 * import { createFileSnippetStorage } from '@tanstack/ai-code-mode-snippets/storage'
 *
 * const { toolsRegistry, systemPrompt, selectedSnippets } = await codeModeWithSnippets({
 *   config: {
 *     driver: createNodeIsolateDriver(),
 *     tools: allTools,
 *     timeout: 60000,
 *   },
 *   adapter: openaiText('gpt-4o-mini'),  // Cheap model for selection
 *   snippets: {
 *     storage: createFileSnippetStorage('./.snippets'),
 *     maxSnippetsInContext: 5,
 *   },
 *   messages,
 * });
 *
 * const stream = chat({
 *   adapter: openaiText('gpt-4o'),  // Main model
 *   toolRegistry: toolsRegistry,  // Dynamic tool registry
 *   messages,
 *   systemPrompts: [BASE_PROMPT, systemPrompt],
 * });
 * ```
 */
export async function codeModeWithSnippets({
  config,
  adapter,
  snippets,
  messages,
  snippetsAsTools = true,
}: CodeModeWithSnippetsOptions): Promise<CodeModeWithSnippetsResult> {
  const { storage, maxSnippetsInContext = 5 } = snippets

  // 1. Load the snippet index (lightweight metadata only)
  const snippetIndex = await storage.loadIndex()

  // 2. Use adapter to select relevant snippets based on transcript
  const selectedSnippets = await selectRelevantSnippets({
    adapter,
    messages,
    snippetIndex,
    maxSnippets: maxSnippetsInContext,
    storage,
  })

  // Pre-compute bindings from base tools (shared across snippet executions)
  const baseBindings = toolsToBindings(config.tools, 'external_')

  // 3. Create the execute_typescript tool with dynamic snippet bindings
  const codeModeTool = createCodeModeTool({
    ...config,
    // Dynamic snippet bindings - fetched at execution time
    getSnippetBindings: async () => {
      // Get all snippets from storage (includes newly registered ones)
      const allSnippets = await storage.loadAll()
      // Convert to bindings with snippet_ prefix
      const snippetBindings: Record<string, ToolBinding> = {}
      for (const snippet of allSnippets) {
        // Create a simple binding that executes the snippet code
        snippetBindings[`snippet_${snippet.name}`] = {
          name: `snippet_${snippet.name}`,
          description: snippet.description,
          inputSchema: snippet.inputSchema,
          outputSchema: snippet.outputSchema,
          execute: async (input: unknown) => {
            // This is a simplified execution - the full snippetToTool handles events
            const wrappedCode = `const input = ${JSON.stringify(input)};\n${snippet.code}`
            const { stripTypeScript, createEventAwareBindings } =
              await import('@tanstack/ai-code-mode')
            const strippedCode = await stripTypeScript(wrappedCode)
            const context = await config.driver.createContext({
              bindings: createEventAwareBindings(baseBindings, () => {}),
              timeout: config.timeout,
              ...(config.memoryLimit !== undefined && {
                memoryLimit: config.memoryLimit,
              }),
            })
            try {
              const result = await context.execute(strippedCode)
              if (!result.success) {
                throw new Error(
                  result.error?.message || 'Snippet execution failed',
                )
              }
              return result.value
            } finally {
              await context.dispose()
            }
          },
        }
      }
      return snippetBindings
    },
  })

  // 4. Create a mutable tool registry
  const registry = createToolRegistry()

  // 5. Add the execute_typescript tool to the registry
  registry.add(codeModeTool)

  // 6. Create snippet management tools (they need access to the registry)
  const snippetManagementTools = createSnippetManagementTools({
    storage,
    registry,
    config,
    baseBindings,
  })

  for (const tool of snippetManagementTools) {
    registry.add(tool)
  }

  // 7. Convert selected snippets to direct tools and add to registry (if enabled)
  if (snippetsAsTools && selectedSnippets.length > 0) {
    const snippetToolsList = snippetsToTools({
      snippets: selectedSnippets,
      driver: config.driver,
      tools: config.tools,
      storage,
      timeout: config.timeout,
      memoryLimit: config.memoryLimit,
    })

    for (const snippetTool of snippetToolsList) {
      registry.add(snippetTool)
    }
  }

  // 8. Generate combined system prompt
  const basePrompt = createCodeModeSystemPrompt(config)
  const snippetsPrompt = createSnippetsSystemPrompt({
    selectedSnippets,
    totalSnippetCount: snippetIndex.length,
    snippetsAsTools,
  })
  const systemPrompt = basePrompt + '\n\n' + snippetsPrompt

  return {
    toolsRegistry: registry,
    systemPrompt,
    selectedSnippets,
  }
}

/**
 * Create a Code Mode tool configuration extended with snippets.
 * This is an alternative to codeModeWithSnippets that returns
 * a config object instead of directly creating tools.
 *
 * Useful when you want more control over the tool creation process.
 */
export function createCodeModeWithSnippetsConfig({
  config,
  selectedSnippets,
  storage,
}: {
  config: CodeModeWithSnippetsOptions['config']
  selectedSnippets: Array<Snippet>
  storage: CodeModeWithSnippetsOptions['snippets']['storage']
}) {
  // Create snippet tools for direct calling
  const snippetToolsList = snippetsToTools({
    snippets: selectedSnippets,
    driver: config.driver,
    tools: config.tools,
    storage,
    timeout: config.timeout,
    memoryLimit: config.memoryLimit,
  })

  return {
    ...config,
    snippetTools: snippetToolsList,
    selectedSnippets,
  }
}
