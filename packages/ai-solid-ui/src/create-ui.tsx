import { createContext, useContext } from 'solid-js'
import type { Accessor, Component, JSX } from 'solid-js'
import {
  automaticPartsForMessage,
  collectInlineToolNames,
  resolveInterruptComponent,
  selectChatUI,
  selectMessageUI,
} from '@tanstack/ai-client/ui'
import type {
  ChatUIData,
  ChatUIInterrupt,
  ChatUIPartKey,
  ChatUIRegisteredInterruptId,
  ChatUISelectedPart,
  ChatUIToolName,
  ChatUIToolsOf,
  RegisteredUIInterrupt,
} from '@tanstack/ai-client/ui'
import type {
  MessagePart,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '@tanstack/ai-client'

// ponytail: duck-typed so UseChatReturn assigns; accessors and UIMessage generics are invariant
export type ChatUIHost = {
  messages: Accessor<ReadonlyArray<any>> | ReadonlyArray<any>
  interrupts?: Accessor<ReadonlyArray<any>> | ReadonlyArray<any>
  error?: Accessor<Error | undefined> | Error
  isLoading?: Accessor<boolean> | boolean
  status?: Accessor<string> | string
  sendMessage?: (content: string, ...args: Array<any>) => Promise<void> | void
}

export type LayoutProps<TOptions> = {
  chat: ChatUIHost
  renderMessages: () => JSX.Element
  renderInterrupts: () => JSX.Element
  renderInput: () => JSX.Element
  readonly __ui?: TOptions
}

export type MessageProps<TOptions> = {
  chat: ChatUIHost
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  renderParts: () => JSX.Element
}

export type InputProps<TOptions> = {
  chat: ChatUIHost
  readonly __ui?: TOptions
}

export type PartProps<TOptions> = {
  chat: ChatUIHost
  part: MessagePart<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
}

export type ToolProps<
  TOptions,
  TName extends ChatUIToolName<TOptions> = ChatUIToolName<TOptions>,
> = {
  chat: ChatUIHost
  part: Extract<ToolCallPart<ChatUIToolsOf<TOptions>>, { name: TName }>
  result?: ToolResultPart
  interrupt?: Extract<
    ChatUIInterrupt,
    { kind: 'tool-approval'; toolName: TName }
  >
  renderInterrupt: () => JSX.Element
}

export type InterruptProps<TOptions> = {
  chat: ChatUIHost
  interrupt: ChatUIInterrupt
  readonly __ui?: TOptions
}

export type RegisteredInterruptProps<
  TOptions,
  TId extends ChatUIRegisteredInterruptId<TOptions> =
    ChatUIRegisteredInterruptId<TOptions>,
> = {
  chat: ChatUIHost
  interrupt: RegisteredUIInterrupt<TOptions, TId>
}

type InterruptEntry<TOptions> =
  | Component<InterruptProps<TOptions>>
  | {
      component: Component<InterruptProps<TOptions>>
      placement?: 'inline' | 'list'
    }

type GenericInterruptComponents<TOptions> = {
  [K in ChatUIRegisteredInterruptId<TOptions> as K extends 'fallback'
    ? never
    : K]?: Component<RegisteredInterruptProps<TOptions, K>>
} & {
  fallback?: Component<InterruptProps<TOptions>>
}

export type ChatUIComponents<TOptions> = {
  layout: Component<LayoutProps<TOptions>>
  message: Component<MessageProps<TOptions>>
  input?: Component<InputProps<TOptions>>
  parts: {
    [K in ChatUIPartKey]?: Component<PartProps<TOptions>>
  } & {
    fallback?: Component<PartProps<TOptions>>
  }
  tools?: {
    [K in ChatUIToolName<TOptions>]?: Component<ToolProps<TOptions, K>>
  }
  interrupts?: {
    tools?: {
      [K in ChatUIToolName<TOptions>]?: InterruptEntry<TOptions>
    }
    generic?: GenericInterruptComponents<TOptions>
  }
}

type UIContextValue<TOptions> = {
  chat: ChatUIHost
  components: ChatUIComponents<TOptions>
  warn: (key: string, message: string) => void
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

function readMessages(chat: ChatUIHost): ReadonlyArray<any> {
  return typeof chat.messages === 'function' ? chat.messages() : chat.messages
}

function readInterrupts(chat: ChatUIHost): ReadonlyArray<any> {
  const value = chat.interrupts
  if (typeof value === 'function') return value()
  return value ?? []
}

function messagesAccessor(chat: ChatUIHost): Accessor<ReadonlyArray<any>> {
  const value = chat.messages
  if (typeof value === 'function') return value
  return () => value
}

export function createUI<const TOptions>(options: TOptions) {
  void options
  const warn = createWarnOnce()
  const UIContext = createContext<UIContextValue<TOptions> | null>(null)

  function useUIContext() {
    const value = useContext(UIContext)
    if (!value) {
      throw new Error(
        'Chat UI components must be wrapped in UI.Provider or UI.Chat.',
      )
    }
    return value
  }

  function useChat() {
    return useUIContext().chat
  }

  function defineComponents(components: ChatUIComponents<TOptions>) {
    return components
  }

  function inlineNames(components: ChatUIComponents<TOptions>) {
    return collectInlineToolNames(
      components.interrupts?.tools as Record<string, unknown> | undefined,
    )
  }

  function Provider(props: {
    chat: ChatUIHost
    components: ChatUIComponents<TOptions>
    children?: JSX.Element
  }) {
    return (
      <UIContext.Provider
        value={{ chat: props.chat, components: props.components, warn }}
      >
        {props.children}
      </UIContext.Provider>
    )
  }

  function Chat(props: {
    chat: ChatUIHost
    components: ChatUIComponents<TOptions>
  }) {
    const Layout = props.components.layout
    return (
      <Provider chat={props.chat} components={props.components}>
        <Layout
          chat={props.chat}
          renderMessages={() => <Messages />}
          renderInterrupts={() => <Interrupts />}
          renderInput={() => {
            const Input = props.components.input
            return Input ? <Input chat={props.chat} /> : null
          }}
        />
      </Provider>
    )
  }

  function Messages(props: {
    children?: (
      messages: Accessor<ReadonlyArray<UIMessage<any, any>>>,
    ) => JSX.Element
  }) {
    const ctx = useUIContext()
    if (props.children) return <>{props.children(messagesAccessor(ctx.chat))}</>
    return (
      <>
        {readMessages(ctx.chat).map((message) => (
          <Message message={message} />
        ))}
      </>
    )
  }

  function Message(props: {
    message: UIMessage<any, any>
    children?: (parts: Array<ChatUISelectedPart>) => JSX.Element
  }) {
    const ctx = useUIContext()
    const inlineToolNames = inlineNames(ctx.components)
    const selected = selectMessageUI(props.message, {
      interrupts: readInterrupts(ctx.chat),
      inlineToolNames,
    })
    if (props.children) return <>{props.children(selected.parts)}</>
    const MessageComponent = ctx.components.message
    return (
      <MessageComponent
        chat={ctx.chat}
        message={props.message as MessageProps<TOptions>['message']}
        renderParts={() => <AutomaticParts message={props.message} />}
      />
    )
  }

  function AutomaticParts(props: { message: UIMessage<any, any> }) {
    const ctx = useUIContext()
    const selected = selectMessageUI(props.message, {
      interrupts: readInterrupts(ctx.chat),
      inlineToolNames: inlineNames(ctx.components),
    })
    return (
      <>
        {automaticPartsForMessage(selected).map((part) => (
          <SelectedPartView selected={part} inline />
        ))}
      </>
    )
  }

  function SelectedPartView(props: {
    selected: ChatUISelectedPart
    inline: boolean
  }) {
    const ctx = useUIContext()
    if (props.selected.key === 'toolCall') {
      const name = props.selected.part.name
      const Tool = ctx.components.tools?.[name as ChatUIToolName<TOptions>] as
        | Component<ToolProps<TOptions>>
        | undefined
      if (!Tool) {
        ctx.warn(
          `tool:${name}`,
          `[tanstack-ai-ui] Missing tools.${name} component`,
        )
        return null
      }
      return (
        <Tool
          chat={ctx.chat}
          part={props.selected.part as ToolProps<TOptions>['part']}
          result={props.selected.result}
          interrupt={
            (props.selected.key === 'toolCall'
              ? props.selected.interrupt
              : undefined) as ToolProps<TOptions>['interrupt']
          }
          renderInterrupt={() =>
            props.inline && props.selected.key === 'toolCall' ? (
              <InlineInterrupt interrupt={props.selected.interrupt} />
            ) : null
          }
        />
      )
    }
    const PartComponent =
      ctx.components.parts[props.selected.key] ?? ctx.components.parts.fallback
    if (!PartComponent) {
      ctx.warn(
        `part:${props.selected.key}`,
        `[tanstack-ai-ui] Missing parts.${props.selected.key} component`,
      )
      return null
    }
    return (
      <PartComponent
        chat={ctx.chat}
        part={props.selected.part as PartProps<TOptions>['part']}
      />
    )
  }

  function InlineInterrupt(props: { interrupt?: ChatUIInterrupt }) {
    const ctx = useUIContext()
    const interrupt = props.interrupt
    if (!interrupt || interrupt.kind !== 'tool-approval') return null
    if (!inlineNames(ctx.components).includes(interrupt.toolName)) return null
    const Component = resolveInterruptComponent(
      interrupt,
      ctx.components.interrupts,
    ) as Component<InterruptProps<TOptions>> | undefined
    if (!Component) return null
    return <Component chat={ctx.chat} interrupt={interrupt} />
  }

  function Part(props: { part: MessagePart }) {
    const ctx = useUIContext()
    const selected = selectMessageUI(
      { id: 'part', role: 'assistant', parts: [props.part] },
      { interrupts: readInterrupts(ctx.chat), inlineToolNames: [] },
    ).parts[0]
    if (!selected) return null
    return <SelectedPartView selected={selected} inline={false} />
  }

  function Interrupts(props: {
    children?: (
      interrupts: Accessor<ReadonlyArray<ChatUIInterrupt>>,
    ) => JSX.Element
  }) {
    const ctx = useUIContext()
    const selected = () =>
      selectChatUI({
        messages: readMessages(ctx.chat),
        interrupts: readInterrupts(ctx.chat),
        inlineToolNames: inlineNames(ctx.components),
      })
    if (props.children) {
      return <>{props.children(() => selected().interrupts)}</>
    }
    return (
      <>
        {selected().interrupts.map((interrupt) => (
          <Interrupt interrupt={interrupt} />
        ))}
      </>
    )
  }

  function Interrupt(props: { interrupt: ChatUIInterrupt }) {
    const ctx = useUIContext()
    const Component = resolveInterruptComponent(
      props.interrupt,
      ctx.components.interrupts,
    ) as Component<InterruptProps<TOptions>> | undefined
    if (!Component) {
      ctx.warn(
        `interrupt:${props.interrupt.id}`,
        `[tanstack-ai-ui] Missing interrupt component for ${props.interrupt.kind}`,
      )
      return null
    }
    return <Component chat={ctx.chat} interrupt={props.interrupt} />
  }

  return {
    Chat,
    Provider,
    Messages,
    Message,
    Part,
    Interrupts,
    Interrupt,
    defineComponents,
    useChat,
  }
}
