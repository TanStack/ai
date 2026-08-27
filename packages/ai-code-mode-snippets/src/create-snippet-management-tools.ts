import { toolDefinition } from '@tanstack/ai'
import { toolsToBindings } from '@tanstack/ai-code-mode'
import { z } from 'zod'
import { createDefaultTrustStrategy } from './trust-strategies'
import { snippetToTool } from './snippets-to-tools'
import type { SchemaInput, ServerTool, ToolRegistry } from '@tanstack/ai'
import type { CodeModeToolConfig, ToolBinding } from '@tanstack/ai-code-mode'
import type { SnippetStorage } from './types'
import type { TrustStrategy } from './trust-strategies'

interface CreateSnippetManagementToolsOptions {
  storage: SnippetStorage

  trustStrategy?: TrustStrategy

  registry?: ToolRegistry

  config?: CodeModeToolConfig

  baseBindings?: Record<string, ToolBinding>
}

export function createSnippetManagementTools({
  storage,
  trustStrategy,
  registry,
  config,
  baseBindings,
}: CreateSnippetManagementToolsOptions): Array<
  ServerTool<SchemaInput, SchemaInput, string>
> {
  // Use provided strategy, or storage's strategy, or default
  const strategy =
    trustStrategy ?? storage.trustStrategy ?? createDefaultTrustStrategy()

  // Compute bindings if not provided but config is available
  const bindings =
    baseBindings ?? (config ? toolsToBindings(config.tools, 'external_') : {})
  return [
    // Search for snippets
    toolDefinition({
      name: 'search_snippets',
      description:
        'Search the snippet library for reusable snippets. Use this to find snippets that can help accomplish a task. Returns matching snippets with their descriptions.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Search query describing what you want to accomplish'),
        limit: z
          .number()
          .optional()
          .default(5)
          .describe('Maximum number of results (default: 5)'),
      }),
      outputSchema: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          usageHints: z.array(z.string()),
          trustLevel: z.enum(['untrusted', 'provisional', 'trusted']),
        }),
      ),
    }).server(async ({ query, limit }) => {
      const results = await storage.search(query, { limit: limit ?? 5 })
      return results.map((s) => ({
        name: s.name,
        description: s.description,
        usageHints: s.usageHints,
        trustLevel: s.trustLevel,
      }))
    }),

    // Get full snippet details
    toolDefinition({
      name: 'get_snippet',
      description:
        'Get the full implementation details of a snippet, including its code. Use this after search_snippets to see how a snippet works before using it.',
      inputSchema: z.object({
        name: z.string().describe('The snippet name (without snippet_ prefix)'),
      }),
      outputSchema: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        code: z.string().optional(),
        inputSchema: z.string().optional().describe('JSON Schema as string'),
        outputSchema: z.string().optional().describe('JSON Schema as string'),
        usageHints: z.array(z.string()).optional(),
        dependsOn: z.array(z.string()).optional(),
        trustLevel: z.enum(['untrusted', 'provisional', 'trusted']).optional(),
        stats: z
          .object({
            executions: z.number(),
            successRate: z.number(),
          })
          .optional(),
        error: z.string().optional(),
      }),
    }).server(async ({ name }) => {
      const snippet = await storage.get(name)
      if (!snippet) {
        return { error: `Snippet '${name}' not found` }
      }
      return {
        name: snippet.name,
        description: snippet.description,
        code: snippet.code,
        inputSchema: JSON.stringify(snippet.inputSchema),
        outputSchema: JSON.stringify(snippet.outputSchema),
        usageHints: snippet.usageHints,
        dependsOn: snippet.dependsOn,
        trustLevel: snippet.trustLevel,
        stats: snippet.stats,
      }
    }),

    // Register a new snippet
    toolDefinition({
      name: 'register_snippet',
      description:
        'Save working TypeScript code as a reusable snippet for future use. Only register code that has been tested and works correctly. The snippet becomes available as a callable tool immediately.',
      inputSchema: z.object({
        name: z
          .string()
          .regex(
            /^[a-z][a-z0-9_]*$/,
            'Must be snake_case starting with a letter',
          )
          .describe(
            'Unique snippet name in snake_case (e.g., fetch_github_stats)',
          ),
        description: z
          .string()
          .describe('Clear description of what the snippet does'),
        code: z
          .string()
          .describe(
            'The TypeScript code. Receives `input` variable, can call external_* and snippet_* functions, should return a value.',
          ),
        inputSchema: z
          .string()
          .describe(
            'JSON Schema as a JSON string describing the input parameter, e.g. {"type":"object","properties":{"a":{"type":"number"}},"required":["a"]}',
          ),
        outputSchema: z
          .string()
          .describe(
            'JSON Schema as a JSON string describing the return value, e.g. {"type":"object","properties":{"result":{"type":"number"}}}',
          ),
        usageHints: z
          .array(z.string())
          .describe(
            'Hints about when to use this snippet, e.g. "Use when user asks about..."',
          ),
        dependsOn: z
          .array(z.string())
          .optional()
          .default([])
          .describe('Names of other snippets this snippet calls'),
      }),
      outputSchema: z.object({
        success: z.boolean().optional(),
        snippetId: z.string().optional(),
        name: z.string().optional(),
        message: z.string().optional(),
        error: z.string().optional(),
      }),
    }).server(async (rawSnippetDef, context) => {
      // Parse the JSON string schemas
      let inputSchema: Record<string, unknown>
      let outputSchema: Record<string, unknown>
      try {
        inputSchema = JSON.parse(rawSnippetDef.inputSchema) as Record<
          string,
          unknown
        >
      } catch {
        return { error: 'inputSchema must be a valid JSON string' }
      }
      try {
        outputSchema = JSON.parse(rawSnippetDef.outputSchema) as Record<
          string,
          unknown
        >
      } catch {
        return { error: 'outputSchema must be a valid JSON string' }
      }

      const snippetDef = {
        ...rawSnippetDef,
        inputSchema,
        outputSchema,
      }
      try {
        // Validate the snippet name isn't reserved
        if (snippetDef.name.startsWith('external_')) {
          return { error: "Snippet names cannot start with 'external_'" }
        }
        if (snippetDef.name.startsWith('snippet_')) {
          return {
            error:
              "Snippet names should not include the 'snippet_' prefix - it will be added automatically",
          }
        }

        // Check if snippet already exists
        const existing = await storage.get(snippetDef.name)
        if (existing) {
          return {
            error: `Snippet '${snippetDef.name}' already exists. Use a different name or update the existing snippet.`,
          }
        }

        // Generate a unique ID
        const id = crypto.randomUUID()

        // Get initial trust level from strategy
        const initialTrustLevel = strategy.getInitialTrustLevel()

        // Save the snippet
        const snippet = await storage.save({
          id,
          name: snippetDef.name,
          description: snippetDef.description,
          code: snippetDef.code,
          inputSchema: snippetDef.inputSchema,
          outputSchema: snippetDef.outputSchema,
          usageHints: snippetDef.usageHints,
          dependsOn: snippetDef.dependsOn ?? [],
          trustLevel: initialTrustLevel,
          stats: { executions: 0, successRate: 0 },
        })

        // If registry and config are available, add the snippet as a tool immediately
        if (registry && config) {
          const snippetTool = snippetToTool({
            snippet,
            driver: config.driver,
            bindings,
            storage,
            timeout: config.timeout,
            memoryLimit: config.memoryLimit,
          })
          registry.add(snippetTool)
          console.log(
            `[register_snippet] Added snippet '${snippet.name}' to registry immediately`,
          )
        }

        // Emit event for UI notification
        context?.emitCustomEvent('snippet:registered', {
          id: snippet.id,
          name: snippet.name,
          description: snippet.description,
          timestamp: Date.now(),
        })

        return {
          success: true,
          snippetId: snippet.id,
          name: snippet.name,
          message: `Snippet '${snippet.name}' registered successfully and is now available as the '${snippet.name}' tool.`,
        }
      } catch (error) {
        console.error('[register_snippet] Error:', error)
        return {
          error: `Failed to register snippet: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    }),
  ]
}
