import type {
  AnyActivityTypeDefinition,
  AnyClientTool,
  BuiltInActivityPart,
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
  SubagentClientAgent,
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
  | 'activity'
  | 'toolCall'
  | 'toolResult'
  | 'structuredOutput'
  | 'uiResource'
  | 'subagent'

export type ChatUIPartTypeByKey = {
  text: 'text'
  image: 'image'
  audio: 'audio'
  video: 'video'
  document: 'document'
  thinking: 'thinking'
  activity: 'activity'
  toolCall: 'tool-call'
  toolResult: 'tool-result'
  structuredOutput: 'structured-output'
  uiResource: 'ui-resource'
  subagent: 'subagent'
}

export type ChatUIPartOf<
  TOptions,
  TKey extends ChatUIPartKey = ChatUIPartKey,
> = TKey extends ChatUIPartKey
  ? Extract<
      MessagePart<
        ChatUIToolsOf<TOptions>,
        ChatUIData<TOptions>,
        undefined,
        ChatUIActivitiesOf<TOptions>
      >,
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

/**
 * The `activities` of the options. Options with no `activities` give an empty
 * list, so the UI types the built-in activity types in all cases.
 */
export type ChatUIActivitiesOf<TOptions> = TOptions extends {
  activities?: infer TActivities
}
  ? [Exclude<TActivities, undefined>] extends [never]
    ? readonly []
    : Exclude<
          TActivities,
          undefined
        > extends ReadonlyArray<AnyActivityTypeDefinition>
      ? Exclude<TActivities, undefined>
      : readonly []
  : readonly []

/**
 * The activity type names of the options: the built-in names plus the names
 * in `activities`. Use it as the key of a map of activity components.
 */
export type ChatUIActivityType<TOptions> =
  | BuiltInActivityPart['activityType']
  | ChatUIActivitiesOf<TOptions>[number]['activityType']

/** The activity part of one activity type name, with its typed `content`. */
export type ChatUIActivityPartOf<
  TOptions,
  K extends ChatUIActivityType<TOptions>,
> = Extract<ChatUIPartOf<TOptions, 'activity'>, { activityType: K }>

type RootInterruptsOf<TOptions> = TOptions extends {
  interrupts: infer TInterrupts
}
  ? TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>
    ? TInterrupts
    : readonly []
  : readonly []

type AgentInterrupts<TOptions> = ConcreteItems<
  AgentField<ChatUISubagentsOf<TOptions>[number], 'interrupts', readonly []>
>

/** The root `interrupts` plus every child agent's `interrupts`. */
export type ChatUIInterruptsOf<TOptions> = [AgentInterrupts<TOptions>] extends [
  never,
]
  ? RootInterruptsOf<TOptions>
  : ReadonlyArray<
      | RootInterruptsOf<TOptions>[number]
      | Extract<
          AgentInterrupts<TOptions>,
          InterruptDefinition<any, any, any, any>
        >
    >

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

/** The agents in `options.subagents`, or an empty list. */
export type ChatUISubagentsOf<TOptions> = TOptions extends {
  subagents?: infer TAgents
}
  ? Exclude<TAgents, undefined> extends ReadonlyArray<SubagentClientAgent>
    ? Exclude<TAgents, undefined>
    : readonly []
  : readonly []

export type ChatUISubagentName<TOptions> =
  ChatUISubagentsOf<TOptions>[number]['name']

/** The agent in `options.subagents` with this name. */
export type ChatUISubagentOf<TOptions, TName> = Extract<
  ChatUISubagentsOf<TOptions>[number],
  { name: TName }
>

type AgentField<TAgent, TKey extends string, TFallback> = TAgent extends {
  [K in TKey]?: infer TValue
}
  ? [Exclude<TValue, undefined>] extends [never]
    ? TFallback
    : Exclude<TValue, undefined>
  : TFallback

/**
 * One child agent seen as chat options, so the part, tool, and interrupt
 * types read that agent's `tools`, `interrupts`, and `outputSchema`. An
 * unknown name gives untyped options.
 */
export type ChatUISubagentOptions<TOptions, TName> = [
  ChatUISubagentOf<TOptions, TName>,
] extends [never]
  ? {}
  : ChatUISubagentOf<TOptions, TName> extends infer TAgent
    ? {
        tools: AgentField<TAgent, 'tools', readonly []>
        interrupts: AgentField<TAgent, 'interrupts', readonly []>
        outputSchema: AgentField<TAgent, 'outputSchema', undefined>
      }
    : {}

type ConcreteItems<TList> = unknown extends TList
  ? never
  : TList extends ReadonlyArray<infer TItem>
    ? TItem
    : never

type AgentTools<TOptions> = ConcreteItems<
  AgentField<ChatUISubagentsOf<TOptions>[number], 'tools', readonly []>
>

/**
 * The tools whose approvals can reach this chat: the root `tools` plus every
 * child agent's `tools`.
 */
export type ChatUIApprovalToolsOf<TOptions> = [
  ConcreteItems<ChatUIToolsOf<TOptions>> | AgentTools<TOptions>,
] extends [never]
  ? ChatUIToolsOf<TOptions>
  : ReadonlyArray<
      Extract<
        ConcreteItems<ChatUIToolsOf<TOptions>> | AgentTools<TOptions>,
        AnyClientTool
      >
    >

export type ChatUIApprovalToolName<TOptions> =
  ChatUIApprovalToolsOf<TOptions>[number] extends infer TTool
    ? TTool extends AnyClientTool
      ? TTool['name']
      : string
    : string

export type ChatUIHasNamedSubagents<TOptions> = [
  ChatUISubagentName<TOptions>,
] extends [never]
  ? false
  : [string] extends [ChatUISubagentName<TOptions>]
    ? false
    : true

export type ChatUINamedInterruptId<TOptions> = Exclude<
  ChatUIRegisteredInterruptId<TOptions>,
  'fallback'
>

type ChatUIHasNamedApprovalTools<TOptions> = [
  ChatUIApprovalToolName<TOptions>,
] extends [never]
  ? false
  : [string] extends [ChatUIApprovalToolName<TOptions>]
    ? false
    : true

export type ChatUIInterruptName<TOptions> =
  | (ChatUIHasNamedApprovalTools<TOptions> extends true
      ? ChatUIApprovalToolName<TOptions>
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
  TName extends string = ChatUIApprovalToolName<TOptions>,
> = Extract<
  ChatInterrupt<ChatUIApprovalToolsOf<TOptions>, ChatUIInterruptsOf<TOptions>>,
  { kind: 'tool-approval'; toolName: TName }
>

export type ChatUIToolPart<
  TOptions,
  TName extends ChatUIToolName<TOptions> = ChatUIToolName<TOptions>,
> = {
  key: 'toolCall'
  part: Extract<ToolCallPart<ChatUIToolsOf<TOptions>>, { name: TName }>
  result?: ToolResultPart
  interrupt?: ChatUIToolApproval<TOptions, TName>
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
        ChatUIHasNamedApprovalTools<TOptions> extends true
          ? ChatUIApprovalToolName<TOptions>
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

export type ChatUISelectedPartOf<
  TOptions,
  TKey extends ChatUIPartKey = ChatUIPartKey,
> = TKey extends 'toolCall'
  ? ChatUIToolPart<TOptions>
  : TKey extends 'toolResult'
    ? ChatUISelectedResultPart
    : {
        key: TKey
        part: ChatUIPartOf<TOptions, TKey>
      }

export type ChatUISelectedMessage<
  TActivities extends ReadonlyArray<AnyActivityTypeDefinition> | undefined =
    undefined,
> = {
  message: UIMessage<any, unknown, undefined, TActivities>
  parts: Array<ChatUISelectedPart>
}

export type ChatUISelection<
  TActivities extends ReadonlyArray<AnyActivityTypeDefinition> | undefined =
    undefined,
> = {
  messages: Array<ChatUISelectedMessage<TActivities>>
  interrupts: Array<ChatUIInterrupt>
}

/**
 * The input of `selectChatUI`. `TActivities` keeps the activity types of the
 * messages, so a message with typed activity parts fits without a cast.
 */
export type ChatUISelectInput<
  TActivities extends ReadonlyArray<AnyActivityTypeDefinition> | undefined =
    undefined,
> = {
  messages: ReadonlyArray<UIMessage<any, unknown, undefined, TActivities>>
  interrupts?: ReadonlyArray<ChatUIInterrupt>
  inlineToolNames?: ReadonlyArray<string>
}

export type ChatUIMessages<TOptions> = Array<
  UIMessage<
    ChatUIToolsOf<TOptions>,
    ChatUIData<TOptions>,
    undefined,
    ChatUIActivitiesOf<TOptions>
  >
>

export type ChatUIStructuredPart<TOptions> = StructuredOutputPart<
  ChatUIData<TOptions>
>
