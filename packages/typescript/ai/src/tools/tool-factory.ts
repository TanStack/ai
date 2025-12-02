import type { z } from 'zod'
import type { Tool } from '../types'

/**
 * Marker type for server-side tools
 */
export interface ServerTool<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
  TName extends string = string,
> extends Tool<TInput, TOutput, TName> {
  __toolSide: 'server'
}

/**
 * Marker type for client-side tools
 */
export interface ClientTool<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
  TName extends string = string,
> {
  __toolSide: 'client'
  name: TName
  description: string
  inputSchema?: TInput
  outputSchema?: TOutput
  needsApproval?: boolean
  metadata?: Record<string, any>
  execute?: (
    args: z.infer<TInput>,
  ) => Promise<z.infer<TOutput>> | z.infer<TOutput>
}

/**
 * Tool definition that can be used directly or instantiated for server/client
 */
export interface ToolDefinitionInstance<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
  TName extends string = string,
> extends Tool<TInput, TOutput, TName> {
  __toolSide: 'definition'
}

/**
 * Union type for any kind of client-side tool (client tool or definition)
 */
export type AnyClientTool =
  | ClientTool<any, any>
  | ToolDefinitionInstance<any, any>

/**
 * Extract the tool name as a literal type
 */
export type InferToolName<T> = T extends { name: infer N } ? N : never

/**
 * Extract the input type from a tool (inferred from Zod schema)
 */
export type InferToolInput<T> = T extends { inputSchema?: infer TInput }
  ? TInput extends z.ZodType
    ? z.infer<TInput>
    : any
  : any

/**
 * Extract the output type from a tool (inferred from Zod schema)
 */
export type InferToolOutput<T> = T extends { outputSchema?: infer TOutput }
  ? TOutput extends z.ZodType
    ? z.infer<TOutput>
    : any
  : any

/**
 * Tool definition configuration
 */
export interface ToolDefinitionConfig<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
  TName extends string = string,
> {
  name: TName
  description: string
  inputSchema?: TInput
  outputSchema?: TOutput
  needsApproval?: boolean
  metadata?: Record<string, any>
}

/**
 * Tool definition builder that allows creating server or client tools from a shared definition
 */
export interface ToolDefinition<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
  TName extends string = string,
> extends ToolDefinitionInstance<TInput, TOutput, TName> {
  /**
   * Create a server-side tool with execute function
   */
  server: (
    execute: (
      args: z.infer<TInput>,
    ) => Promise<z.infer<TOutput>> | z.infer<TOutput>,
  ) => ServerTool<TInput, TOutput, TName>

  /**
   * Create a client-side tool with optional execute function
   */
  client: (
    execute?: (
      args: z.infer<TInput>,
    ) => Promise<z.infer<TOutput>> | z.infer<TOutput>,
  ) => ClientTool<TInput, TOutput, TName>
}

/**
 * Create an isomorphic tool definition that can be used directly or instantiated for server/client
 *
 * The definition contains all tool metadata (name, description, schemas) and can be:
 * 1. Used directly in chat() on the server (as a tool definition without execute)
 * 2. Instantiated as a server tool with .server()
 * 3. Instantiated as a client tool with .client()
 *
 * @example
 * ```typescript
 * import { toolDefinition } from '@tanstack/ai';
 * import { z } from 'zod';
 *
 * const addToCartTool = toolDefinition({
 *   name: 'addToCart',
 *   description: 'Add a guitar to the shopping cart (requires approval)',
 *   needsApproval: true,
 *   inputSchema: z.object({
 *     guitarId: z.string(),
 *     quantity: z.number(),
 *   }),
 *   outputSchema: z.object({
 *     success: z.boolean(),
 *     cartId: z.string(),
 *     totalItems: z.number(),
 *   }),
 * });
 *
 * // Use directly in chat (server-side, no execute function)
 * chat({
 *   tools: [addToCartTool],
 *   // ...
 * });
 *
 * // Or create server-side implementation
 * const addToCartServer = addToCartTool.server(async (args) => {
 *   // args is typed as { guitarId: string; quantity: number }
 *   return {
 *     success: true,
 *     cartId: 'CART_' + Date.now(),
 *     totalItems: args.quantity,
 *   };
 * });
 *
 * // Or create client-side implementation
 * const addToCartClient = addToCartTool.client(async (args) => {
 *   // Client-specific logic (e.g., localStorage)
 *   return { success: true, cartId: 'local', totalItems: 1 };
 * });
 * ```
 */
export function toolDefinition<
  TInput extends z.ZodType = z.ZodAny,
  TOutput extends z.ZodType = z.ZodAny,
  TName extends string = string,
>(
  config: ToolDefinitionConfig<TInput, TOutput, TName>,
): ToolDefinition<TInput, TOutput, TName> {
  const definition: ToolDefinition<TInput, TOutput, TName> = {
    __toolSide: 'definition',
    ...config,
    server(
      execute: (
        args: z.infer<TInput>,
      ) => Promise<z.infer<TOutput>> | z.infer<TOutput>,
    ): ServerTool<TInput, TOutput, TName> {
      return {
        __toolSide: 'server',
        ...config,
        execute,
      }
    },

    client(
      execute?: (
        args: z.infer<TInput>,
      ) => Promise<z.infer<TOutput>> | z.infer<TOutput>,
    ): ClientTool<TInput, TOutput, TName> {
      return {
        __toolSide: 'client',
        ...config,
        execute,
      }
    },
  }

  return definition
}
