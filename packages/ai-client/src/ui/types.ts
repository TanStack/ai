import type {
  AnyClientTool,
  InferSchemaType,
  InferToolInput,
  InferToolOutput,
  InterruptDefinition,
  SchemaInput,
} from '@tanstack/ai/client'
import type {
  ChatInterrupt,
  MessagePart,
  RegisteredGenericInterrupt,
  StructuredOutputPart,
  ToolApprovalInterrupt,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '../types'

export type ChatUIPartKey =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'thinking'
  | 'toolCall'
  | 'toolResult'
  | 'structuredOutput'
  | 'uiResource'

export type ChatUIToolsOf<TOptions> = TOptions extends {
  tools: infer TTools
}
  ? TTools extends ReadonlyArray<AnyClientTool>
    ? TTools
    : ReadonlyArray<AnyClientTool>
  : ReadonlyArray<AnyClientTool>

export type ChatUIInterruptsOf<TOptions> = TOptions extends {
  interrupts: infer TInterrupts
}
  ? TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>
    ? TInterrupts
    : readonly []
  : readonly []

export type ChatUISchemaOf<TOptions> = TOptions extends {
  outputSchema: infer TSchema
}
  ? TSchema extends SchemaInput
    ? TSchema
    : undefined
  : undefined

export type ChatUIData<TOptions> = TOptions extends {
  outputSchema: infer TSchema
}
  ? TSchema extends SchemaInput
    ? InferSchemaType<TSchema>
    : unknown
  : unknown

export type ChatUIToolName<TOptions> =
  ChatUIToolsOf<TOptions>[number] extends infer TTool
    ? TTool extends AnyClientTool
      ? TTool['name']
      : string
    : string

export type ChatUIRegisteredInterruptId<TOptions> =
  ChatUIInterruptsOf<TOptions>[number] extends infer TDefinition
    ? TDefinition extends InterruptDefinition<infer TId, any, any, any>
      ? TId
      : string
    : string

type ToolByName<TOptions, TName> = Extract<
  ChatUIToolsOf<TOptions> extends ReadonlyArray<infer TTool> ? TTool : never,
  { name: TName }
>

export type ChatUIInterrupt = ChatInterrupt | ToolApprovalInterrupt

export type ChatUIToolPart<
  TOptions,
  TName extends ChatUIToolName<TOptions> = ChatUIToolName<TOptions>,
> = {
  key: 'toolCall'
  part: Extract<ToolCallPart<ChatUIToolsOf<TOptions>>, { name: TName }>
  result?: ToolResultPart
  interrupt?: Extract<
    ChatInterrupt<ChatUIToolsOf<TOptions>, ChatUIInterruptsOf<TOptions>>,
    { kind: 'tool-approval'; toolName: TName }
  >
  input?: InferToolInput<ToolByName<TOptions, TName>>
  output?: InferToolOutput<ToolByName<TOptions, TName>>
}

export type RegisteredUIInterrupt<
  TOptions,
  TId extends ChatUIRegisteredInterruptId<TOptions> =
    ChatUIRegisteredInterruptId<TOptions>,
> = Extract<
  RegisteredGenericInterrupt<ChatUIInterruptsOf<TOptions>>,
  { definitionId: TId }
>

export type ChatUISelectedToolPart = {
  key: 'toolCall'
  part: ToolCallPart
  result?: ToolResultPart
  interrupt?: ChatUIInterrupt
  input?: unknown
  output?: unknown
}

export type ChatUISelectedResultPart = {
  key: 'toolResult'
  part: ToolResultPart
  matched: boolean
}

export type ChatUISelectedGenericPart = {
  key: Exclude<ChatUIPartKey, 'toolCall' | 'toolResult'>
  part: MessagePart
}

export type ChatUISelectedPart =
  | ChatUISelectedToolPart
  | ChatUISelectedResultPart
  | ChatUISelectedGenericPart

export type ChatUISelectedMessage = {
  message: UIMessage
  parts: Array<ChatUISelectedPart>
}

export type ChatUISelection = {
  messages: Array<ChatUISelectedMessage>
  interrupts: Array<ChatUIInterrupt>
}

export type ChatUISelectInput = {
  messages: ReadonlyArray<UIMessage>
  interrupts?: ReadonlyArray<ChatUIInterrupt>
  inlineToolNames?: ReadonlyArray<string>
}

export type ChatUIMessages<TOptions> = Array<
  UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
>

export type ChatUIStructuredPart<TOptions> = StructuredOutputPart<
  ChatUIData<TOptions>
>
