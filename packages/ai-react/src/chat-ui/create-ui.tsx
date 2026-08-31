import { createContext, memo, useContext } from 'react'
import type {
  ComponentProps,
  ComponentType,
  Context,
  ReactNode,
} from 'react'
import {
  automaticPartsForMessage,
  collectInlineToolNames,
  resolveInterruptComponent,
  selectChatUI,
  selectMessageUI,
} from '@tanstack/ai-client/ui'
import type {
  ChatUIData,
  ChatUIHasNamedInterrupts,
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
  ChatUIToolApproval,
  ChatUIToolName,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import type {
  MessagePart,
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

export type LayoutProps<
  TOptions,
  TInput extends
    | ComponentType<any>
    | undefined = ComponentType<InputProps<TOptions>>,
> = {
  Messages: ComponentType
  Interrupts: ComponentType
  readonly __ui?: TOptions
} & (TInput extends ComponentType<any> ? { Input: ComponentType } : {})

export type MessageProps<TOptions> = {
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  Parts: ComponentType
}

export type InputProps<TOptions> = {
  readonly __ui?: TOptions
}

export type PartProps<TOptions, TKey extends ChatUIPartKey = ChatUIPartKey> = {
  part: ChatUIPartOf<TOptions, TKey>
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
  [K in ChatUIToolName<TOptions>]?: ComponentType<
    InterruptProps<TOptions, K & ChatUIInterruptName<TOptions>>
  >
}

export type ChatUIComponents<
  TOptions,
  TInput extends
    | ComponentType<InputProps<TOptions>>
    | undefined = ComponentType<InputProps<TOptions>>,
> = {
  layout: ComponentType<LayoutProps<TOptions, TInput>>
  message: ComponentType<MessageProps<TOptions>>
  input?: TInput
  parts: {
    [K in ChatUIPartKey]?: ComponentType<PartProps<TOptions, K>>
  } & {
    fallback?: ComponentType<PartProps<TOptions>>
  }
} & (ChatUIHasNamedTools<TOptions> extends true
  ? {
      tools: {
        [K in ChatUIToolName<TOptions>]: ComponentType<ToolProps<TOptions, K>>
      }
    }
  : {
      tools?: {
        [K in ChatUIToolName<TOptions>]?: ComponentType<ToolProps<TOptions, K>>
      }
    }) &
  (ChatUIHasNamedInterrupts<TOptions> extends true
    ? {
        interrupts: {
          tools?: ToolApprovalMap<TOptions>
          generic: GenericInterruptComponents<TOptions>
        }
      }
    : {
        interrupts?: {
          tools?: ToolApprovalMap<TOptions>
          generic?: GenericInterruptComponents<TOptions>
        }
      })

export type ChatUIFactoryConfig<
  TOptions,
  TInput extends
    | ComponentType<InputProps<TOptions>>
    | undefined = ComponentType<InputProps<TOptions>>,
> = ChatUIComponents<TOptions, TInput> & {
  chatContext?: ChatUIContexts['chatContext']
  partContext?: ChatUIContexts['partContext']
  interruptContext?: ChatUIContexts['interruptContext']
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
  [K in ChatUIToolName<TOptions>]?: BoundWidget
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
    chatContext: chatContextOption,
    partContext: partContextOption,
    interruptContext: interruptContextOption,
    layout: Layout,
    message: MessageComponent,
    input: InputComponent,
    parts,
    tools,
    interrupts,
  } = config
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

  // `Messages`, `Interrupts` and `InputComponent` are declared once per
  // factory, so these props are stable for the lifetime of the kit.
  const LayoutSlots = {
    Messages: Messages as ComponentType,
    Interrupts: Interrupts as ComponentType,
    Input: (InputComponent ?? MissingInput) as ComponentType,
  }

  function Chat({ chat }: { chat: ChatUIHost<TOptions> }) {
    return (
      <Provider chat={chat}>
        <Layout {...(LayoutSlots as ComponentProps<ComponentType<any>>)} />
      </Provider>
    )
  }

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
    message: ChatUIMessages<TOptions>[number]
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
    if (selected.key === 'toolCall') {
      const name = selected.part.name
      const Tool = tools?.[name as ChatUIToolName<TOptions>] as
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

    const PartComponent = (parts[selected.key] ?? parts.fallback) as
      | ComponentType<PartProps<TOptions>>
      | undefined
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

  return {
    Chat,
    Provider,
    Messages,
    Message,
    Part,
    Interrupts,
    Interrupt,
    useChatContext,
    Input: InputComponent,
  }
}
