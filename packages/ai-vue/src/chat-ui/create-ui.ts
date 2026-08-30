import { defineComponent, h, inject, provide } from 'vue'
import type { Component, InjectionKey, PropType, VNode } from 'vue'
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
import type { ToolCallPart, ToolResultPart, UIMessage } from '@tanstack/ai-client'
import type { UseChatReturn } from '../types'

export type ChatUIHost<TOptions = unknown> = UseChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

export type LayoutProps<TOptions> = {
  chat: ChatUIHost<TOptions>
}

export type MessageProps<TOptions> = {
  chat: ChatUIHost<TOptions>
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
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
        [K in ChatUINamedInterruptId<TOptions>]: Component
      } & {
        fallback?: Component
      }
    : {
        fallback?: Component
      }

type ToolApprovalMap<TOptions> = {
  [K in ChatUIToolName<TOptions>]?: Component
}

export type ChatUIComponents<TOptions> = {
  layout: Component
  message: Component
  input?: Component
  parts: {
    [K in ChatUIPartKey]?: Component
  } & {
    fallback?: Component
  }
} & (ChatUIHasNamedTools<TOptions> extends true
  ? {
      tools: {
        [K in ChatUIToolName<TOptions>]: Component
      }
    }
  : {
      tools?: {
        [K in ChatUIToolName<TOptions>]?: Component
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

const TREE_KEY: InjectionKey<ChatTree> = Symbol('tanstack-ai-ui-tree')

function useChatTree() {
  const tree = inject(TREE_KEY)
  if (!tree) {
    throw new Error('`useChatContext` must be used within `Chat`.')
  }
  return tree
}

export function useChatContext(): ChatUIHost {
  return useChatTree().chat
}

function unwrap<T>(value: T | { value: T } | (() => T)): T {
  if (typeof value === 'function') return (value as () => T)()
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as { value: T }).value
  }
  return value
}

const warnedKeys = new Set<string>()
function warnMissing(key: string, message: string) {
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  console.warn(message)
}

function renderSelectedPart(
  selected: ChatUISelectedPart,
  tree: ChatTree,
): VNode | null {
  if (selected.key === 'toolCall') {
    const name = selected.part.name
    const Tool = tree.components.tools?.[name as never] as Component | undefined
    if (!Tool) {
      tree.warn(
        `tool:${name}`,
        `[tanstack-ai-ui] Missing tools.${name} component`,
      )
      return null
    }
    return h(Tool, {
      part: selected.part,
      result: selected.result,
      interrupt: selected.interrupt,
    })
  }
  const PartComponent = (tree.components.parts[selected.key] ??
    tree.components.parts.fallback) as Component | undefined
  if (!PartComponent) {
    tree.warn(
      `part:${selected.key}`,
      `[tanstack-ai-ui] Missing parts.${selected.key} component`,
    )
    return null
  }
  return h(PartComponent, { part: selected.part })
}

export const Chat = defineComponent({
  name: 'Chat',
  props: {
    chat: { type: Object, required: true },
    components: {
      type: Object as PropType<ChatUIComponents<any>>,
      required: true,
    },
  },
  setup(props) {
    const tree = {
      get chat() {
        return props.chat
      },
      get components() {
        return props.components
      },
      warn: warnMissing,
      get inlineToolNames() {
        const tools = props.components.tools
        return collectInlineToolNames(
          props.components.interrupts?.tools as
            | Record<string, unknown>
            | undefined,
          Object.keys(tools ?? {}),
        )
      },
    } as ChatTree
    provide(TREE_KEY, tree)

    return () => {
      const Layout = props.components.layout
      const Input = props.components.input
      const MessageComponent = props.components.message
      const messages = unwrap(props.chat.messages as never) as Array<UIMessage>
      const interrupts = unwrap((props.chat.interrupts ?? []) as never) as Array<
        ChatTree extends never ? never : any
      >
      const inlineToolNames = tree.inlineToolNames

      const messageNodes = messages.map((message) => {
        const selected = selectMessageUI(message, {
          interrupts,
          inlineToolNames,
        })
        const parts = automaticPartsForMessage(selected).map((part, index) =>
          h('span', { key: `${message.id}-${index}` }, [
            renderSelectedPart(part, tree),
          ]),
        )
        return h(
          MessageComponent,
          { key: message.id, chat: props.chat, message },
          { parts: () => parts, default: () => parts },
        )
      })

      const selected = selectChatUI({
        messages,
        interrupts,
        inlineToolNames,
      })
      const interruptNodes = selected.interrupts.map((interrupt) => {
        const Component = resolveInterruptComponent(
          interrupt,
          props.components.interrupts,
        ) as Component | undefined
        if (!Component) {
          warnMissing(
            `interrupt:${interrupt.id}`,
            `[tanstack-ai-ui] Missing interrupt component for ${interrupt.kind}`,
          )
          return null
        }
        return h(Component, { key: interrupt.id, interrupt })
      })

      return h(
        Layout,
        { chat: props.chat },
        {
          messages: () => messageNodes,
          interrupts: () => interruptNodes,
          input: () => (Input ? h(Input, { chat: props.chat }) : null),
          default: () => [
            messageNodes,
            interruptNodes,
            Input ? h(Input, { chat: props.chat }) : null,
          ],
        },
      )
    }
  },
})
