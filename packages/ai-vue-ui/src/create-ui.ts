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
  ChatUIInterrupt,
  ChatUIInterruptName,
  ChatUIInterruptOf,
  ChatUIInterruptsOf,
  ChatUINamedInterruptId,
  ChatUIPartKey,
  ChatUIPartOf,
  ChatUISchemaOf,
  ChatUIToolApproval,
  ChatUIToolName,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import type {
  MessagePart,
  ToolCallPart,
  ToolResultPart,
  UIMessage as UIMessageModel,
} from '@tanstack/ai-client'
import type { UseChatReturn } from '@tanstack/ai-vue'

export type ChatUIHost<TOptions = unknown> = UseChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

export type LayoutProps<TOptions> = {
  readonly __ui?: TOptions
}

export type MessageProps<TOptions> = {
  message: UIMessageModel<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
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
  layout: Component
  message: Component
  input?: Component
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

export type UIDescriptor<TOptions = unknown> = {
  key: InjectionKey<ChatUIHost<TOptions>>
  warn: (key: string, message: string) => void
  defineComponents: (
    components: ChatUIComponents<TOptions>,
  ) => ChatUIComponents<TOptions>
  useChat: () => ChatUIHost<TOptions>
}

type VueChatUIComponents = {
  layout: Component
  message: Component
  input?: Component
  parts: {
    [K in ChatUIPartKey]?: Component
  } & {
    fallback?: Component
  }
  tools?: Record<string, Component | undefined>
  interrupts?: {
    tools?: Record<string, unknown>
    generic?: Record<string, Component | undefined>
  }
}

type ComponentsValue = {
  components: VueChatUIComponents
  warn: (key: string, message: string) => void
  inlineToolNames: ReadonlyArray<string>
}

type UIRuntime<TOptions = unknown> = UIDescriptor<TOptions> & {
  componentsKey: InjectionKey<ComponentsValue>
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

function unwrapRef(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    'value' in value &&
    !Array.isArray(value)
  ) {
    return (value as { value: unknown }).value
  }
  return value
}

function readMessages<TOptions>(
  chat: ChatUIHost<TOptions>,
): ReadonlyArray<UIMessageModel> {
  const value = unwrapRef(chat.messages)
  return Array.isArray(value) ? value : []
}

function readInterrupts<TOptions>(
  chat: ChatUIHost<TOptions>,
): ReadonlyArray<ChatUIInterrupt> {
  const value = unwrapRef(chat.interrupts)
  return Array.isArray(value) ? value : []
}

function useChatContext<TOptions>(ui: UIDescriptor<TOptions>) {
  const chat = inject(ui.key)
  if (!chat) {
    throw new Error(
      'Chat UI components must be wrapped in UIProvider or UIChat.',
    )
  }
  return chat
}

function useComponentsContext(ui: UIDescriptor<unknown>) {
  const value = inject((ui as UIRuntime).componentsKey)
  if (!value) {
    throw new Error(
      'Chat UI components must be wrapped in UIProvider or UIChat.',
    )
  }
  return value
}

function inlineNames<TOptions>(components: ChatUIComponents<TOptions>) {
  return collectInlineToolNames(
    components.interrupts?.tools as Record<string, unknown> | undefined,
    Object.keys(components.tools ?? {}),
  )
}

function renderSelectedPart(
  selected: ReturnType<typeof automaticPartsForMessage>[number],
  comps: ComponentsValue,
): VNode | null {
  if (selected.key === 'toolCall') {
    const name = selected.part.name
    const Tool = comps.components.tools?.[name] as Component | undefined
    if (!Tool) {
      comps.warn(
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
  const PartComponent = (comps.components.parts[selected.key] ??
    comps.components.parts.fallback) as Component | undefined
  if (!PartComponent) {
    comps.warn(
      `part:${selected.key}`,
      `[tanstack-ai-ui] Missing parts.${selected.key} component`,
    )
    return null
  }
  return h(PartComponent, { part: selected.part })
}

export function createUI<const TOptions>(
  options: TOptions,
): UIDescriptor<TOptions> {
  void options
  const ui: UIRuntime<TOptions> = {
    key: Symbol('tanstack-ai-ui-chat') as InjectionKey<ChatUIHost<TOptions>>,
    componentsKey: Symbol(
      'tanstack-ai-ui-components',
    ) as InjectionKey<ComponentsValue>,
    warn: createWarnOnce(),
    defineComponents(components) {
      return components
    },
    useChat() {
      return useChatContext(ui)
    },
  }
  return ui
}

export const UIProvider = defineComponent({
  name: 'UIProvider',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
    chat: { type: Object, required: true },
    components: {
      type: Object as PropType<VueChatUIComponents>,
      required: true,
    },
  },
  setup(props, { slots }) {
    provide(props.ui.key, props.chat as ChatUIHost<any>)
    provide((props.ui as UIRuntime).componentsKey, {
      components: props.components,
      warn: props.ui.warn,
      inlineToolNames: inlineNames(props.components as ChatUIComponents<any>),
    })
    return () => slots.default?.()
  },
})

export const UIMessages = defineComponent({
  name: 'UIMessages',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
  },
  setup(props, { slots }) {
    return () => {
      const chat = useChatContext(props.ui)
      const messages = readMessages(chat)
      const interrupts = readInterrupts(chat)
      if (slots.default) return slots.default({ messages })
      return messages.map((message) =>
        h(UIMessage, {
          key: message.id,
          ui: props.ui,
          message,
          interrupts,
        }),
      )
    }
  },
})

const UISelectedPart = defineComponent({
  name: 'UISelectedPart',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
    selected: {
      type: Object as PropType<
        ReturnType<typeof automaticPartsForMessage>[number]
      >,
      required: true,
    },
  },
  setup(props) {
    return () =>
      renderSelectedPart(props.selected, useComponentsContext(props.ui))
  },
})

export const UIMessage = defineComponent({
  name: 'UIMessage',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
    message: { type: Object as PropType<UIMessageModel>, required: true },
    interrupts: {
      type: Array as PropType<ReadonlyArray<ChatUIInterrupt>>,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    return () => {
      const comps = useComponentsContext(props.ui)
      const interrupts =
        props.interrupts ?? readInterrupts(useChatContext(props.ui))
      const selected = selectMessageUI(props.message, {
        interrupts,
        inlineToolNames: comps.inlineToolNames,
      })
      if (slots.default) return slots.default({ parts: selected.parts })
      return h(
        comps.components.message,
        { message: props.message },
        {
          parts: () =>
            automaticPartsForMessage(selected).map((part, index) =>
              h(UISelectedPart, {
                key: `${props.message.id}-${index}`,
                ui: props.ui,
                selected: part,
              }),
            ),
        },
      )
    }
  },
})

export const UIPart = defineComponent({
  name: 'UIPart',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
    part: { type: Object as PropType<MessagePart>, required: true },
  },
  setup(props) {
    return () => {
      const selected = selectMessageUI(
        { id: 'part', role: 'assistant', parts: [props.part] },
        {
          interrupts: readInterrupts(useChatContext(props.ui)),
          inlineToolNames: [],
        },
      ).parts[0]
      if (!selected) return null
      return h(UISelectedPart, {
        ui: props.ui,
        selected,
      })
    }
  },
})

export const UIInterrupts = defineComponent({
  name: 'UIInterrupts',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
  },
  setup(props, { slots }) {
    return () => {
      const chat = useChatContext(props.ui)
      const comps = useComponentsContext(props.ui)
      const selected = selectChatUI({
        messages: readMessages(chat),
        interrupts: readInterrupts(chat),
        inlineToolNames: comps.inlineToolNames,
      })
      if (slots.default)
        return slots.default({ interrupts: selected.interrupts })
      return selected.interrupts.map((interrupt) =>
        h(UIInterrupt, { key: interrupt.id, ui: props.ui, interrupt }),
      )
    }
  },
})

export const UIInterrupt = defineComponent({
  name: 'UIInterrupt',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
    interrupt: { type: Object as PropType<ChatUIInterrupt>, required: true },
  },
  setup(props) {
    return () => {
      const comps = useComponentsContext(props.ui)
      const Component = resolveInterruptComponent(
        props.interrupt,
        comps.components.interrupts,
      ) as Component | undefined
      if (!Component) {
        comps.warn(
          `interrupt:${props.interrupt.id}`,
          `[tanstack-ai-ui] Missing interrupt component for ${props.interrupt.kind}`,
        )
        return null
      }
      return h(Component, { interrupt: props.interrupt })
    }
  },
})

export const UIChat = defineComponent({
  name: 'UIChat',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
    chat: { type: Object, required: true },
    components: {
      type: Object as PropType<VueChatUIComponents>,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(
        UIProvider,
        { ui: props.ui, chat: props.chat, components: props.components },
        {
          default: () =>
            h(
              props.components.layout,
              {},
              {
                messages: () => h(UIMessages, { ui: props.ui }),
                interrupts: () => h(UIInterrupts, { ui: props.ui }),
                input: () =>
                  props.components.input ? h(props.components.input) : null,
              },
            ),
        },
      )
  },
})
