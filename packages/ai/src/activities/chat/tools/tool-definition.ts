import type {
  InferSchemaType,
  JSONSchema,
  SchemaInput,
  Tool,
  ToolExecuteFunction,
} from '../../../types'
import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'

export declare const toolApprovalCapability: unique symbol

export interface ToolApprovalCapabilityMarker<
  TNeedsApproval extends boolean,
  TApprovalSchema,
> {
  readonly [toolApprovalCapability]?: {
    needsApproval: TNeedsApproval
    approvalSchema: TApprovalSchema
  }
}

export type ApprovalSchemaConfig =
  | SchemaInput
  | { approve: SchemaInput; reject?: SchemaInput }
  | { approve?: SchemaInput; reject: SchemaInput }

type ApprovalConfig<
  TNeedsApproval extends boolean,
  TApprovalSchema extends ApprovalSchemaConfig | undefined,
> = TNeedsApproval extends true
  ? { needsApproval: TNeedsApproval; approvalSchema?: TApprovalSchema }
  : { needsApproval?: TNeedsApproval; approvalSchema?: never }

export type ApprovalCapabilityOf<TTool> =
  TTool extends ToolApprovalCapabilityMarker<infer TNeeds, unknown>
    ? TNeeds
    : false

export type ApprovalSchemaOf<TTool> =
  TTool extends ToolApprovalCapabilityMarker<boolean, infer TSchema>
    ? TSchema
    : undefined

export declare const noSchema: unique symbol
export type NoSchema = typeof noSchema

export type InputSchemaOf<TTool> = TTool extends {
  inputSchema: infer TInput
}
  ? TInput extends undefined
    ? NoSchema
    : TInput
  : NoSchema

export type OutputSchemaOf<TTool> = TTool extends {
  outputSchema: infer TOutput
}
  ? TOutput extends undefined
    ? NoSchema
    : TOutput
  : NoSchema

type BuiltToolSchemaFields<
  TInput extends SchemaInput | undefined,
  TOutput extends SchemaInput | undefined,
  TApprovalSchema extends ApprovalSchemaConfig | undefined,
> = {
  inputSchema: TInput
  outputSchema: TOutput
  approvalSchema: TApprovalSchema
}

/**
 * Marker type for server-side tools
 */
export interface ServerTool<
  TInput extends SchemaInput | undefined = undefined,
  TOutput extends SchemaInput | undefined = undefined,
  TName extends string = string,
  TContext = unknown,
  TNeedsApproval extends boolean = false,
  TApprovalSchema extends ApprovalSchemaConfig | undefined = undefined,
>
  extends
    Tool<TInput, TOutput, TName, TContext>,
    ToolApprovalCapabilityMarker<TNeedsApproval, TApprovalSchema> {
  __toolSide: 'server'
  inputSchema?: TInput
  outputSchema?: TOutput
  needsApproval?: TNeedsApproval
  approvalSchema?: TApprovalSchema
}

/**
 * Marker type for client-side tools
 */
export interface ClientTool<
  TInput extends SchemaInput | undefined = undefined,
  TOutput extends SchemaInput | undefined = undefined,
  TName extends string = string,
  TContext = unknown,
  // Captured as a literal (`true` / `false`) so downstream types — notably
  // the tool-call part's `approval` field — can be gated on it. Defaults to
  // `false` when the tool config omits `needsApproval`.
  TNeedsApproval extends boolean = false,
  TApprovalSchema extends ApprovalSchemaConfig | undefined = undefined,
> extends ToolApprovalCapabilityMarker<TNeedsApproval, TApprovalSchema> {
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
  approvalSchema?: TApprovalSchema
  lazy?: boolean
  metadata?: Record<string, unknown>
  execute?: ToolExecuteFunction<TInput, TOutput, TContext>
}

/** Broad server-tool shape for heterogeneous internal collections. */
export type AnyServerTool = Omit<
  ServerTool<any, any, string, any, boolean, any>,
  'execute'
> & {
  execute?: ((args: any, context?: any) => any) | undefined
}

/**
 * Tool definition that can be used directly or instantiated for server/client
 */
export interface ToolDefinitionInstance<
  TInput extends SchemaInput | undefined = undefined,
  TOutput extends SchemaInput | undefined = undefined,
  TName extends string = string,
  TContext = unknown,
  TNeedsApproval extends boolean = false,
  TApprovalSchema extends ApprovalSchemaConfig | undefined = undefined,
> extends Tool<TInput, TOutput, TName, TContext> {
  __toolSide: 'definition'
  // Narrow the base `needsApproval?: boolean` to the captured literal so it
  // survives into `ToolCallPartForTool`'s approval gate.
  inputSchema: TInput
  outputSchema: TOutput
  needsApproval?: TNeedsApproval
  approvalSchema: TApprovalSchema
  readonly [toolApprovalCapability]?: {
    needsApproval: TNeedsApproval
    approvalSchema: TApprovalSchema
  }
}

/**
 * Union type for any kind of client-side tool (client tool or definition)
 */
export type AnyClientTool =
  | (Omit<ClientTool<any, any, string, any, boolean, any>, 'execute'> & {
      execute?: ((args: any, context?: any) => any) | undefined
    })
  | (Omit<
      ToolDefinitionInstance<any, any, string, any, boolean, any>,
      'execute'
    > & {
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
  ? TInput extends JSONSchema
    ? unknown
    : InferSchemaType<TInput>
  : unknown

/**
 * Extract the output type from a tool (inferred from Standard JSON Schema, or `unknown` for plain JSONSchema)
 */
export type InferToolOutput<T> = T extends { outputSchema?: infer TOutput }
  ? TOutput extends StandardJSONSchemaV1<any, any>
    ? InferSchemaType<TOutput>
    : TOutput extends StandardSchemaV1<any, any>
      ? InferSchemaType<TOutput>
      : TOutput extends JSONSchema
        ? unknown
        : InferSchemaType<TOutput>
  : unknown

/**
 * Tool definition configuration
 */
export type ToolDefinitionConfig<
  TInput extends SchemaInput | undefined = undefined,
  TOutput extends SchemaInput | undefined = undefined,
  TName extends string = string,
  TNeedsApproval extends boolean = false,
  TApprovalSchema extends ApprovalSchemaConfig | undefined = undefined,
> = {
  name: TName
  description: string
  inputSchema?: TInput
  outputSchema?: TOutput
  lazy?: boolean
  metadata?: Record<string, unknown>
} & ApprovalConfig<TNeedsApproval, TApprovalSchema>

/**
 * Tool definition builder that allows creating server or client tools from a shared definition
 */
export interface ToolDefinition<
  TInput extends SchemaInput | undefined = undefined,
  TOutput extends SchemaInput | undefined = undefined,
  TName extends string = string,
  TNeedsApproval extends boolean = false,
  TApprovalSchema extends ApprovalSchemaConfig | undefined = undefined,
> extends ToolDefinitionInstance<
  TInput,
  TOutput,
  TName,
  unknown,
  TNeedsApproval,
  TApprovalSchema
> {
  /**
   * Create a server-side tool with execute function
   */
  server: <TContext = unknown>(
    execute: ToolExecuteFunction<TInput, TOutput, TContext>,
  ) => ServerTool<
    TInput,
    TOutput,
    TName,
    TContext,
    TNeedsApproval,
    TApprovalSchema
  > &
    BuiltToolSchemaFields<TInput, TOutput, TApprovalSchema>

  /**
   * Create a client-side tool with optional execute function.
   * Carries the definition's `needsApproval` literal through to the client
   * tool so the tool-call part's `approval` field stays gated on it.
   */
  client: <TContext = unknown>(
    execute?: ToolExecuteFunction<TInput, TOutput, TContext>,
  ) => ClientTool<
    TInput,
    TOutput,
    TName,
    TContext,
    TNeedsApproval,
    TApprovalSchema
  > &
    BuiltToolSchemaFields<TInput, TOutput, TApprovalSchema>
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
  TInput extends SchemaInput | undefined = undefined,
  TOutput extends SchemaInput | undefined = undefined,
  TName extends string = string,
  // `const` forces the literal (`true` / `false`) to be captured from the
  // config's optional `needsApproval` — without it TS widens to `boolean`,
  // which collapses the approval gate in `ToolCallPartForTool`.
  const TNeedsApproval extends boolean = false,
  TApprovalSchema extends ApprovalSchemaConfig | undefined = undefined,
>(
  config: ToolDefinitionConfig<
    TInput,
    TOutput,
    TName,
    TNeedsApproval,
    TApprovalSchema
  >,
): ToolDefinition<TInput, TOutput, TName, TNeedsApproval, TApprovalSchema> {
  if (config.approvalSchema !== undefined && config.needsApproval !== true) {
    throw new TypeError('approvalSchema requires needsApproval: true.')
  }
  const inputSchema = config.inputSchema as TInput
  const outputSchema = config.outputSchema as TOutput
  const approvalSchema = config.approvalSchema as TApprovalSchema
  const needsApproval = config.needsApproval as TNeedsApproval | undefined

  const definition: ToolDefinition<
    TInput,
    TOutput,
    TName,
    TNeedsApproval,
    TApprovalSchema
  > = {
    __toolSide: 'definition',
    ...config,
    inputSchema,
    outputSchema,
    approvalSchema,
    needsApproval,
    server<TContext = unknown>(
      execute: ToolExecuteFunction<TInput, TOutput, TContext>,
    ): ServerTool<
      TInput,
      TOutput,
      TName,
      TContext,
      TNeedsApproval,
      TApprovalSchema
    > &
      BuiltToolSchemaFields<TInput, TOutput, TApprovalSchema> {
      return {
        __toolSide: 'server',
        ...config,
        inputSchema,
        outputSchema,
        approvalSchema,
        needsApproval,
        execute,
      }
    },

    client<TContext = unknown>(
      execute?: ToolExecuteFunction<TInput, TOutput, TContext>,
    ): ClientTool<
      TInput,
      TOutput,
      TName,
      TContext,
      TNeedsApproval,
      TApprovalSchema
    > &
      BuiltToolSchemaFields<TInput, TOutput, TApprovalSchema> {
      return {
        __toolSide: 'client',
        ...config,
        inputSchema,
        outputSchema,
        approvalSchema,
        needsApproval,
        ...(execute !== undefined && { execute }),
      }
    },
  }

  return definition
}
