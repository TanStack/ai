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
  QueuedMessage,
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

export type ChatUIPartTypeByKey = {
  text: 'text'
  image: 'image'
  audio: 'audio'
  video: 'video'
  document: 'document'
  thinking: 'thinking'
  toolCall: 'tool-call'
  toolResult: 'tool-result'
  structuredOutput: 'structured-output'
  uiResource: 'ui-resource'
}

export type ChatUIPartOf<
  TOptions,
  TKey extends ChatUIPartKey = ChatUIPartKey,
> = TKey extends ChatUIPartKey
  ? Extract<
      MessagePart<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>,
      { type: ChatUIPartTypeByKey[TKey] }
    >
  : never

export type ChatUIToolsOf<TOptions> = TOptions extends {
  tools: infer TTools
}
  ? TTools extends ReadonlyArray<AnyClientTool>
    ? TTools
    : any
  : any

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

export type ChatUIHasNamedTools<TOptions> = [ChatUIToolName<TOptions>] extends [
  never,
]
  ? false
  : [string] extends [ChatUIToolName<TOptions>]
    ? false
    : true

export type ChatUIHasNamedInterrupts<TOptions> = [
  ChatUIRegisteredInterruptId<TOptions>,
] extends [never]
  ? false
  : [string] extends [ChatUIRegisteredInterruptId<TOptions>]
    ? false
    : true

export type ChatUINamedInterruptId<TOptions> = Exclude<
  ChatUIRegisteredInterruptId<TOptions>,
  'fallback'
>

export type ChatUIInterruptName<TOptions> =
  | (ChatUIHasNamedTools<TOptions> extends true
      ? ChatUIToolName<TOptions>
      : never)
  | (ChatUIHasNamedInterrupts<TOptions> extends true
      ? ChatUINamedInterruptId<TOptions>
      : never)

type ToolByName<TOptions, TName> = Extract<
  ChatUIToolsOf<TOptions> extends ReadonlyArray<infer TTool> ? TTool : never,
  { name: TName }
>

export type ChatUIInterrupt = ChatInterrupt | ToolApprovalInterrupt

export type ChatUIToolApproval<
  TOptions,
  TName extends ChatUIToolName<TOptions> = ChatUIToolName<TOptions>,
> = Extract<
  ChatInterrupt<ChatUIToolsOf<TOptions>, ChatUIInterruptsOf<TOptions>>,
  { kind: 'tool-approval'; toolName: TName }
>

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

export type ChatUIInterruptOf<
  TOptions,
  TName extends ChatUIInterruptName<TOptions> = never,
> = [TName] extends [never]
  ? ChatUIInterrupt
  : TName extends (
        ChatUIHasNamedTools<TOptions> extends true
          ? ChatUIToolName<TOptions>
          : never
      )
    ? ChatUIToolApproval<TOptions, TName>
    : TName extends ChatUINamedInterruptId<TOptions>
      ? RegisteredUIInterrupt<TOptions, TName>
      : ChatUIInterrupt

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

/**
 * A queued send with `cancelQueued` bound to that item.
 * Layout calls `item.cancelQueued()` to drop it before it drains.
 */
export type ChatUIQueueItem = QueuedMessage & {
  cancelQueued: () => void
}
