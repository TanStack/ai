import { createContext, memo, useContext, useMemo } from 'react'
import type { ComponentProps, ComponentType, Context, ReactNode } from 'react'
import {
  automaticPartsForMessage,
  collectInlineToolNames,
  resolveInterruptComponent,
  selectChatUI,
  selectMessageUI,
} from '@tanstack/ai-client/ui'
import type {
  ChatUIApprovalToolName,
  ChatUIData,
  ChatUIHasNamedInterrupts,
  ChatUIHasNamedSubagents,
  ChatUIHasNamedTools,
  ChatUIInterrupt,
  ChatUIInterruptName,
  ChatUIInterruptOf,
  ChatUIInterruptsOf,
  ChatUIMessages,
  ChatUINamedInterruptId,
  ChatUIPartKey,
  ChatUIPartOf,
  ChatUISchemaOf,
  ChatUISelectedPart,
  ChatUISelectedPartOf,
  ChatUISubagentName,
  ChatUISubagentOf,
  ChatUISubagentOptions,
  ChatUIToolApproval,
  ChatUIToolName,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import type {
  MessagePart,
  QueuedMessage,
  SubagentHandle,
  SubagentHandles,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '@tanstack/ai-client'
import type { UseChatReturn } from '../types'
import { defaultChatUIContexts } from './create-ui-contexts'
import type { ChatUIContexts } from './create-ui-contexts'

export type ChatUIHost<TOptions = unknown> = UseChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

export type ChatUIQueueItem = QueuedMessage & {
  cancelQueued: () => void
}

export type LayoutProps<
  TOptions,
  TInput extends ComponentType<any> | undefined = ComponentType<
    InputProps<TOptions>
  >,
> = {
  Messages: ComponentType
  Interrupts: ComponentType
  Queue: ComponentType
  Subagents: ComponentType
  readonly __ui?: TOptions
} & (TInput extends ComponentType<any> ? { Input: ComponentType } : {})

export type MessageProps<TOptions> = {
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  Parts: ComponentType
}

export type InputProps<TOptions> = {
  readonly __ui?: TOptions
}

export type QueueProps<TOptions> = {
  item: ChatUIQueueItem
  readonly __ui?: TOptions
}

export type PartProps<TOptions, TKey extends ChatUIPartKey = ChatUIPartKey> = {
  part: ChatUIPartOf<TOptions, TKey>
}

/**
 * Widgets for one subagent card. Each entry replaces the enclosing entry of
 * the same key: the root map at top level, the outer card's map when nested.
 * It applies to this card and the children nested in it. An unset key keeps
 * the enclosing entry. Tool names and tool props come from that agent's
 * `tools`.
 */
export type SubagentPartsProps<
  TOptions,
  TName extends ChatUISubagentName<TOptions> = ChatUISubagentName<TOptions>,
> = {
  partsComponents?: ChatUIPartsComponents<
    ChatUISubagentOptions<TOptions, TName>
  >
  toolsComponents?: {
    [K in ChatUIToolName<
      ChatUISubagentOptions<TOptions, TName>
    >]?: ComponentType<ToolProps<ChatUISubagentOptions<TOptions, TName>, K>>
  }
}

export type SubagentProps<
  TOptions,
  TName extends ChatUISubagentName<TOptions> = ChatUISubagentName<TOptions>,
> = {
  subagent: [ChatUISubagentOf<TOptions, TName>] extends [never]
    ? SubagentHandle & { name: TName }
    : SubagentHandles<ReadonlyArray<ChatUISubagentOf<TOptions, TName>>>
  Parts: ComponentType<SubagentPartsProps<TOptions, TName>>
  readonly __ui?: TOptions
}

export type ToolProps<
  TOptions,
  TName extends ChatUIToolName<TOptions> = ChatUIToolName<TOptions>,
> = {
  part: Extract<ToolCallPart<ChatUIToolsOf<TOptions>>, { name: TName }>
  result?: ToolResultPart
  interrupt?: ChatUIToolApproval<TOptions, TName>
}

export type InterruptProps<
  TOptions,
  TName extends ChatUIInterruptName<TOptions> = never,
> = {
  interrupt: ChatUIInterruptOf<TOptions, TName>
  readonly __ui?: TOptions
}

type GenericInterruptComponents<TOptions> =
  ChatUIHasNamedInterrupts<TOptions> extends true
    ? {
        [K in ChatUINamedInterruptId<TOptions>]: ComponentType<
          InterruptProps<TOptions, K & ChatUIInterruptName<TOptions>>
        >
      } & {
        fallback?: ComponentType<InterruptProps<TOptions>>
      }
    : {
        fallback?: ComponentType<InterruptProps<TOptions>>
      }

type ToolApprovalMap<TOptions> = {
  [K in ChatUIApprovalToolName<TOptions>]?: ComponentType<
    InterruptProps<TOptions, K & ChatUIInterruptName<TOptions>>
  >
}

/** The chrome around the message list: `layout`, `message`, and `input`. */
export type ChatUIChromeComponents<
  TOptions,
  TInput extends ComponentType<InputProps<TOptions>> | undefined =
    ComponentType<InputProps<TOptions>>,
> = {
  layout: ComponentType<LayoutProps<TOptions, TInput>>
  message: ComponentType<MessageProps<TOptions>>
  input?: TInput
  queue?: ComponentType<QueueProps<TOptions>>
}

export type ChatUIPartsComponents<TOptions> = {
  [K in ChatUIPartKey]?: ComponentType<PartProps<TOptions, K>>
} & {
  fallback?: ComponentType<PartProps<TOptions>>
}

export type ChatUIInterruptsComponents<TOptions> = {
  tools?: ToolApprovalMap<TOptions>
  generic: GenericInterruptComponents<TOptions>
}

export type ChatUIComponents<
  TOptions,
  TInput extends ComponentType<InputProps<TOptions>> | undefined =
    ComponentType<InputProps<TOptions>>,
> = {
  components: ChatUIChromeComponents<TOptions, TInput>
  partsComponents: ChatUIPartsComponents<TOptions>
} & (ChatUIHasNamedTools<TOptions> extends true
  ? {
      toolsComponents: {
        [K in ChatUIToolName<TOptions>]: ComponentType<ToolProps<TOptions, K>>
      }
    }
  : {
      toolsComponents?: {
        [K in ChatUIToolName<TOptions>]?: ComponentType<ToolProps<TOptions, K>>
      }
    }) &
  (ChatUIHasNamedInterrupts<TOptions> extends true
    ? { interruptsComponents: ChatUIInterruptsComponents<TOptions> }
    : {
        interruptsComponents?: {
          tools?: ToolApprovalMap<TOptions>
          generic?: GenericInterruptComponents<TOptions>
        }
      }) &
  (ChatUIHasNamedSubagents<TOptions> extends true
    ? {
        subagentsComponents: {
          [K in ChatUISubagentName<TOptions>]: ComponentType<
            SubagentProps<TOptions, K>
          >
        }
      }
    : {
        subagentsComponents?: {
          [K in ChatUISubagentName<TOptions>]?: ComponentType<
            SubagentProps<TOptions, K>
          >
        }
      })

/** Scoped contexts, for widgets in other files or nested chat trees. */
export type ChatUIContextConfig = {
  chatContext?: ChatUIContexts['chatContext']
  partContext?: ChatUIContexts['partContext']
  interruptContext?: ChatUIContexts['interruptContext']
}

export type ChatUIFactoryConfig<
  TOptions,
  TInput extends ComponentType<InputProps<TOptions>> | undefined =
    ComponentType<InputProps<TOptions>>,
> = ChatUIComponents<TOptions, TInput> & {
  context?: ChatUIContextConfig
}

type BoundWidget = ComponentType<Record<string, never>>

type PartMixins<TOptions> = {
  [K in ChatUIPartKey]?: BoundWidget
} & {
  [K in ChatUIToolName<TOptions>]: BoundWidget
} & {
  Render: BoundWidget
}

type InterruptMixins<TOptions> = {
  [K in ChatUINamedInterruptId<TOptions>]: BoundWidget
} & {
  [K in ChatUIApprovalToolName<TOptions>]?: BoundWidget
} & {
  fallback?: BoundWidget
  Render: BoundWidget
}

function createWarnOnce() {
  const seen = new Set<string>()
  return (key: string, message: string) => {
    if (process.env.NODE_ENV === 'production') return
    if (seen.has(key)) return
    seen.add(key)
    console.warn(message)
  }
}

function readMessages<TOptions>(chat: ChatUIHost<TOptions>) {
  return chat.messages as ChatUIMessages<TOptions>
}

function readInterrupts<TOptions>(chat: ChatUIHost<TOptions>) {
  return chat.interrupts ?? []
}

function queueItemEqual(
  prev: { item: QueuedMessage; cancelQueued: (id: string) => void },
  next: { item: QueuedMessage; cancelQueued: (id: string) => void },
) {
  return (
    prev.item.id === next.item.id &&
    prev.item.createdAt === next.item.createdAt &&
    prev.item.content === next.item.content &&
    prev.cancelQueued === next.cancelQueued
  )
}

// The handle is one live object that the client updates in place, so a row
// gets its changing card fields as separate props. Messages are not one of
// them: `SubagentMessages` reads them from the chat context, so new child
// text shows without a row render.
type SubagentRowProps = {
  handle: SubagentHandle
  status: SubagentHandle['status']
  error: SubagentHandle['error']
}

function subagentListItemEqual(prev: SubagentRowProps, next: SubagentRowProps) {
  return (
    prev.handle.id === next.handle.id &&
    prev.handle.stop === next.handle.stop &&
    prev.status === next.status &&
    prev.error === next.error
  )
}

function subagentMessagesEqual(
  prev: { messages: SubagentHandle['messages'] },
  next: { messages: SubagentHandle['messages'] },
) {
  return prev.messages === next.messages
}

function selectedPartPropsEqual(
  prev: { selected: ChatUISelectedPart },
  next: { selected: ChatUISelectedPart },
) {
  if (prev.selected.key !== next.selected.key) return false
  if (prev.selected.part !== next.selected.part) return false
  if (prev.selected.key === 'toolCall' && next.selected.key === 'toolCall') {
    return (
      prev.selected.result === next.selected.result &&
      prev.selected.interrupt === next.selected.interrupt
    )
  }
  if (
    prev.selected.key === 'toolResult' &&
    next.selected.key === 'toolResult'
  ) {
    return prev.selected.matched === next.selected.matched
  }
  return true
}

function isSelectedPart(
  value: MessagePart | ChatUISelectedPart,
): value is ChatUISelectedPart {
  return 'key' in value && 'part' in value
}

/** `base` with each set entry of `overrides`. An unset entry keeps `base`. */
function withWidgets(
  base: Record<string, ComponentType<any> | undefined>,
  overrides: Record<string, ComponentType<any> | undefined> | undefined,
) {
  const out = { ...base }
  for (const [key, component] of Object.entries(overrides ?? {})) {
    if (component) out[key] = component
  }
  return out
}

function bindMap(
  map: Record<string, ComponentType<any> | undefined> | undefined,
  bind: (component: ComponentType<any>) => BoundWidget,
) {
  const out: Record<string, BoundWidget> = {}
  for (const [key, component] of Object.entries(map ?? {})) {
    if (component) out[key] = bind(component)
  }
  return out
}

/**
 * Bind chat options and UI widgets once at module scope. This matches Form
 * `createFormHook` and Table `createTableHook`: widgets register here, mix
 * onto Part / Interrupt / the UI kit, and automatic dispatch still walks the
 * message list.
 *
 * `chatOptions` is type-only at runtime. Pass optional `chatContext`,
 * `partContext`, and `interruptContext` from {@link createChatHookContexts}
 * when widgets live in other files or when nested chats need isolation.
 */
export function createChatUI<
  const TOptions,
  TInput extends ComponentType<any> | undefined =
    | ComponentType<InputProps<NoInfer<TOptions>>>
    | undefined,
>(options: TOptions, config: ChatUIFactoryConfig<NoInfer<TOptions>, TInput>) {
  void options
  const {
    context: contextOption,
    components,
    partsComponents: parts,
    toolsComponents: tools,
    interruptsComponents: interrupts,
    subagentsComponents: subagentComponents,
  } = config as ChatUIFactoryConfig<TOptions, TInput> & {
    toolsComponents?: Record<string, ComponentType<any> | undefined>
    interruptsComponents?: {
      tools?: Record<string, ComponentType<any> | undefined>
      generic?: Record<string, ComponentType<any> | undefined>
    }
    subagentsComponents?: Record<string, ComponentType<any> | undefined>
  }
  const {
    layout: Layout,
    message: MessageComponent,
    input: InputComponent,
    queue: QueueItemComponent,
  } = components
  const {
    chatContext: chatContextOption,
    partContext: partContextOption,
    interruptContext: interruptContextOption,
  } = contextOption ?? {}
  const warn = createWarnOnce()
  const ChatContext = (chatContextOption ??
    defaultChatUIContexts.chatContext) as Context<ChatUIHost<TOptions> | null>
  const PartContext = (partContextOption ??
    defaultChatUIContexts.partContext) as Context<ChatUISelectedPart | null>
  const InterruptContext = (interruptContextOption ??
    defaultChatUIContexts.interruptContext) as Context<ChatUIInterrupt | null>
  const inlineToolNames = collectInlineToolNames(
    interrupts?.tools as Record<string, unknown> | undefined,
    Object.keys(tools ?? {}),
  )

  function useChatContext() {
    const chat = useContext(ChatContext)
    if (!chat) {
      throw new Error(
        '`useChatContext` must be used within `UI.Provider` or `UI.Chat`.',
      )
    }
    return chat
  }

  function usePartContext<TKey extends ChatUIPartKey = ChatUIPartKey>() {
    const selected = useContext(PartContext)
    if (!selected) {
      throw new Error(
        '`usePartContext` must be used within `UI.Part` or an automatic part.',
      )
    }
    return selected as ChatUISelectedPartOf<TOptions, TKey>
  }

  function useInterruptContext<
    TName extends ChatUIInterruptName<TOptions> = ChatUIInterruptName<TOptions>,
  >() {
    const interrupt = useContext(InterruptContext)
    if (!interrupt) {
      throw new Error(
        '`useInterruptContext` must be used within `UI.Interrupt`.',
      )
    }
    return interrupt as ChatUIInterruptOf<TOptions, TName>
  }

  function bindPart(Component: ComponentType<PartProps<TOptions>>) {
    return function BoundPart() {
      const selected = usePartContext()
      return <Component part={selected.part as PartProps<TOptions>['part']} />
    }
  }

  function bindTool(Component: ComponentType<ToolProps<TOptions>>) {
    return function BoundTool() {
      const selected = usePartContext()
      if (selected.key !== 'toolCall') return null
      return (
        <Component
          part={selected.part as ToolProps<TOptions>['part']}
          result={selected.result}
          interrupt={selected.interrupt as ToolProps<TOptions>['interrupt']}
        />
      )
    }
  }

  function bindInterrupt(Component: ComponentType<InterruptProps<TOptions>>) {
    return function BoundInterrupt() {
      const interrupt = useInterruptContext()
      return (
        <Component
          interrupt={interrupt as InterruptProps<TOptions>['interrupt']}
        />
      )
    }
  }

  const partMixins = bindMap(
    parts as Record<string, ComponentType<any> | undefined>,
    bindPart,
  )
  const toolMixins = bindMap(
    tools as Record<string, ComponentType<any> | undefined>,
    bindTool,
  )
  const interruptMixins = {
    ...bindMap(
      interrupts?.generic as
        | Record<string, ComponentType<any> | undefined>
        | undefined,
      bindInterrupt,
    ),
    ...bindMap(
      interrupts?.tools as
        | Record<string, ComponentType<any> | undefined>
        | undefined,
      bindInterrupt,
    ),
  }

  function mixPart(selected: ChatUISelectedPart) {
    return Object.assign({}, selected, partMixins, toolMixins, {
      Render: BoundRender,
    }) as ChatUISelectedPart & PartMixins<TOptions>
  }

  function mixInterrupt(interrupt: ChatUIInterrupt) {
    return Object.assign({}, interrupt, interruptMixins, {
      Render: BoundInterruptRender,
    }) as ChatUIInterrupt & InterruptMixins<TOptions>
  }

  function Provider({
    chat,
    children,
  }: {
    chat: ChatUIHost<TOptions>
    children?: ReactNode
  }) {
    return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>
  }

  // Backstop for when the conditional `Input` type cannot be inferred (see the
  // `input` note in docs/ui/react.md). The type hides `Input` when no `input`
  // is registered, but inference degrades on some config shapes, so always
  // supply a component: warn once rather than crash on an undefined element.
  function MissingInput() {
    warn(
      'input',
      '[tanstack-ai-ui] Rendered <Input /> but no `input` component is registered.',
    )
    return null
  }

  // `Messages`, `Interrupts`, `Queue` and `InputComponent` are declared once
  // per factory, so these props are stable for the lifetime of the kit.
  const LayoutSlots = {
    Messages: Messages as ComponentType,
    Interrupts: Interrupts as ComponentType,
    Queue: Queue as ComponentType,
    Subagents: Subagents as ComponentType,
    Input: (InputComponent ?? MissingInput) as ComponentType,
  }

  function Chat({ chat }: { chat: ChatUIHost<TOptions> }) {
    return (
      <Provider chat={chat}>
        <Layout {...(LayoutSlots as ComponentProps<ComponentType<any>>)} />
      </Provider>
    )
  }

  function Queue() {
    const chat = useChatContext()
    if (!QueueItemComponent) return null
    const items = chat.queue
    return (
      <>
        {items.map((item) => (
          <QueueItemView
            key={item.id}
            cancelQueued={chat.cancelQueued}
            item={item}
          />
        ))}
      </>
    )
  }

  const QueueItemView = memo(function QueueItemView({
    item,
    cancelQueued,
  }: {
    item: QueuedMessage
    cancelQueued: (id: string) => void
  }) {
    if (!QueueItemComponent) return null
    return (
      <QueueItemComponent
        item={{
          ...item,
          cancelQueued: () => {
            cancelQueued(item.id)
          },
        }}
      />
    )
  }, queueItemEqual)

  function Messages({
    children,
  }: {
    children?: (messages: ChatUIMessages<TOptions>) => ReactNode
  } = {}) {
    const chat = useChatContext()
    const messages = readMessages(chat)
    const interrupts = readInterrupts(chat)
    if (children) return <>{children(messages)}</>
    return (
      <>
        {messages.map((message) => (
          <MessageView
            key={message.id}
            inlineToolNames={inlineToolNames}
            interrupts={interrupts}
            message={message}
          />
        ))}
      </>
    )
  }

  // Scoped to one message render. `Parts` reads it instead of closing over the
  // message, which is what keeps its identity constant across re-renders — a
  // fresh component per render would remount every part on each stream chunk.
  type MessageRenderValue = {
    message: ChatUIMessages<TOptions>[number]
    interrupts: ReadonlyArray<ChatUIInterrupt>
    inlineToolNames: ReadonlyArray<string>
  }
  const MessageRenderContext = createContext<MessageRenderValue | null>(null)
  const SubagentRenderContext = createContext<{
    handle: SubagentHandle
    /** A `Subagents` row. Its messages come from the live chat state. */
    listed?: true
  } | null>(null)
  // The widgets that dispatch uses. A subagent card's `Parts` can replace
  // entries for its subtree. Outside a card these are the factory maps.
  type WidgetMap = Record<string, ComponentType<any> | undefined>
  const rootWidgets: { parts: WidgetMap; tools: WidgetMap } = {
    parts: parts as WidgetMap,
    tools: tools ?? {},
  }
  const WidgetsContext = createContext(rootWidgets)

  function Parts() {
    const scope = useContext(MessageRenderContext)
    if (!scope) {
      throw new Error('`Parts` must be rendered by a `message` component.')
    }
    return (
      <AutomaticParts
        inlineToolNames={scope.inlineToolNames}
        interrupts={scope.interrupts}
        message={scope.message}
      />
    )
  }

  const MessageView = memo(function MessageView({
    message,
    interrupts,
    inlineToolNames: names,
    children,
  }: {
    message: ChatUIMessages<TOptions>[number]
    interrupts: ReadonlyArray<ChatUIInterrupt>
    inlineToolNames: ReadonlyArray<string>
    children?: (parts: Array<ChatUISelectedPart>) => ReactNode
  }) {
    const selected = selectMessageUI(message, {
      interrupts,
      inlineToolNames: names,
    })
    if (children) return <>{children(selected.parts)}</>
    return (
      <MessageRenderContext.Provider
        value={{ message, interrupts, inlineToolNames: names }}
      >
        <MessageComponent message={message} Parts={Parts} />
      </MessageRenderContext.Provider>
    )
  })

  function Message({
    message,
    children,
  }: {
    message: ChatUIMessages<TOptions>[number]
    children?: (parts: Array<ChatUISelectedPart>) => ReactNode
  }) {
    const chat = useChatContext()
    return (
      <MessageView
        children={children}
        inlineToolNames={inlineToolNames}
        interrupts={readInterrupts(chat)}
        message={message}
      />
    )
  }

  const AutomaticParts = memo(function AutomaticParts({
    message,
    interrupts,
    inlineToolNames: names,
  }: {
    message: UIMessage
    interrupts: ReadonlyArray<ChatUIInterrupt>
    inlineToolNames: ReadonlyArray<string>
  }) {
    const selected = selectMessageUI(message, {
      interrupts,
      inlineToolNames: names,
    })
    return (
      <>
        {automaticPartsForMessage(selected).map((part, index) => (
          <SelectedPartView key={`${message.id}-${index}`} selected={part} />
        ))}
      </>
    )
  })

  const SelectedPartInner = memo(function SelectedPartInner({
    selected,
  }: {
    selected: ChatUISelectedPart
  }) {
    const widgets = useContext(WidgetsContext)
    if (selected.key === 'toolCall') {
      const name = selected.part.name
      const Tool = widgets.tools[name] as
        | ComponentType<ToolProps<TOptions>>
        | undefined
      if (!Tool) {
        warn(`tool:${name}`, `[tanstack-ai-ui] Missing tools.${name} component`)
        return null
      }
      return (
        <Tool
          part={selected.part as ToolProps<TOptions>['part']}
          result={selected.result}
          interrupt={selected.interrupt as ToolProps<TOptions>['interrupt']}
        />
      )
    }

    if (selected.key === 'subagent' && selected.part.type === 'subagent') {
      const name = selected.part.subagent.name
      const Subagent = subagentComponents?.[name] as
        | ComponentType<SubagentProps<TOptions>>
        | undefined
      if (!Subagent) {
        throw new Error(`[tanstack-ai-ui] Missing subagentsComponents.${name}`)
      }
      return (
        <SubagentRenderContext.Provider
          value={{ handle: selected.part.subagent }}
        >
          <Subagent
            Parts={SubagentMessages}
            subagent={
              selected.part.subagent as SubagentProps<TOptions>['subagent']
            }
          />
        </SubagentRenderContext.Provider>
      )
    }

    const PartComponent = (widgets.parts[selected.key] ??
      widgets.parts.fallback) as ComponentType<PartProps<TOptions>> | undefined
    if (!PartComponent) {
      warn(
        `part:${selected.key}`,
        `[tanstack-ai-ui] Missing parts.${selected.key} component`,
      )
      return null
    }
    return <PartComponent part={selected.part as PartProps<TOptions>['part']} />
  }, selectedPartPropsEqual)

  const SelectedPartView = memo(function SelectedPartView({
    selected,
  }: {
    selected: ChatUISelectedPart
  }) {
    return (
      <PartContext.Provider value={selected}>
        <SelectedPartInner selected={selected} />
      </PartContext.Provider>
    )
  })

  function BoundRender() {
    const selected = usePartContext()
    return <SelectedPartInner selected={selected} />
  }

  function Part({
    part,
    children,
  }: {
    part: MessagePart | ChatUISelectedPart
    children?: (mixed: ChatUISelectedPart & PartMixins<TOptions>) => ReactNode
  }) {
    const chat = useChatContext()
    const selected = isSelectedPart(part)
      ? part
      : selectMessageUI(
          { id: 'part', role: 'assistant', parts: [part] },
          { interrupts: readInterrupts(chat), inlineToolNames: [] },
        ).parts[0]
    if (!selected) return null
    return (
      <PartContext.Provider value={selected}>
        {children ? (
          children(mixPart(selected))
        ) : (
          <SelectedPartInner selected={selected} />
        )}
      </PartContext.Provider>
    )
  }

  function Interrupts({
    children,
  }: {
    children?: (interrupts: ReadonlyArray<ChatUIInterrupt>) => ReactNode
  } = {}) {
    const chat = useChatContext()
    const selected = selectChatUI({
      messages: readMessages(chat),
      interrupts: readInterrupts(chat),
      inlineToolNames,
    })
    if (children) return <>{children(selected.interrupts)}</>
    return (
      <>
        {selected.interrupts.map((interrupt) => (
          <Interrupt key={interrupt.id} interrupt={interrupt} />
        ))}
      </>
    )
  }

  const InterruptInner = memo(function InterruptInner({
    interrupt,
  }: {
    interrupt: ChatUIInterrupt
  }) {
    const Component = resolveInterruptComponent(interrupt, interrupts) as
      | ComponentType<InterruptProps<TOptions>>
      | undefined
    if (!Component) {
      warn(
        `interrupt:${interrupt.id}`,
        `[tanstack-ai-ui] Missing interrupt component for ${interrupt.kind}`,
      )
      return null
    }
    return <Component interrupt={interrupt} />
  })

  function BoundInterruptRender() {
    const interrupt = useInterruptContext()
    return <InterruptInner interrupt={interrupt} />
  }

  const Interrupt = memo(function Interrupt({
    interrupt,
    children,
  }: {
    interrupt: ChatUIInterrupt
    children?: (mixed: ChatUIInterrupt & InterruptMixins<TOptions>) => ReactNode
  }) {
    return (
      <InterruptContext.Provider value={interrupt}>
        {children ? (
          children(mixInterrupt(interrupt))
        ) : (
          <InterruptInner interrupt={interrupt} />
        )}
      </InterruptContext.Provider>
    )
  })

  function readSubagentMessages() {
    const scoped = useContext(SubagentRenderContext)
    const chat = useChatContext()
    if (scoped?.listed) {
      const live = chat.subagents.find((item) => item.id === scoped.handle.id)
      return (live ?? scoped.handle).messages
    }
    if (scoped) return scoped.handle.messages
    const selected = useContext(PartContext)
    if (selected?.key === 'subagent' && selected.part.type === 'subagent') {
      return selected.part.subagent.messages
    }
    throw new Error(
      '`Parts` must be rendered by a subagent component or `Subagents` item.',
    )
  }

  const SubagentMessagesBody = memo(function SubagentMessagesBody({
    messages,
  }: {
    messages: SubagentHandle['messages']
  }) {
    const chat = useChatContext()
    const interrupts = readInterrupts(chat)
    return (
      <>
        {messages.map((message) => (
          <AutomaticParts
            key={message.id}
            inlineToolNames={inlineToolNames}
            interrupts={interrupts}
            message={message}
          />
        ))}
      </>
    )
  }, subagentMessagesEqual)

  function SubagentMessages({
    partsComponents,
    toolsComponents,
  }: SubagentPartsProps<TOptions>) {
    const messages = readSubagentMessages()
    const outer = useContext(WidgetsContext)
    const widgets = useMemo(
      () =>
        partsComponents || toolsComponents
          ? {
              parts: withWidgets(outer.parts, partsComponents),
              tools: withWidgets(outer.tools, toolsComponents),
            }
          : outer,
      [outer, partsComponents, toolsComponents],
    )
    // ponytail: root `<Interrupts />` still lists an approval for a tool call
    // inside a card, so it shows in both places. Hiding it needs `selectChatUI`
    // to collect tool-call ids from nested subagent messages (its `callIds` is
    // top-level only) plus the card tool names in `inlineToolNames`.
    return (
      <WidgetsContext.Provider value={widgets}>
        <SubagentMessagesBody messages={messages} />
      </WidgetsContext.Provider>
    )
  }

  const SubagentListItem = memo(function SubagentListItem({
    handle,
  }: SubagentRowProps) {
    const Subagent = subagentComponents?.[handle.name] as
      | ComponentType<SubagentProps<TOptions>>
      | undefined
    if (!Subagent) {
      throw new Error(
        `[tanstack-ai-ui] Missing subagentsComponents.${handle.name}`,
      )
    }
    return (
      <SubagentRenderContext.Provider value={{ handle, listed: true }}>
        <Subagent
          Parts={SubagentMessages}
          subagent={handle as SubagentProps<TOptions>['subagent']}
        />
      </SubagentRenderContext.Provider>
    )
  }, subagentListItemEqual)

  function Subagents({
    children,
  }: {
    children?: (subagents: Array<SubagentHandle>) => ReactNode
  } = {}) {
    const chat = useChatContext()
    const live = chat.subagents
    if (children) return <>{children(live)}</>
    if (live.length === 0) return null
    return (
      <>
        {live.map((handle) => (
          <SubagentListItem
            key={handle.id}
            handle={handle}
            status={handle.status}
            error={handle.error}
          />
        ))}
      </>
    )
  }

  return {
    Chat,
    Provider,
    Messages,
    Message,
    Part,
    Interrupts,
    Interrupt,
    Queue,
    Subagents,
    SubagentMessages,
    useChatContext,
    Input: InputComponent,
  }
}
