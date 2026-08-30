import { createContext, memo, useContext } from 'react'
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
import type { ToolCallPart, ToolResultPart, UIMessage } from '@tanstack/ai-client'
import type { UseChatReturn } from '../types'

export type ChatUIHost<TOptions = unknown> = UseChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

export type LayoutProps<TOptions> = {
  chat: ChatUIHost<TOptions>
  renderMessages: () => ReactNode
  renderInterrupts: () => ReactNode
  renderInput: () => ReactNode
}

export type MessageProps<TOptions> = {
  chat: ChatUIHost<TOptions>
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  renderParts: () => ReactNode
}

export type InputProps<TOptions> = {
  chat: ChatUIHost<TOptions>
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

type ChatTree = {
  chat: ChatUIHost
  components: ChatUIComponents<any>
  warn: (key: string, message: string) => void
  inlineToolNames: Array<string>
}

const ChatTreeContext = createContext<ChatTree | null>(null)

const warnedKeys = new Set<string>()
function warnMissing(key: string, message: string) {
  if (process.env.NODE_ENV === 'production') return
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  console.warn(message)
}

function useChatTree() {
  const tree = useContext(ChatTreeContext)
  if (!tree) {
    throw new Error('`useChatContext` must be used within `Chat`.')
  }
  return tree
}

export function useChatContext(): ChatUIHost {
  return useChatTree().chat
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

const SelectedPartInner = memo(function SelectedPartInner({
  selected,
}: {
  selected: ChatUISelectedPart
}) {
  const { components, warn } = useChatTree()
  if (selected.key === 'toolCall') {
    const name = selected.part.name
    const Tool = components.tools?.[name as never] as
      | ComponentType<ToolProps<any>>
      | undefined
    if (!Tool) {
      warn(`tool:${name}`, `[tanstack-ai-ui] Missing tools.${name} component`)
      return null
    }
    return (
      <Tool
        part={selected.part}
        result={selected.result}
        interrupt={selected.interrupt as ToolProps<any>['interrupt']}
      />
    )
  }

  const PartComponent = (components.parts[selected.key] ??
    components.parts.fallback) as ComponentType<PartProps<any>> | undefined
  if (!PartComponent) {
    warn(
      `part:${selected.key}`,
      `[tanstack-ai-ui] Missing parts.${selected.key} component`,
    )
    return null
  }
  return <PartComponent part={selected.part as PartProps<any>['part']} />
}, selectedPartPropsEqual)

function AutomaticParts({
  message,
}: {
  message: ChatUIMessages<any>[number]
}) {
  const { chat, inlineToolNames } = useChatTree()
  const selected = selectMessageUI(message, {
    interrupts: chat.interrupts ?? [],
    inlineToolNames,
  })
  return (
    <>
      {automaticPartsForMessage(selected).map((part, index) => (
        <SelectedPartInner key={`${message.id}-${index}`} selected={part} />
      ))}
    </>
  )
}

function Messages() {
  const { chat, components } = useChatTree()
  const MessageComponent = components.message
  return (
    <>
      {(chat.messages as ChatUIMessages<any>).map((message) => (
        <MessageComponent
          key={message.id}
          chat={chat}
          message={message}
          renderParts={() => <AutomaticParts message={message} />}
        />
      ))}
    </>
  )
}

function Interrupts() {
  const { chat, components, warn, inlineToolNames } = useChatTree()
  const selected = selectChatUI({
    messages: chat.messages,
    interrupts: chat.interrupts ?? [],
    inlineToolNames,
  })
  return (
    <>
      {selected.interrupts.map((interrupt) => {
        const Component = resolveInterruptComponent(
          interrupt,
          components.interrupts,
        ) as ComponentType<InterruptProps<any>> | undefined
        if (!Component) {
          warn(
            `interrupt:${interrupt.id}`,
            `[tanstack-ai-ui] Missing interrupt component for ${interrupt.kind}`,
          )
          return null
        }
        return <Component key={interrupt.id} interrupt={interrupt} />
      })}
    </>
  )
}

export function Chat<TOptions>({
  chat,
  components,
}: {
  chat: ChatUIHost<TOptions>
  components: ChatUIComponents<TOptions>
}) {
  const tools = (components as ChatUIComponents<any>).tools
  const inlineToolNames = collectInlineToolNames(
    components.interrupts?.tools as Record<string, unknown> | undefined,
    Object.keys(tools ?? {}),
  )
  const Layout = components.layout
  const Input = components.input
  const tree: ChatTree = {
    chat: chat as ChatUIHost,
    components: components as ChatUIComponents<any>,
    warn: warnMissing,
    inlineToolNames,
  }
  return (
    <ChatTreeContext.Provider value={tree}>
      <Layout
        chat={chat}
        renderMessages={() => <Messages />}
        renderInterrupts={() => <Interrupts />}
        renderInput={() => (Input ? <Input chat={chat} /> : null)}
      />
    </ChatTreeContext.Provider>
  )
}
