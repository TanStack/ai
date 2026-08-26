import { createContext, useContext } from 'react'
import type { ComponentType, ReactNode } from 'react'
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

// ponytail: duck-typed so UseChatReturn assigns; UIMessage generics are invariant
export type ChatUIHost = {
  messages: ReadonlyArray<any>
  interrupts?: ReadonlyArray<any>
  error?: Error
  isLoading?: boolean
  status?: string
  sendMessage?: (content: string, ...args: Array<any>) => Promise<void> | void
}

export type LayoutProps<TOptions> = {
  chat: ChatUIHost
  renderMessages: () => ReactNode
  renderInterrupts: () => ReactNode
  renderInput: () => ReactNode
  readonly __ui?: TOptions
}

export type MessageProps<TOptions> = {
  chat: ChatUIHost
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  renderParts: () => ReactNode
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
  renderInterrupt: () => ReactNode
}

export type InterruptProps<TOptions> = {
  chat: ChatUIHost
  interrupt: ChatUIInterrupt
  readonly __ui?: TOptions
}

type InterruptEntry<TOptions> =
  | ComponentType<InterruptProps<TOptions>>
  | {
      component: ComponentType<InterruptProps<TOptions>>
      placement?: 'inline' | 'list'
    }

export type ChatUIComponents<TOptions> = {
  layout: ComponentType<LayoutProps<TOptions>>
  message: ComponentType<MessageProps<TOptions>>
  input?: ComponentType<InputProps<TOptions>>
  parts: {
    [K in ChatUIPartKey]?: ComponentType<PartProps<TOptions>>
  } & {
    fallback?: ComponentType<PartProps<TOptions>>
  }
  tools?: {
    [K in ChatUIToolName<TOptions>]?: ComponentType<ToolProps<TOptions, K>>
  }
  interrupts?: {
    tools?: {
      [K in ChatUIToolName<TOptions>]?: InterruptEntry<TOptions>
    }
    registered?: {
      [K in ChatUIRegisteredInterruptId<TOptions>]?: ComponentType<{
        chat: ChatUIHost
        interrupt: RegisteredUIInterrupt<TOptions, K>
      }>
    }
    generic?: ComponentType<InterruptProps<TOptions>>
    unbound?: ComponentType<InterruptProps<TOptions>>
    fallback?: ComponentType<InterruptProps<TOptions>>
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

function readInterrupts(chat: ChatUIHost) {
  return chat.interrupts ?? []
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

  function defineComponents(
    components: ChatUIComponents<TOptions>,
  ): ChatUIComponents<TOptions> {
    return components
  }

  function inlineNames(components: ChatUIComponents<TOptions>) {
    return collectInlineToolNames(
      components.interrupts?.tools as Record<string, unknown> | undefined,
    )
  }

  function Provider({
    chat,
    components,
    children,
  }: {
    chat: ChatUIHost
    components: ChatUIComponents<TOptions>
    children?: ReactNode
  }) {
    return (
      <UIContext.Provider value={{ chat, components, warn }}>
        {children}
      </UIContext.Provider>
    )
  }

  function Chat({
    chat,
    components,
  }: {
    chat: ChatUIHost
    components: ChatUIComponents<TOptions>
  }) {
    const Layout = components.layout
    return (
      <Provider chat={chat} components={components}>
        <Layout
          chat={chat}
          renderMessages={() => <Messages />}
          renderInterrupts={() => <Interrupts />}
          renderInput={() => {
            const Input = components.input
            return Input ? <Input chat={chat} /> : null
          }}
        />
      </Provider>
    )
  }

  function Messages({
    children,
  }: {
    children?: (messages: ChatUIHost['messages']) => ReactNode
  } = {}) {
    const { chat } = useUIContext()
    if (children) return <>{children(chat.messages)}</>
    return (
      <>
        {chat.messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </>
    )
  }

  function Message({
    message,
    children,
  }: {
    message: ChatUIHost['messages'][number]
    children?: (parts: Array<ChatUISelectedPart>) => ReactNode
  }) {
    const { chat, components } = useUIContext()
    const inlineToolNames = inlineNames(components)
    const selected = selectMessageUI(message, {
      interrupts: readInterrupts(chat),
      inlineToolNames,
    })
    if (children) return <>{children(selected.parts)}</>
    const MessageComponent = components.message
    return (
      <MessageComponent
        chat={chat}
        message={message}
        renderParts={() => <AutomaticParts message={message} />}
      />
    )
  }

  function AutomaticParts({
    message,
  }: {
    message: ChatUIHost['messages'][number]
  }) {
    const { chat, components } = useUIContext()
    const inlineToolNames = inlineNames(components)
    const selected = selectMessageUI(message, {
      interrupts: readInterrupts(chat),
      inlineToolNames,
    })
    return (
      <>
        {automaticPartsForMessage(selected).map((part, index) => (
          <SelectedPartView
            key={`${message.id}-${index}`}
            selected={part}
            inline
          />
        ))}
      </>
    )
  }

  function SelectedPartView({
    selected,
    inline,
  }: {
    selected: ChatUISelectedPart
    inline: boolean
  }) {
    const { chat, components, warn: warnMissing } = useUIContext()
    if (selected.key === 'toolCall') {
      const name = selected.part.name
      const Tool = components.tools?.[name as ChatUIToolName<TOptions>] as
        | ComponentType<ToolProps<TOptions>>
        | undefined
      if (!Tool) {
        warnMissing(
          `tool:${name}`,
          `[tanstack-ai-ui] Missing tools.${name} component`,
        )
        return null
      }
      return (
        <Tool
          chat={chat}
          part={selected.part as ToolProps<TOptions>['part']}
          result={selected.result}
          interrupt={selected.interrupt as ToolProps<TOptions>['interrupt']}
          renderInterrupt={() =>
            inline ? <InlineInterrupt interrupt={selected.interrupt} /> : null
          }
        />
      )
    }

    const PartComponent =
      components.parts[selected.key] ?? components.parts.fallback
    if (!PartComponent) {
      warnMissing(
        `part:${selected.key}`,
        `[tanstack-ai-ui] Missing parts.${selected.key} component`,
      )
      return null
    }
    return (
      <PartComponent
        chat={chat}
        part={selected.part as PartProps<TOptions>['part']}
      />
    )
  }

  function InlineInterrupt({ interrupt }: { interrupt?: ChatUIInterrupt }) {
    const { chat, components } = useUIContext()
    if (!interrupt || interrupt.kind !== 'tool-approval') return null
    const inlineToolNames = inlineNames(components)
    if (!inlineToolNames.includes(interrupt.toolName)) return null
    const Component = resolveInterruptComponent(
      interrupt,
      components.interrupts,
    ) as ComponentType<InterruptProps<TOptions>> | undefined
    if (!Component) return null
    return <Component chat={chat} interrupt={interrupt} />
  }

  function Part({ part }: { part: MessagePart }) {
    const { chat } = useUIContext()
    const selected = selectMessageUI(
      { id: 'part', role: 'assistant', parts: [part] },
      { interrupts: readInterrupts(chat), inlineToolNames: [] },
    ).parts[0]
    if (!selected) return null
    return <SelectedPartView selected={selected} inline={false} />
  }

  function Interrupts({
    children,
  }: {
    children?: (interrupts: ReadonlyArray<ChatUIInterrupt>) => ReactNode
  } = {}) {
    const { chat, components } = useUIContext()
    const inlineToolNames = inlineNames(components)
    const selected = selectChatUI({
      messages: chat.messages,
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

  function Interrupt({ interrupt }: { interrupt: ChatUIInterrupt }) {
    const { chat, components, warn: warnMissing } = useUIContext()
    const Component = resolveInterruptComponent(
      interrupt,
      components.interrupts,
    ) as ComponentType<InterruptProps<TOptions>> | undefined
    if (!Component) {
      warnMissing(
        `interrupt:${interrupt.id}`,
        `[tanstack-ai-ui] Missing interrupt component for ${interrupt.kind}`,
      )
      return null
    }
    return <Component chat={chat} interrupt={interrupt} />
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
