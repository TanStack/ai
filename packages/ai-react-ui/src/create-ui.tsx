import { createContext, memo, useCallback, useContext, useMemo } from 'react'
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
import type { UseChatReturn } from '@tanstack/ai-react'

export type ChatUIHost<TOptions = unknown> = UseChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

export type LayoutProps<TOptions> = {
  renderMessages: () => ReactNode
  renderInterrupts: () => ReactNode
  renderInput: () => ReactNode
  readonly __ui?: TOptions
}

export type MessageProps<TOptions> = {
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  renderParts: () => ReactNode
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

export type ChatUIComponents<TOptions> = {
  layout: ComponentType<LayoutProps<TOptions>>
  message: ComponentType<MessageProps<TOptions>>
  input?: ComponentType<InputProps<TOptions>>
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

type ComponentsValue<TOptions> = {
  components: ChatUIComponents<TOptions>
  warn: (key: string, message: string) => void
  inlineToolNames: ReadonlyArray<string>
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

export function createChatUI<const TOptions>(options: TOptions) {
  void options
  const warn = createWarnOnce()
  const ChatContext = createContext<ChatUIHost<TOptions> | null>(null)
  const ComponentsContext = createContext<ComponentsValue<TOptions> | null>(
    null,
  )

  function useChat() {
    const chat = useContext(ChatContext)
    if (!chat) {
      throw new Error(
        'Chat UI components must be wrapped in UI.Provider or UI.Chat.',
      )
    }
    return chat
  }

  function useComponents() {
    const value = useContext(ComponentsContext)
    if (!value) {
      throw new Error(
        'Chat UI components must be wrapped in UI.Provider or UI.Chat.',
      )
    }
    return value
  }

  function defineComponents(
    components: ChatUIComponents<TOptions>,
  ): ChatUIComponents<TOptions> {
    return components
  }

  function inlineNames(components: ChatUIComponents<TOptions>) {
    return collectInlineToolNames(
      components.interrupts?.tools as Record<string, unknown> | undefined,
      Object.keys(components.tools ?? {}),
    )
  }

  function Provider({
    chat,
    components,
    children,
  }: {
    chat: ChatUIHost<TOptions>
    components: ChatUIComponents<TOptions>
    children?: ReactNode
  }) {
    const componentsValue = useMemo(
      () => ({
        components,
        warn,
        inlineToolNames: inlineNames(components),
      }),
      [components],
    )
    return (
      <ComponentsContext.Provider value={componentsValue}>
        <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>
      </ComponentsContext.Provider>
    )
  }

  function Chat({
    chat,
    components,
  }: {
    chat: ChatUIHost<TOptions>
    components: ChatUIComponents<TOptions>
  }) {
    const Layout = components.layout
    const renderMessages = useCallback(() => <Messages />, [])
    const renderInterrupts = useCallback(() => <Interrupts />, [])
    const renderInput = useCallback(() => {
      const Input = components.input
      return Input ? <Input /> : null
    }, [components.input])
    return (
      <Provider chat={chat} components={components}>
        <Layout
          renderMessages={renderMessages}
          renderInterrupts={renderInterrupts}
          renderInput={renderInput}
        />
      </Provider>
    )
  }

  function Messages({
    children,
  }: {
    children?: (messages: ChatUIMessages<TOptions>) => ReactNode
  } = {}) {
    const chat = useChat()
    const { inlineToolNames } = useComponents()
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

  const MessageView = memo(function MessageView({
    message,
    interrupts,
    inlineToolNames,
    children,
  }: {
    message: ChatUIMessages<TOptions>[number]
    interrupts: ReadonlyArray<ChatUIInterrupt>
    inlineToolNames: ReadonlyArray<string>
    children?: (parts: Array<ChatUISelectedPart>) => ReactNode
  }) {
    const { components } = useComponents()
    const selected = selectMessageUI(message, {
      interrupts,
      inlineToolNames,
    })
    if (children) return <>{children(selected.parts)}</>
    const MessageComponent = components.message
    return (
      <MessageComponent
        message={message}
        renderParts={() => (
          <AutomaticParts
            inlineToolNames={inlineToolNames}
            interrupts={interrupts}
            message={message}
          />
        )}
      />
    )
  })

  function Message({
    message,
    children,
  }: {
    message: ChatUIMessages<TOptions>[number]
    children?: (parts: Array<ChatUISelectedPart>) => ReactNode
  }) {
    const chat = useChat()
    const { inlineToolNames } = useComponents()
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
    inlineToolNames,
  }: {
    message: ChatUIMessages<TOptions>[number]
    interrupts: ReadonlyArray<ChatUIInterrupt>
    inlineToolNames: ReadonlyArray<string>
  }) {
    const selected = selectMessageUI(message, {
      interrupts,
      inlineToolNames,
    })
    return (
      <>
        {automaticPartsForMessage(selected).map((part, index) => (
          <SelectedPartView key={`${message.id}-${index}`} selected={part} />
        ))}
      </>
    )
  })

  const SelectedPartView = memo(function SelectedPartView({
    selected,
  }: {
    selected: ChatUISelectedPart
  }) {
    const { components, warn: warnMissing } = useComponents()
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
          part={selected.part as ToolProps<TOptions>['part']}
          result={selected.result}
          interrupt={selected.interrupt as ToolProps<TOptions>['interrupt']}
        />
      )
    }

    const PartComponent = (components.parts[selected.key] ??
      components.parts.fallback) as
      | ComponentType<PartProps<TOptions>>
      | undefined
    if (!PartComponent) {
      warnMissing(
        `part:${selected.key}`,
        `[tanstack-ai-ui] Missing parts.${selected.key} component`,
      )
      return null
    }
    return <PartComponent part={selected.part as PartProps<TOptions>['part']} />
  }, selectedPartPropsEqual)

  function Part({ part }: { part: MessagePart }) {
    const chat = useChat()
    const selected = selectMessageUI(
      { id: 'part', role: 'assistant', parts: [part] },
      { interrupts: readInterrupts(chat), inlineToolNames: [] },
    ).parts[0]
    if (!selected) return null
    return <SelectedPartView selected={selected} />
  }

  function Interrupts({
    children,
  }: {
    children?: (interrupts: ReadonlyArray<ChatUIInterrupt>) => ReactNode
  } = {}) {
    const chat = useChat()
    const { inlineToolNames } = useComponents()
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

  const Interrupt = memo(function Interrupt({
    interrupt,
  }: {
    interrupt: ChatUIInterrupt
  }) {
    const { components, warn: warnMissing } = useComponents()
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
    return <Component interrupt={interrupt} />
  })

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
