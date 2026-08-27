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

declare const toolApprovalCapability: unique symbol

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

export interface ClientTool<
  TInput extends SchemaInput | undefined = undefined,
  TOutput extends SchemaInput | undefined = undefined,
  TName extends string = string,
  TContext = unknown,
  TNeedsApproval extends boolean = false,
  TApprovalSchema extends ApprovalSchemaConfig | undefined = undefined,
> extends ToolApprovalCapabilityMarker<TNeedsApproval, TApprovalSchema> {
  __toolSide: 'client'
  name: TName
  description: string
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

export type InferToolName<T> = T extends { name: infer N } ? N : never

export type InferToolInput<T> = T extends { inputSchema?: infer TInput }
  ? TInput extends JSONSchema
    ? unknown
    : InferSchemaType<TInput>
  : unknown

export type InferToolOutput<T> = T extends { outputSchema?: infer TOutput }
  ? TOutput extends StandardJSONSchemaV1<any, any>
    ? InferSchemaType<TOutput>
    : TOutput extends StandardSchemaV1<any, any>
      ? InferSchemaType<TOutput>
      : TOutput extends JSONSchema
        ? unknown
        : InferSchemaType<TOutput>
  : unknown

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

export function toolDefinition<
  TInput extends SchemaInput | undefined = undefined,
  TOutput extends SchemaInput | undefined = undefined,
  TName extends string = string,
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
  const isOrphanApprovalSchema =
    config.approvalSchema !== undefined && config.needsApproval !== true
  if (isOrphanApprovalSchema) {
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
