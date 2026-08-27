import { For, createContext, useContext } from 'solid-js'
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
import type { UseChatReturn } from '@tanstack/ai-solid'

export type ChatUIHost<TOptions = unknown> = UseChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

export type LayoutProps<TOptions> = {
  renderMessages: () => JSX.Element
  renderInterrupts: () => JSX.Element
  renderInput: () => JSX.Element
  readonly __ui?: TOptions
}

export type MessageProps<TOptions> = {
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  renderParts: () => JSX.Element
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

export type ChatUIComponents<TOptions> = {
  layout: Component<LayoutProps<TOptions>>
  message: Component<MessageProps<TOptions>>
  input?: Component<InputProps<TOptions>>
  parts: {
    [K in ChatUIPartKey]?: Component<PartProps<TOptions, K>>
  } & {
    fallback?: Component<PartProps<TOptions>>
  }
} & (ChatUIHasNamedTools<TOptions> extends true
  ? {
      tools: {
        [K in ChatUIToolName<TOptions>]: Component<ToolProps<TOptions, K>>
      }
    }
  : {
      tools?: {
        [K in ChatUIToolName<TOptions>]?: Component<ToolProps<TOptions, K>>
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

export function createUI<const TOptions>(options: TOptions) {
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

  function defineComponents(components: ChatUIComponents<TOptions>) {
    return components
  }

  function inlineNames(components: ChatUIComponents<TOptions>) {
    return collectInlineToolNames(
      components.interrupts?.tools as Record<string, unknown> | undefined,
      Object.keys(components.tools ?? {}),
    )
  }

  function Provider(props: {
    chat: ChatUIHost<TOptions>
    components: ChatUIComponents<TOptions>
    children?: JSX.Element
  }) {
    const componentsValue: ComponentsValue<TOptions> = {
      get components() {
        return props.components
      },
      warn,
      get inlineToolNames() {
        return inlineNames(props.components)
      },
    }
    return (
      <ComponentsContext.Provider value={componentsValue}>
        <ChatContext.Provider value={props.chat}>
          {props.children}
        </ChatContext.Provider>
      </ComponentsContext.Provider>
    )
  }

  function Chat(props: {
    chat: ChatUIHost<TOptions>
    components: ChatUIComponents<TOptions>
  }) {
    const Layout = props.components.layout
    return (
      <Provider chat={props.chat} components={props.components}>
        <Layout
          renderMessages={() => <Messages />}
          renderInterrupts={() => <Interrupts />}
          renderInput={() => {
            const Input = props.components.input
            return Input ? <Input /> : null
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
    const chat = useChat()
    const comps = useComponents()
    if (props.children) return <>{props.children(messagesAccessor(chat))}</>
    return (
      <For each={readMessages(chat)}>
        {(message) => (
          <MessageView
            inlineToolNames={comps.inlineToolNames}
            interrupts={readInterrupts(chat)}
            message={message}
          />
        )}
      </For>
    )
  }

  function MessageView(props: {
    message: UIMessage<any, any>
    interrupts: ReadonlyArray<any>
    inlineToolNames: ReadonlyArray<string>
    children?: (parts: Array<ChatUISelectedPart>) => JSX.Element
  }) {
    const comps = useComponents()
    const selected = selectMessageUI(props.message, {
      interrupts: props.interrupts,
      inlineToolNames: props.inlineToolNames,
    })
    if (props.children) return <>{props.children(selected.parts)}</>
    const MessageComponent = comps.components.message
    return (
      <MessageComponent
        message={props.message as MessageProps<TOptions>['message']}
        renderParts={() => (
          <AutomaticParts
            inlineToolNames={props.inlineToolNames}
            interrupts={props.interrupts}
            message={props.message}
          />
        )}
      />
    )
  }

  function Message(props: {
    message: UIMessage<any, any>
    children?: (parts: Array<ChatUISelectedPart>) => JSX.Element
  }) {
    const chat = useChat()
    const comps = useComponents()
    return (
      <MessageView
        children={props.children}
        inlineToolNames={comps.inlineToolNames}
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

  function SelectedPartView(props: { selected: ChatUISelectedPart }) {
    const comps = useComponents()
    if (props.selected.key === 'toolCall') {
      const name = props.selected.part.name
      const Tool = comps.components.tools?.[
        name as ChatUIToolName<TOptions>
      ] as Component<ToolProps<TOptions>> | undefined
      if (!Tool) {
        comps.warn(
          `tool:${name}`,
          `[tanstack-ai-ui] Missing tools.${name} component`,
        )
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
    const PartComponent = (comps.components.parts[props.selected.key] ??
      comps.components.parts.fallback) as
      | Component<PartProps<TOptions>>
      | undefined
    if (!PartComponent) {
      comps.warn(
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

  function Part(props: { part: MessagePart }) {
    const chat = useChat()
    const selected = selectMessageUI(
      { id: 'part', role: 'assistant', parts: [props.part] },
      { interrupts: readInterrupts(chat), inlineToolNames: [] },
    ).parts[0]
    if (!selected) return null
    return <SelectedPartView selected={selected} />
  }

  function Interrupts(props: {
    children?: (
      interrupts: Accessor<ReadonlyArray<ChatUIInterrupt>>,
    ) => JSX.Element
  }) {
    const chat = useChat()
    const comps = useComponents()
    const selected = () =>
      selectChatUI({
        messages: readMessages(chat),
        interrupts: readInterrupts(chat),
        inlineToolNames: comps.inlineToolNames,
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

  function Interrupt(props: { interrupt: ChatUIInterrupt }) {
    const comps = useComponents()
    const Component = resolveInterruptComponent(
      props.interrupt,
      comps.components.interrupts,
    ) as Component<InterruptProps<TOptions>> | undefined
    if (!Component) {
      comps.warn(
        `interrupt:${props.interrupt.id}`,
        `[tanstack-ai-ui] Missing interrupt component for ${props.interrupt.kind}`,
      )
      return null
    }
    return <Component interrupt={props.interrupt} />
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
