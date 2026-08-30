import { For, createContext, createMemo, useContext } from 'solid-js'
import type { Component, JSX } from 'solid-js'
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
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '@tanstack/ai-client'
import type { UseChatReturn } from '../types'

export type ChatUIHost<TOptions = unknown> = UseChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

export type LayoutProps<TOptions> = {
  chat: ChatUIHost<TOptions>
  renderMessages: () => JSX.Element
  renderInterrupts: () => JSX.Element
  renderInput: () => JSX.Element
}

export type MessageProps<TOptions> = {
  chat: ChatUIHost<TOptions>
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  renderParts: () => JSX.Element
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

type ChatTree = {
  chat: ChatUIHost
  components: ChatUIComponents<any>
  warn: (key: string, message: string) => void
  inlineToolNames: Array<string>
}

const ChatTreeContext = createContext<ChatTree>()

const warnedKeys = new Set<string>()
function warnMissing(key: string, message: string) {
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

function SelectedPart(props: { selected: ChatUISelectedPart }) {
  const tree = useChatTree()
  const selected = () => props.selected
  const node = createMemo(() => {
    const current = selected()
    if (current.key === 'toolCall') {
      const name = current.part.name
      const Tool = tree.components.tools?.[name as never] as
        | Component<ToolProps<any>>
        | undefined
      if (!Tool) {
        tree.warn(
          `tool:${name}`,
          `[tanstack-ai-ui] Missing tools.${name} component`,
        )
        return null
      }
      return (
        <Tool
          part={current.part}
          result={current.result}
          interrupt={current.interrupt as ToolProps<any>['interrupt']}
        />
      )
    }
    const PartComponent = (tree.components.parts[current.key] ??
      tree.components.parts.fallback) as Component<PartProps<any>> | undefined
    if (!PartComponent) {
      tree.warn(
        `part:${current.key}`,
        `[tanstack-ai-ui] Missing parts.${current.key} component`,
      )
      return null
    }
    return <PartComponent part={current.part as PartProps<any>['part']} />
  })
  return <>{node()}</>
}

function AutomaticParts(props: { message: UIMessage }) {
  const tree = useChatTree()
  const parts = createMemo(() => {
    const selected = selectMessageUI(props.message, {
      interrupts: tree.chat.interrupts(),
      inlineToolNames: tree.inlineToolNames,
    })
    return automaticPartsForMessage(selected)
  })
  return <For each={parts()}>{(part) => <SelectedPart selected={part} />}</For>
}

function Messages() {
  const tree = useChatTree()
  const MessageComponent = tree.components.message
  return (
    <For each={tree.chat.messages()}>
      {(message) => (
        <MessageComponent
          chat={tree.chat}
          message={message}
          renderParts={() => <AutomaticParts message={message} />}
        />
      )}
    </For>
  )
}

function Interrupts() {
  const tree = useChatTree()
  const selected = createMemo(() =>
    selectChatUI({
      messages: tree.chat.messages(),
      interrupts: tree.chat.interrupts(),
      inlineToolNames: tree.inlineToolNames,
    }),
  )
  return (
    <For each={selected().interrupts}>
      {(interrupt) => {
        const Component = resolveInterruptComponent(
          interrupt,
          tree.components.interrupts,
        ) as Component<InterruptProps<any>> | undefined
        if (!Component) {
          tree.warn(
            `interrupt:${interrupt.id}`,
            `[tanstack-ai-ui] Missing interrupt component for ${interrupt.kind}`,
          )
          return null
        }
        return <Component interrupt={interrupt} />
      }}
    </For>
  )
}

export function Chat<TOptions>(props: {
  chat: ChatUIHost<TOptions>
  components: ChatUIComponents<TOptions>
}) {
  const tree: ChatTree = {
    get chat() {
      return props.chat as ChatUIHost
    },
    get components() {
      return props.components as ChatUIComponents<any>
    },
    warn: warnMissing,
    get inlineToolNames() {
      const tools = (props.components as ChatUIComponents<any>).tools
      return collectInlineToolNames(
        props.components.interrupts?.tools as
          | Record<string, unknown>
          | undefined,
        Object.keys(tools ?? {}),
      )
    },
  }
  return (
    <ChatTreeContext.Provider value={tree}>
      {(() => {
        const Layout = props.components.layout
        const Input = props.components.input
        return (
          <Layout
            chat={props.chat}
            renderMessages={() => <Messages />}
            renderInterrupts={() => <Interrupts />}
            renderInput={() => (Input ? <Input chat={props.chat} /> : null)}
          />
        )
      })()}
    </ChatTreeContext.Provider>
  )
}
