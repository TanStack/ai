import { For, createContext, useContext } from 'solid-js'
import type { Accessor, Component, Context, JSX } from 'solid-js'
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
    | Component<any>
    | undefined = Component<InputProps<TOptions>>,
> = {
  Messages: Component
  Interrupts: Component
  readonly __ui?: TOptions
} & (TInput extends Component<any> ? { Input: Component } : {})

export type MessageProps<TOptions> = {
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  Parts: Component
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
        [K in ChatUINamedInterruptId<TOptions>]: Component<
          InterruptProps<TOptions, K & ChatUIInterruptName<TOptions>>
        >
      } & {
        fallback?: Component<InterruptProps<TOptions>>
      }
    : {
        fallback?: Component<InterruptProps<TOptions>>
      }

type ToolApprovalMap<TOptions> = {
  [K in ChatUIToolName<TOptions>]?: Component<
    InterruptProps<TOptions, K & ChatUIInterruptName<TOptions>>
  >
}

/** The chrome around the message list: `layout`, `message`, and `input`. */
export type ChatUIChromeComponents<
  TOptions,
  TInput extends
    | Component<InputProps<TOptions>>
    | undefined = Component<InputProps<TOptions>>,
> = {
  layout: Component<LayoutProps<TOptions, TInput>>
  message: Component<MessageProps<TOptions>>
  input?: TInput
}

export type ChatUIPartsComponents<TOptions> = {
  [K in ChatUIPartKey]?: Component<PartProps<TOptions, K>>
} & {
  fallback?: Component<PartProps<TOptions>>
}

export type ChatUIInterruptsComponents<TOptions> = {
  tools?: ToolApprovalMap<TOptions>
  generic: GenericInterruptComponents<TOptions>
}

export type ChatUIComponents<
  TOptions,
  TInput extends
    | Component<InputProps<TOptions>>
    | undefined = Component<InputProps<TOptions>>,
> = {
  components: ChatUIChromeComponents<TOptions, TInput>
  partsComponents: ChatUIPartsComponents<TOptions>
} & (ChatUIHasNamedTools<TOptions> extends true
  ? {
      toolsComponents: {
        [K in ChatUIToolName<TOptions>]: Component<ToolProps<TOptions, K>>
      }
    }
  : {
      toolsComponents?: {
        [K in ChatUIToolName<TOptions>]?: Component<ToolProps<TOptions, K>>
      }
    }) &
  (ChatUIHasNamedInterrupts<TOptions> extends true
    ? { interruptsComponents: ChatUIInterruptsComponents<TOptions> }
    : {
        interruptsComponents?: {
          tools?: ToolApprovalMap<TOptions>
          generic?: GenericInterruptComponents<TOptions>
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
  TInput extends
    | Component<InputProps<TOptions>>
    | undefined = Component<InputProps<TOptions>>,
> = ChatUIComponents<TOptions, TInput> & {
  context?: ChatUIContextConfig
}

type BoundWidget = Component<Record<string, never>>

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

// This module ships as source, so it is type-checked against the *consumer's*
// tsconfig, which need not include `@types/node`. Declare `process` locally
// (same shape as the `src/env.d.ts` the devtools packages use) rather than
// reading it off `globalThis`: the literal `process.env.NODE_ENV` is the token
// bundlers substitute, so this keeps the branch constant-folded in production.
declare const process: {
  env: {
    NODE_ENV?: string
  }
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

function readMessages<TOptions>(
  chat: ChatUIHost<TOptions>,
): ReadonlyArray<any> {
  return chat.messages()
}

function readInterrupts<TOptions>(
  chat: ChatUIHost<TOptions>,
): ReadonlyArray<any> {
  return chat.interrupts()
}

function messagesAccessor<TOptions>(
  chat: ChatUIHost<TOptions>,
): Accessor<ReadonlyArray<any>> {
  return chat.messages
}

function isSelectedPart(
  value: MessagePart | ChatUISelectedPart,
): value is ChatUISelectedPart {
  return 'key' in value && 'part' in value
}

function bindMap(
  map: Record<string, Component<any> | undefined> | undefined,
  bind: (component: Component<any>) => BoundWidget,
) {
  const out: Record<string, BoundWidget> = {}
  for (const [key, component] of Object.entries(map ?? {})) {
    if (component) out[key] = bind(component)
  }
  return out
}

/**
 * Bind chat options and UI widgets once at module scope. This matches Form
 * `createFormHook` and Table `createTableHook`.
 */
export function createChatUI<
  const TOptions,
  TInput extends Component<any> | undefined =
    | Component<InputProps<NoInfer<TOptions>>>
    | undefined,
>(options: TOptions, config: ChatUIFactoryConfig<NoInfer<TOptions>, TInput>) {
  void options
  const {
    context: contextOption,
    components,
    partsComponents: parts,
    toolsComponents: tools,
    interruptsComponents: interrupts,
  } = config as ChatUIFactoryConfig<TOptions, TInput> & {
    toolsComponents?: Record<string, Component<any> | undefined>
    interruptsComponents?: {
      tools?: Record<string, Component<any> | undefined>
      generic?: Record<string, Component<any> | undefined>
    }
  }
  const {
    layout: Layout,
    message: MessageComponent,
    input: InputComponent,
  } = components
  const {
    chatContext: chatContextOption,
    partContext: partContextOption,
    interruptContext: interruptContextOption,
  } = contextOption ?? {}
  const warn = createWarnOnce()
  const ChatContext = (chatContextOption ??
    defaultChatUIContexts.chatContext) as Context<
    ChatUIHost<TOptions> | undefined
  >
  const PartContext = (partContextOption ??
    defaultChatUIContexts.partContext) as Context<
    ChatUISelectedPart | undefined
  >
  const InterruptContext = (interruptContextOption ??
    defaultChatUIContexts.interruptContext) as Context<
    ChatUIInterrupt | undefined
  >
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

  function bindPart(Component: Component<PartProps<TOptions>>) {
    return function BoundPart() {
      const selected = usePartContext()
      return <Component part={selected.part as PartProps<TOptions>['part']} />
    }
  }

  function bindTool(Component: Component<ToolProps<TOptions>>) {
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

  function bindInterrupt(Component: Component<InterruptProps<TOptions>>) {
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
    parts as Record<string, Component<any> | undefined>,
    bindPart,
  )
  const toolMixins = bindMap(
    tools as Record<string, Component<any> | undefined>,
    bindTool,
  )
  const interruptMixins = {
    ...bindMap(
      interrupts?.generic as
        | Record<string, Component<any> | undefined>
        | undefined,
      bindInterrupt,
    ),
    ...bindMap(
      interrupts?.tools as
        | Record<string, Component<any> | undefined>
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

  function Provider(props: {
    chat: ChatUIHost<TOptions>
    children?: JSX.Element
  }) {
    return (
      <ChatContext.Provider value={props.chat}>
        {props.children}
      </ChatContext.Provider>
    )
  }

  // Backstop for when the conditional `Input` type cannot be inferred (see the
  // `input` note in docs/ui/solid.md). The type hides `Input` when no `input`
  // is registered, but inference degrades on some config shapes, so always
  // supply a component: warn once rather than crash on an undefined element.
  function MissingInput() {
    warn(
      'input',
      '[tanstack-ai-ui] Rendered <Input /> but no `input` component is registered.',
    )
    return null
  }

  // Declared once per factory, so these props are stable for the kit's life.
  const LayoutSlots = {
    Messages: Messages as Component,
    Interrupts: Interrupts as Component,
    Input: (InputComponent ?? MissingInput) as Component,
  }

  function Chat(props: { chat: ChatUIHost<TOptions> }) {
    return (
      <Provider chat={props.chat}>
        <Layout {...(LayoutSlots as any)} />
      </Provider>
    )
  }

  function Messages(props: {
    children?: (
      messages: Accessor<ReadonlyArray<UIMessage<any, any>>>,
    ) => JSX.Element
  }) {
    const chat = useChatContext()
    if (props.children) return <>{props.children(messagesAccessor(chat))}</>
    return (
      <For each={readMessages(chat)}>
        {(message) => (
          <MessageView
            inlineToolNames={inlineToolNames}
            interrupts={readInterrupts(chat)}
            message={message}
          />
        )}
      </For>
    )
  }

  // Scoped to one message. `Parts` reads it instead of closing over the
  // message, so the kit hands out one stable component, matching React.
  type MessageRenderValue = {
    message: UIMessage<any, any>
    interrupts: ReadonlyArray<any>
    inlineToolNames: ReadonlyArray<string>
  }
  const MessageRenderContext = createContext<MessageRenderValue>()

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

  function MessageView(props: {
    message: UIMessage<any, any>
    interrupts: ReadonlyArray<any>
    inlineToolNames: ReadonlyArray<string>
    children?: (parts: Array<ChatUISelectedPart>) => JSX.Element
  }) {
    const selected = selectMessageUI(props.message, {
      interrupts: props.interrupts,
      inlineToolNames: props.inlineToolNames,
    })
    if (props.children) return <>{props.children(selected.parts)}</>
    return (
      <MessageRenderContext.Provider
        value={{
          get message() {
            return props.message
          },
          get interrupts() {
            return props.interrupts
          },
          get inlineToolNames() {
            return props.inlineToolNames
          },
        }}
      >
        <MessageComponent
          message={props.message as MessageProps<TOptions>['message']}
          Parts={Parts}
        />
      </MessageRenderContext.Provider>
    )
  }

  function Message(props: {
    message: UIMessage<any, any>
    children?: (parts: Array<ChatUISelectedPart>) => JSX.Element
  }) {
    const chat = useChatContext()
    return (
      <MessageView
        children={props.children}
        inlineToolNames={inlineToolNames}
        interrupts={readInterrupts(chat)}
        message={props.message}
      />
    )
  }

  function AutomaticParts(props: {
    message: UIMessage<any, any>
    interrupts: ReadonlyArray<any>
    inlineToolNames: ReadonlyArray<string>
  }) {
    const selected = selectMessageUI(props.message, {
      interrupts: props.interrupts,
      inlineToolNames: props.inlineToolNames,
    })
    return (
      <>
        {automaticPartsForMessage(selected).map((part) => (
          <SelectedPartView selected={part} />
        ))}
      </>
    )
  }

  function SelectedPartInner(props: { selected: ChatUISelectedPart }) {
    if (props.selected.key === 'toolCall') {
      const name = props.selected.part.name
      const Tool = tools?.[name as ChatUIToolName<TOptions>] as
        | Component<ToolProps<TOptions>>
        | undefined
      if (!Tool) {
        warn(`tool:${name}`, `[tanstack-ai-ui] Missing tools.${name} component`)
        return null
      }
      return (
        <Tool
          part={props.selected.part as ToolProps<TOptions>['part']}
          result={props.selected.result}
          interrupt={
            (props.selected.key === 'toolCall'
              ? props.selected.interrupt
              : undefined) as ToolProps<TOptions>['interrupt']
          }
        />
      )
    }
    const PartComponent = (parts[props.selected.key] ?? parts.fallback) as
      | Component<PartProps<TOptions>>
      | undefined
    if (!PartComponent) {
      warn(
        `part:${props.selected.key}`,
        `[tanstack-ai-ui] Missing parts.${props.selected.key} component`,
      )
      return null
    }
    return (
      <PartComponent
        part={props.selected.part as PartProps<TOptions>['part']}
      />
    )
  }

  function SelectedPartView(props: { selected: ChatUISelectedPart }) {
    return (
      <PartContext.Provider value={props.selected}>
        <SelectedPartInner selected={props.selected} />
      </PartContext.Provider>
    )
  }

  function BoundRender() {
    const selected = usePartContext()
    return <SelectedPartInner selected={selected} />
  }

  function Part(props: {
    part: MessagePart | ChatUISelectedPart
    children?: (mixed: ChatUISelectedPart & PartMixins<TOptions>) => JSX.Element
  }) {
    const chat = useChatContext()
    const selected = isSelectedPart(props.part)
      ? props.part
      : selectMessageUI(
          { id: 'part', role: 'assistant', parts: [props.part] },
          { interrupts: readInterrupts(chat), inlineToolNames: [] },
        ).parts[0]
    if (!selected) return null
    return (
      <PartContext.Provider value={selected}>
        {props.children ? (
          props.children(mixPart(selected))
        ) : (
          <SelectedPartInner selected={selected} />
        )}
      </PartContext.Provider>
    )
  }

  function Interrupts(props: {
    children?: (
      interrupts: Accessor<ReadonlyArray<ChatUIInterrupt>>,
    ) => JSX.Element
  }) {
    const chat = useChatContext()
    const selected = () =>
      selectChatUI({
        messages: readMessages(chat),
        interrupts: readInterrupts(chat),
        inlineToolNames,
      })
    if (props.children) {
      return <>{props.children(() => selected().interrupts)}</>
    }
    return (
      <For each={selected().interrupts}>
        {(interrupt) => <Interrupt interrupt={interrupt} />}
      </For>
    )
  }

  function InterruptInner(props: { interrupt: ChatUIInterrupt }) {
    const Component = resolveInterruptComponent(props.interrupt, interrupts) as
      | Component<InterruptProps<TOptions>>
      | undefined
    if (!Component) {
      warn(
        `interrupt:${props.interrupt.id}`,
        `[tanstack-ai-ui] Missing interrupt component for ${props.interrupt.kind}`,
      )
      return null
    }
    return <Component interrupt={props.interrupt} />
  }

  function BoundInterruptRender() {
    const interrupt = useInterruptContext()
    return <InterruptInner interrupt={interrupt} />
  }

  function Interrupt(props: {
    interrupt: ChatUIInterrupt
    children?: (
      mixed: ChatUIInterrupt & InterruptMixins<TOptions>,
    ) => JSX.Element
  }) {
    return (
      <InterruptContext.Provider value={props.interrupt}>
        {props.children ? (
          props.children(mixInterrupt(props.interrupt))
        ) : (
          <InterruptInner interrupt={props.interrupt} />
        )}
      </InterruptContext.Provider>
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
    useChatContext,
    Input: InputComponent,
  }
}
