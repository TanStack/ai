import {
  automaticPartsForMessage,
  bindChatUIQueue,
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
  ChatUIQueueItem,
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
import type { Handle, RemixNode } from 'remix/ui'
import type { CreateChatReturn } from '../types.ts'

export type { ChatUIQueueItem }

export type ChatUIHost<TOptions = unknown> = CreateChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

type RemixComp<P = Record<string, never>> = (
  handle: Handle<P>,
) => () => RemixNode

export type LayoutProps<TOptions> = {
  renderMessages: () => RemixNode
  renderInterrupts: () => RemixNode
  renderInput: () => RemixNode
  queue?: Array<ChatUIQueueItem>
  renderQueue?: () => RemixNode
  readonly __ui?: TOptions
}

export type MessageProps<TOptions> = {
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  renderParts: () => RemixNode
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
        [K in ChatUINamedInterruptId<TOptions>]: RemixComp<
          InterruptProps<TOptions, K & ChatUIInterruptName<TOptions>>
        >
      } & {
        fallback?: RemixComp<InterruptProps<TOptions>>
      }
    : {
        fallback?: RemixComp<InterruptProps<TOptions>>
      }

type ToolApprovalMap<TOptions> = {
  [K in ChatUIToolName<TOptions>]?: RemixComp<
    InterruptProps<TOptions, K & ChatUIInterruptName<TOptions>>
  >
}

export type ChatUIComponents<TOptions> = {
  layout: RemixComp<LayoutProps<TOptions>>
  message: RemixComp<MessageProps<TOptions>>
  input?: RemixComp<InputProps<TOptions>>
  queue?: RemixComp<QueueProps<TOptions>>
  parts: {
    [K in ChatUIPartKey]?: RemixComp<PartProps<TOptions, K>>
  } & {
    fallback?: RemixComp<PartProps<TOptions>>
  }
} & (ChatUIHasNamedTools<TOptions> extends true
  ? {
      tools: {
        [K in ChatUIToolName<TOptions>]: RemixComp<ToolProps<TOptions, K>>
      }
    }
  : {
      tools?: {
        [K in ChatUIToolName<TOptions>]?: RemixComp<ToolProps<TOptions, K>>
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
  chat: ChatUIHost<TOptions>
  components: ChatUIComponents<TOptions>
  warn: (key: string, message: string) => void
  inlineToolNames: ReadonlyArray<string>
}

type ProviderProps<TOptions> = {
  chat: ChatUIHost<TOptions>
  components: ChatUIComponents<TOptions>
  children?: RemixNode
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

export function createChatUI<const TOptions>(options: TOptions) {
  void options
  const warn = createWarnOnce()

  function inlineNames(components: ChatUIComponents<TOptions>) {
    return collectInlineToolNames(
      components.interrupts?.tools as Record<string, unknown> | undefined,
      Object.keys(components.tools ?? {}),
    )
  }

  function Provider(
    handle: Handle<ProviderProps<TOptions>, ComponentsValue<TOptions>>,
  ) {
    handle.context.set({
      get chat() {
        return handle.props.chat
      },
      get components() {
        return handle.props.components
      },
      warn,
      get inlineToolNames() {
        return inlineNames(handle.props.components)
      },
    })
    return () => handle.props.children ?? null
  }

  function useChat(handle: Handle<any>): ChatUIHost<TOptions> {
    const value = handle.context.get(Provider)
    if (!value?.chat) {
      throw new Error(
        'Chat UI components must be wrapped in UI.Provider or UI.Chat.',
      )
    }
    return value.chat
  }

  function useComponents(handle: Handle<any>): ComponentsValue<TOptions> {
    const value = handle.context.get(Provider)
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

  function SelectedPartView(handle: Handle<{ selected: ChatUISelectedPart }>) {
    return () => {
      const { components, warn: warnMissing } = useComponents(handle)
      const selected = handle.props.selected
      if (selected.key === 'toolCall') {
        const name = selected.part.name
        const Tool = components.tools?.[name as ChatUIToolName<TOptions>] as
          | RemixComp<ToolProps<TOptions>>
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
        components.parts.fallback) as RemixComp<PartProps<TOptions>> | undefined
      if (!PartComponent) {
        warnMissing(
          `part:${selected.key}`,
          `[tanstack-ai-ui] Missing parts.${selected.key} component`,
        )
        return null
      }
      return (
        <PartComponent part={selected.part as PartProps<TOptions>['part']} />
      )
    }
  }

  function AutomaticParts(
    handle: Handle<{
      message: ChatUIMessages<TOptions>[number]
      interrupts: ReadonlyArray<ChatUIInterrupt>
      inlineToolNames: ReadonlyArray<string>
    }>,
  ) {
    return () => {
      const selected = selectMessageUI(handle.props.message, {
        interrupts: handle.props.interrupts,
        inlineToolNames: handle.props.inlineToolNames,
      })
      return automaticPartsForMessage(selected).map((part, index) => (
        <SelectedPartView
          key={`${handle.props.message.id}-${index}`}
          selected={part}
        />
      ))
    }
  }

  function MessageView(
    handle: Handle<{
      message: ChatUIMessages<TOptions>[number]
      interrupts: ReadonlyArray<ChatUIInterrupt>
      inlineToolNames: ReadonlyArray<string>
      children?: (parts: Array<ChatUISelectedPart>) => RemixNode
    }>,
  ) {
    return () => {
      const { components } = useComponents(handle)
      const selected = selectMessageUI(handle.props.message, {
        interrupts: handle.props.interrupts,
        inlineToolNames: handle.props.inlineToolNames,
      })
      if (typeof handle.props.children === 'function') {
        return handle.props.children(selected.parts)
      }
      const MessageComponent = components.message
      return (
        <MessageComponent
          message={handle.props.message}
          renderParts={() => (
            <AutomaticParts
              inlineToolNames={handle.props.inlineToolNames}
              interrupts={handle.props.interrupts}
              message={handle.props.message}
            />
          )}
        />
      )
    }
  }

  function Messages(
    handle: Handle<{
      children?: (messages: ChatUIMessages<TOptions>) => RemixNode
    }>,
  ) {
    return () => {
      const chat = useChat(handle)
      const { inlineToolNames } = useComponents(handle)
      const messages = readMessages(chat)
      const interrupts = readInterrupts(chat)
      if (typeof handle.props.children === 'function') {
        return handle.props.children(messages)
      }
      return messages.map((message) => (
        <MessageView
          key={message.id}
          inlineToolNames={inlineToolNames}
          interrupts={interrupts}
          message={message}
        />
      ))
    }
  }

  function Message(
    handle: Handle<{
      message: ChatUIMessages<TOptions>[number]
      children?: (parts: Array<ChatUISelectedPart>) => RemixNode
    }>,
  ) {
    return () => {
      const chat = useChat(handle)
      const { inlineToolNames } = useComponents(handle)
      return (
        <MessageView
          children={handle.props.children}
          inlineToolNames={inlineToolNames}
          interrupts={readInterrupts(chat)}
          message={handle.props.message}
        />
      )
    }
  }

  function Part(handle: Handle<{ part: MessagePart }>) {
    return () => {
      const chat = useChat(handle)
      const selected = selectMessageUI(
        { id: 'part', role: 'assistant', parts: [handle.props.part] },
        { interrupts: readInterrupts(chat), inlineToolNames: [] },
      ).parts[0]
      if (!selected) return null
      return <SelectedPartView selected={selected} />
    }
  }

  function InterruptView(handle: Handle<{ interrupt: ChatUIInterrupt }>) {
    return () => {
      const { components, warn: warnMissing } = useComponents(handle)
      const Component = resolveInterruptComponent(
        handle.props.interrupt,
        components.interrupts,
      ) as RemixComp<InterruptProps<TOptions>> | undefined
      if (!Component) {
        warnMissing(
          `interrupt:${handle.props.interrupt.id}`,
          `[tanstack-ai-ui] Missing interrupt component for ${handle.props.interrupt.kind}`,
        )
        return null
      }
      return <Component interrupt={handle.props.interrupt} />
    }
  }

  function Interrupts(
    handle: Handle<{
      children?: (interrupts: ReadonlyArray<ChatUIInterrupt>) => RemixNode
    }>,
  ) {
    return () => {
      const chat = useChat(handle)
      const { inlineToolNames } = useComponents(handle)
      const selected = selectChatUI({
        messages: readMessages(chat),
        interrupts: readInterrupts(chat),
        inlineToolNames,
      })
      if (typeof handle.props.children === 'function') {
        return handle.props.children(selected.interrupts)
      }
      return selected.interrupts.map((interrupt) => (
        <InterruptView key={interrupt.id} interrupt={interrupt} />
      ))
    }
  }

  function QueueComponent(handle: Handle<any>) {
    return () => {
      const chat = useChat(handle)
      const { components } = useComponents(handle)
      const QueueItem = components.queue
      if (!QueueItem) return null
      return chat.queue.map((item) => (
        <QueueItem
          key={item.id}
          item={{
            ...item,
            cancelQueued: () => {
              chat.cancelQueued(item.id)
            },
          }}
        />
      ))
    }
  }

  function Chat(
    handle: Handle<{
      chat: ChatUIHost<TOptions>
      components: ChatUIComponents<TOptions>
    }>,
  ) {
    return () => {
      const chat = handle.props.chat
      const components = handle.props.components
      const Layout = components.layout
      const queue = bindChatUIQueue(chat.queue, chat.cancelQueued)
      return (
        <Provider chat={chat} components={components}>
          <Layout
            queue={queue}
            renderMessages={() => <Messages />}
            renderInterrupts={() => <Interrupts />}
            renderInput={() => {
              const Input = components.input
              return Input ? <Input /> : null
            }}
            renderQueue={() => <QueueComponent />}
          />
        </Provider>
      )
    }
  }

  return {
    Chat,
    Provider,
    Queue: QueueComponent,
    Messages,
    Message,
    Part,
    Interrupts,
    Interrupt: InterruptView,
    defineComponents,
    useChat,
  }
}
