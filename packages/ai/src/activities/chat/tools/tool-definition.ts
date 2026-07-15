import type { StandardJSONSchemaV1 } from '@standard-schema/spec'
import type {
  JSONSchema,
  SchemaInput,
  Tool,
  ToolExecuteFunction,
} from '../../../types'

/**
 * Marker type for server-side tools
 */
export interface ServerTool<
  TInput extends SchemaInput = SchemaInput,
  TOutput extends SchemaInput = SchemaInput,
  TName extends string = string,
  TContext = unknown,
> extends Tool<TInput, TOutput, TName, TContext> {
  __toolSide: 'server'
}

/**
 * Marker type for client-side tools
 */
export interface ClientTool<
  TInput extends SchemaInput = SchemaInput,
  TOutput extends SchemaInput = SchemaInput,
  TName extends string = string,
  TContext = unknown,
  // Captured as a literal (`true` / `false`) so downstream types — notably
  // the tool-call part's `approval` field — can be gated on it. Defaults to
  // `false` when the tool config omits `needsApproval`.
  TNeedsApproval extends boolean = false,
> {
  __toolSide: 'client'
  name: TName
  description: string
  // Note: `inputSchema` / `outputSchema` stay as bare optionals (not
  // widened to `| undefined`). They participate in inference via
  // `InferToolInput` / `InferToolOutput` — widening with `| undefined`
  // breaks the `infer TInput extends StandardJSONSchemaV1<...>` chain
  // because `undefined` doesn't extend the schema constraint.
  inputSchema?: TInput
  outputSchema?: TOutput
  needsApproval?: TNeedsApproval
  lazy?: boolean
  metadata?: Record<string, unknown>
  execute?: ToolExecuteFunction<TInput, TOutput, TContext>
}

/**
 * Tool definition that can be used directly or instantiated for server/client
 */
export interface ToolDefinitionInstance<
  TInput extends SchemaInput = SchemaInput,
  TOutput extends SchemaInput = SchemaInput,
  TName extends string = string,
  TContext = unknown,
  TNeedsApproval extends boolean = false,
> extends Tool<TInput, TOutput, TName, TContext> {
  __toolSide: 'definition'
  // Narrow the base `needsApproval?: boolean` to the captured literal so it
  // survives into `ToolCallPartForTool`'s approval gate.
  needsApproval?: TNeedsApproval
}

/**
 * Union type for any kind of client-side tool (client tool or definition)
 */
export type AnyClientTool =
  | (Omit<ClientTool<any, any, string, any, boolean>, 'execute'> & {
      execute?: ((args: any, context?: any) => any) | undefined
    })
  | (Omit<ToolDefinitionInstance<any, any, string, any, boolean>, 'execute'> & {
      execute?: ((args: any, context?: any) => any) | undefined
    })

/**
 * Extract the tool name as a literal type
 */
export type InferToolName<T> = T extends { name: infer N } ? N : never

/**
 * Extract the input type from a tool (inferred from Standard JSON Schema, or `unknown` for plain JSONSchema)
 */
export type InferToolInput<T> = T extends { inputSchema?: infer TInput }
  ? TInput extends StandardJSONSchemaV1<infer TInferred, unknown>
    ? TInferred
    : TInput extends JSONSchema
      ? unknown
      : unknown
  : unknown

/**
 * Extract the output type from a tool (inferred from Standard JSON Schema, or `unknown` for plain JSONSchema)
 */
export type InferToolOutput<T> = T extends { outputSchema?: infer TOutput }
  ? TOutput extends StandardJSONSchemaV1<infer TInferred, unknown>
    ? TInferred
    : TOutput extends JSONSchema
      ? unknown
      : unknown
  : unknown

/**
 * Tool definition configuration
 */
export interface ToolDefinitionConfig<
  TInput extends SchemaInput = SchemaInput,
  TOutput extends SchemaInput = SchemaInput,
  TName extends string = string,
  TNeedsApproval extends boolean = false,
> {
  name: TName
  description: string
  inputSchema?: TInput
  outputSchema?: TOutput
  needsApproval?: TNeedsApproval
  lazy?: boolean
  metadata?: Record<string, unknown>
}

/**
 * Tool definition builder that allows creating server or client tools from a shared definition
 */
export interface ToolDefinition<
  TInput extends SchemaInput = SchemaInput,
  TOutput extends SchemaInput = SchemaInput,
  TName extends string = string,
  TNeedsApproval extends boolean = false,
> extends ToolDefinitionInstance<
  TInput,
  TOutput,
  TName,
  unknown,
  TNeedsApproval
> {
  /**
   * Create a server-side tool with execute function
   */
  server: <TContext = unknown>(
    execute: ToolExecuteFunction<TInput, TOutput, TContext>,
  ) => ServerTool<TInput, TOutput, TName, TContext>

  /**
   * Create a client-side tool with optional execute function.
   * Carries the definition's `needsApproval` literal through to the client
   * tool so the tool-call part's `approval` field stays gated on it.
   */
  client: <TContext = unknown>(
    execute?: ToolExecuteFunction<TInput, TOutput, TContext>,
  ) => ClientTool<TInput, TOutput, TName, TContext, TNeedsApproval>
}

/**
 * Create an isomorphic tool definition that can be used directly or instantiated for server/client
 *
 * The definition contains all tool metadata (name, description, schemas) and can be:
 * 1. Used directly in chat() on the server (as a tool definition without execute)
 * 2. Instantiated as a server tool with .server()
 * 3. Instantiated as a client tool with .client()
 *
 * Supports any Standard JSON Schema compliant library (Zod v4+, ArkType, Valibot, etc.)
 * or plain JSON Schema objects.
 *
 * @example
 * ```typescript
 * import { toolDefinition } from '@tanstack/ai';
 * import { z } from 'zod';
 *
 * // Using Zod (natively supports Standard JSON Schema)
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
  TInput extends SchemaInput = SchemaInput,
  TOutput extends SchemaInput = SchemaInput,
  TName extends string = string,
  // `const` forces the literal (`true` / `false`) to be captured from the
  // config's optional `needsApproval` — without it TS widens to `boolean`,
  // which collapses the approval gate in `ToolCallPartForTool`.
  const TNeedsApproval extends boolean = false,
>(
  config: ToolDefinitionConfig<TInput, TOutput, TName, TNeedsApproval>,
): ToolDefinition<TInput, TOutput, TName, TNeedsApproval> {
  const definition: ToolDefinition<TInput, TOutput, TName, TNeedsApproval> = {
    __toolSide: 'definition',
    ...config,
    server<TContext = unknown>(
      execute: ToolExecuteFunction<TInput, TOutput, TContext>,
    ): ServerTool<TInput, TOutput, TName, TContext> {
      return {
        __toolSide: 'server',
        ...config,
        execute,
      }
    },

    client<TContext = unknown>(
      execute?: ToolExecuteFunction<TInput, TOutput, TContext>,
    ): ClientTool<TInput, TOutput, TName, TContext, TNeedsApproval> {
      return {
        __toolSide: 'client',
        ...config,
        ...(execute !== undefined && { execute }),
      }
    },
  }

  return definition
}
