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
  QueuedMessage,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '@tanstack/ai-client'
import type { Handle, RemixNode } from 'remix/ui'
import type { CreateChatReturn } from '../types.ts'

export type ChatUIHost<TOptions = unknown> = CreateChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

export type ChatUIQueueItem = QueuedMessage & {
  cancelQueued: () => void
}

type RemixComp<P = Record<string, never>> = (
  handle: Handle<P>,
) => () => RemixNode

export type LayoutProps<TOptions> = {
  Messages: RemixComp
  Interrupts: RemixComp
  Queue: RemixComp
  Input: RemixComp
  readonly __ui?: TOptions
}

export type MessageProps<TOptions> = {
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  Parts: RemixComp
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

/** The chrome around the message list: `layout`, `message`, and `input`. */
export type ChatUIChromeComponents<TOptions> = {
  layout: RemixComp<LayoutProps<TOptions>>
  message: RemixComp<MessageProps<TOptions>>
  input?: RemixComp<InputProps<TOptions>>
  queue?: RemixComp<QueueProps<TOptions>>
}

export type ChatUIPartsComponents<TOptions> = {
  [K in ChatUIPartKey]?: RemixComp<PartProps<TOptions, K>>
} & {
  fallback?: RemixComp<PartProps<TOptions>>
}

export type ChatUIInterruptsComponents<TOptions> = {
  tools?: ToolApprovalMap<TOptions>
  generic: GenericInterruptComponents<TOptions>
}

export type ChatUIComponents<TOptions> = {
  components: ChatUIChromeComponents<TOptions>
  partsComponents: ChatUIPartsComponents<TOptions>
} & (ChatUIHasNamedTools<TOptions> extends true
  ? {
      toolsComponents: {
        [K in ChatUIToolName<TOptions>]: RemixComp<ToolProps<TOptions, K>>
      }
    }
  : {
      toolsComponents?: {
        [K in ChatUIToolName<TOptions>]?: RemixComp<ToolProps<TOptions, K>>
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

export type ChatUIFactoryConfig<TOptions> = ChatUIComponents<TOptions>

type ComponentsValue<TOptions> = {
  chat: ChatUIHost<TOptions>
  warn: (key: string, message: string) => void
  inlineToolNames: ReadonlyArray<string>
}

type ProviderProps<TOptions> = {
  chat: ChatUIHost<TOptions>
  children?: RemixNode
}

type MessageRenderValue<TOptions> = {
  message: ChatUIMessages<TOptions>[number]
  interrupts: ReadonlyArray<ChatUIInterrupt>
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

/**
 * Bind chat options and UI widgets once at module scope. This matches Form
 * `createFormHook` and Table `createTableHook`.
 *
 * `chatOptions` is type-only at runtime. Widgets register here in named
 * groups. `<ui.Chat chat={chat} />` closes over them, so you do not pass
 * a components prop at render time.
 */
export function createChatUI<const TOptions>(
  options: TOptions,
  config: ChatUIFactoryConfig<NoInfer<TOptions>>,
) {
  void options
  const {
    components,
    partsComponents: parts,
    toolsComponents: tools,
    interruptsComponents: interrupts,
  } = config as ChatUIFactoryConfig<TOptions> & {
    toolsComponents?: Record<string, RemixComp<any> | undefined>
    interruptsComponents?: {
      tools?: Record<string, RemixComp<any> | undefined>
      generic?: Record<string, RemixComp<any> | undefined>
    }
  }
  const {
    layout: Layout,
    message: MessageComponent,
    input: InputComponent,
    queue: QueueItemComponent,
  } = components
  const warn = createWarnOnce()
  const inlineToolNames = collectInlineToolNames(
    interrupts?.tools as Record<string, unknown> | undefined,
    Object.keys(tools ?? {}),
  )

  function Provider(
    handle: Handle<ProviderProps<TOptions>, ComponentsValue<TOptions>>,
  ) {
    handle.context.set({
      get chat() {
        return handle.props.chat
      },
      warn,
      inlineToolNames,
    })
    return () => handle.props.children ?? null
  }

  function useChatContext(handle: Handle<any>): ChatUIHost<TOptions> {
    const value = handle.context.get(Provider)
    if (!value?.chat) {
      throw new Error(
        '`useChatContext` must be used within `UI.Provider` or `UI.Chat`.',
      )
    }
    return value.chat
  }

  function MissingInput(_handle: Handle) {
    warn(
      'input',
      '[tanstack-ai-ui] Rendered <Input /> but no `input` component is registered.',
    )
    return () => null
  }

  function Chat(handle: Handle<{ chat: ChatUIHost<TOptions> }>) {
    return () => (
      <Provider chat={handle.props.chat}>
        <Layout
          Input={(InputComponent ?? MissingInput) as RemixComp}
          Interrupts={Interrupts}
          Messages={Messages}
          Queue={Queue}
        />
      </Provider>
    )
  }

  function Queue(handle: Handle<any>) {
    return () => {
      const chat = useChatContext(handle)
      if (!QueueItemComponent) return null
      return chat.queue.map((item) => (
        <QueueItemComponent
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

  function Messages(
    handle: Handle<{
      children?: (messages: ChatUIMessages<TOptions>) => RemixNode
    }>,
  ) {
    return () => {
      const chat = useChatContext(handle)
      const messages = readMessages(chat)
      const interruptsList = readInterrupts(chat)
      if (typeof handle.props.children === 'function') {
        return handle.props.children(messages)
      }
      return messages.map((message) => (
        <MessageView
          key={message.id}
          inlineToolNames={inlineToolNames}
          interrupts={interruptsList}
          message={message}
        />
      ))
    }
  }

  function MessageScope(
    handle: Handle<
      MessageRenderValue<TOptions> & { children?: RemixNode },
      MessageRenderValue<TOptions>
    >,
  ) {
    handle.context.set({
      get message() {
        return handle.props.message
      },
      get interrupts() {
        return handle.props.interrupts
      },
      get inlineToolNames() {
        return handle.props.inlineToolNames
      },
    })
    return () => handle.props.children ?? null
  }

  function Parts(handle: Handle<any>) {
    return () => {
      const scope = handle.context.get(MessageScope)
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
      const selected = selectMessageUI(handle.props.message, {
        interrupts: handle.props.interrupts,
        inlineToolNames: handle.props.inlineToolNames,
      })
      if (typeof handle.props.children === 'function') {
        return handle.props.children(selected.parts)
      }
      return (
        <MessageScope
          inlineToolNames={handle.props.inlineToolNames}
          interrupts={handle.props.interrupts}
          message={handle.props.message}
        >
          <MessageComponent Parts={Parts} message={handle.props.message} />
        </MessageScope>
      )
    }
  }

  function Message(
    handle: Handle<{
      message: ChatUIMessages<TOptions>[number]
      children?: (parts: Array<ChatUISelectedPart>) => RemixNode
    }>,
  ) {
    return () => {
      const chat = useChatContext(handle)
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

  function SelectedPartView(handle: Handle<{ selected: ChatUISelectedPart }>) {
    return () => {
      const selected = handle.props.selected
      if (selected.key === 'toolCall') {
        const name = selected.part.name
        const Tool = tools?.[name as ChatUIToolName<TOptions>] as
          | RemixComp<ToolProps<TOptions>>
          | undefined
        if (!Tool) {
          warn(
            `tool:${name}`,
            `[tanstack-ai-ui] Missing tools.${name} component`,
          )
          return null
        }
        return (
          <Tool
            interrupt={selected.interrupt as ToolProps<TOptions>['interrupt']}
            part={selected.part as ToolProps<TOptions>['part']}
            result={selected.result}
          />
        )
      }
      const PartComponent = (parts[selected.key] ?? parts.fallback) as
        | RemixComp<PartProps<TOptions>>
        | undefined
      if (!PartComponent) {
        warn(
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

  function Part(handle: Handle<{ part: MessagePart }>) {
    return () => {
      const chat = useChatContext(handle)
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
      const Component = resolveInterruptComponent(
        handle.props.interrupt,
        interrupts,
      ) as RemixComp<InterruptProps<TOptions>> | undefined
      if (!Component) {
        warn(
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
      const chat = useChatContext(handle)
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

  return {
    Chat,
    Provider,
    Queue,
    Messages,
    Message,
    Part,
    Interrupts,
    Interrupt: InterruptView,
    useChatContext,
    Input: InputComponent,
  }
}
