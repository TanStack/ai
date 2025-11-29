import { toolDefinition } from '@tanstack/ai'
import type {
  ServerTool,
  ToolDefinitionConfig,
  ToolDefinitionInstance,
} from '@tanstack/ai'
import type { z } from 'zod'

/**
 * Configuration for creating a server function tool
 */
export interface CreateServerFnToolConfig<
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
  TName extends string = string,
> extends Omit<ToolDefinitionConfig<TInput, TOutput, TName>, 'name'> {
  name: TName
  /**
   * The execution function that runs on the server
   * This will be used for both the AI tool and the server function
   */
  execute: (
    args: z.infer<TInput>,
  ) => Promise<z.infer<TOutput>> | z.infer<TOutput>
}

/**
 * Result of createServerFnTool with all three variants
 */
export interface ServerFnToolResult<
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
  TName extends string,
> {
  /**
   * The tool definition (for passing to chat on server when you want client to handle it)
   */
  toolDefinition: ToolDefinitionInstance<TInput, TOutput, TName>
  /**
   * The server tool implementation (for passing to chat on server for server-side execution)
   */
  server: ServerTool<TInput, TOutput, TName>
  /**
   * The server function (for calling directly from Solid components)
   * Note: Wrap this with createServerFn() from @tanstack/solid-start for full integration
   */
  serverFn: (args: z.infer<TInput>) => Promise<z.infer<TOutput>>
}

/**
 * Create a tool that works as both an AI tool and a callable server function
 *
 * This helper creates three things from a single definition:
 * 1. A tool definition (for client-side tool execution)
 * 2. A server tool (for AI chat server-side execution)
 * 3. A server function (for direct calls from Solid components)
 *
 * @example
 * ```typescript
 * const getGuitarsTool = createServerFnTool({
 *   name: 'getGuitars',
 *   description: 'Get all guitars from the database',
 *   inputSchema: z.object({
 *     style: z.string().optional(),
 *   }),
 *   outputSchema: z.array(z.object({
 *     id: z.string(),
 *     name: z.string(),
 *     price: z.number(),
 *   })),
 *   execute: async ({ style }) => {
 *     return await db.guitars.findMany({
 *       where: style ? { style } : undefined,
 *     });
 *   },
 * });
 *
 * // Use in AI chat (server)
 * chat({
 *   tools: [getGuitarsTool.server],
 * });
 *
 * // Call directly from Solid component (use with createServerFn wrapper)
 * const guitars = await getGuitarsTool.serverFn({ style: 'acoustic' });
 * ```
 */
export function createServerFnTool<
  TInput extends z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
  TName extends string = string,
>(
  config: CreateServerFnToolConfig<TInput, TOutput, TName>,
): ServerFnToolResult<TInput, TOutput, TName> {
  const { execute, ...toolConfig } = config

  // Create the tool definition
  const definition = toolDefinition(toolConfig)

  // Create the server implementation
  const server = definition.server(execute)

  // Create a validated server function
  const serverFn = async (args: z.infer<TInput>): Promise<z.infer<TOutput>> => {
    // Validate the input against the schema if provided
    if (config.inputSchema) {
      const result = config.inputSchema.safeParse(args)
      if (!result.success) {
        throw new Error(
          `Invalid input for ${config.name}: ${result.error.message}`,
        )
      }
    }
    return await execute(args)
  }

  return {
    toolDefinition: definition,
    server,
    serverFn,
  }
}
