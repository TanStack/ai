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
  ChatUIInterrupt,
  ChatUIPartKey,
  ChatUIRegisteredInterruptId,
  ChatUIToolName,
  ChatUIToolsOf,
  RegisteredUIInterrupt,
} from '@tanstack/ai-client/ui'
import type {
  MessagePart,
  ToolCallPart,
  ToolResultPart,
  UIMessage as UIMessageModel,
} from '@tanstack/ai-client'

// ponytail: Vue refs are invariant; readers narrow arrays at runtime
export type ChatUIHost = {
  messages: unknown
  interrupts?: unknown
  error?: unknown
  isLoading?: unknown
  status?: unknown
  sendMessage?: (content: string, ...args: Array<any>) => Promise<void> | void
}

export type LayoutProps<TOptions> = {
  chat: ChatUIHost
  readonly __ui?: TOptions
}

export type MessageProps<TOptions> = {
  chat: ChatUIHost
  message: UIMessageModel<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
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
  renderInterrupt: () => VNode | null
}

export type InterruptProps<TOptions> = {
  chat: ChatUIHost
  interrupt: ChatUIInterrupt
  readonly __ui?: TOptions
}

type InterruptEntry<TOptions> =
  | Component<InterruptProps<TOptions>>
  | {
      component: Component<InterruptProps<TOptions>>
      placement?: 'inline' | 'list'
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
  tools?: {
    [K in ChatUIToolName<TOptions>]?: Component<ToolProps<TOptions, K>>
  }
  interrupts?: {
    tools?: {
      [K in ChatUIToolName<TOptions>]?: InterruptEntry<TOptions>
    }
    registered?: {
      [K in ChatUIRegisteredInterruptId<TOptions>]?: Component<{
        chat: ChatUIHost
        interrupt: RegisteredUIInterrupt<TOptions, K>
      }>
    }
    generic?: Component<InterruptProps<TOptions>>
    unbound?: Component<InterruptProps<TOptions>>
    fallback?: Component<InterruptProps<TOptions>>
  }
}

export type UIDescriptor<TOptions = unknown> = {
  key: InjectionKey<UIContextValue<TOptions>>
  warn: (key: string, message: string) => void
  defineComponents: (
    components: ChatUIComponents<TOptions>,
  ) => ChatUIComponents<TOptions>
}

type UIContextValue<TOptions> = {
  chat: ChatUIHost
  components: ChatUIComponents<TOptions>
  ui: UIDescriptor<TOptions>
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

function readMessages(chat: ChatUIHost): ReadonlyArray<UIMessageModel> {
  const value = unwrapRef(chat.messages)
  return Array.isArray(value) ? value : []
}

function readInterrupts(chat: ChatUIHost): ReadonlyArray<ChatUIInterrupt> {
  const value = unwrapRef(chat.interrupts)
  return Array.isArray(value) ? value : []
}

function useUI<TOptions>(ui: UIDescriptor<TOptions>) {
  const value = inject(ui.key)
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
  )
}

function renderSelectedPart<TOptions>(
  selected: ReturnType<typeof automaticPartsForMessage>[number],
  ctx: UIContextValue<TOptions>,
  inline: boolean,
): VNode | null {
  if (selected.key === 'toolCall') {
    const name = selected.part.name
    const Tool = ctx.components.tools?.[name as ChatUIToolName<TOptions>] as
      | Component
      | undefined
    if (!Tool) {
      ctx.ui.warn(
        `tool:${name}`,
        `[tanstack-ai-ui] Missing tools.${name} component`,
      )
      return null
    }
    return h(Tool, {
      chat: ctx.chat,
      part: selected.part,
      result: selected.result,
      interrupt: selected.interrupt,
      renderInterrupt: () => {
        if (!inline || selected.interrupt?.kind !== 'tool-approval') return null
        if (
          !inlineNames(ctx.components).includes(selected.interrupt.toolName)
        ) {
          return null
        }
        const Component = resolveInterruptComponent(
          selected.interrupt,
          ctx.components.interrupts,
        ) as Component | undefined
        if (!Component) return null
        return h(Component, { chat: ctx.chat, interrupt: selected.interrupt })
      },
    })
  }
  const PartComponent =
    ctx.components.parts[selected.key] ?? ctx.components.parts.fallback
  if (!PartComponent) {
    ctx.ui.warn(
      `part:${selected.key}`,
      `[tanstack-ai-ui] Missing parts.${selected.key} component`,
    )
    return null
  }
  return h(PartComponent, { chat: ctx.chat, part: selected.part })
}

export function createUI<const TOptions>(
  options: TOptions,
): UIDescriptor<TOptions> {
  void options
  const key = Symbol('tanstack-ai-ui') as InjectionKey<UIContextValue<TOptions>>
  return {
    key,
    warn: createWarnOnce(),
    defineComponents(components) {
      return components
    },
  }
}

export const UIProvider = defineComponent({
  name: 'UIProvider',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
    chat: { type: Object as PropType<ChatUIHost>, required: true },
    components: {
      type: Object as PropType<ChatUIComponents<any>>,
      required: true,
    },
  },
  setup(props, { slots }) {
    provide(props.ui.key, {
      chat: props.chat,
      components: props.components,
      ui: props.ui,
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
      const ctx = useUI(props.ui)
      const messages = readMessages(ctx.chat)
      if (slots.default) return slots.default({ messages })
      return messages.map((message) => h(UIMessage, { ui: props.ui, message }))
    }
  },
})

export const UIMessage = defineComponent({
  name: 'UIMessage',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
    message: { type: Object as PropType<UIMessageModel>, required: true },
  },
  setup(props, { slots }) {
    return () => {
      const ctx = useUI(props.ui)
      const selected = selectMessageUI(props.message, {
        interrupts: readInterrupts(ctx.chat),
        inlineToolNames: inlineNames(ctx.components),
      })
      if (slots.default) return slots.default({ parts: selected.parts })
      return h(
        ctx.components.message,
        { chat: ctx.chat, message: props.message },
        {
          parts: () =>
            automaticPartsForMessage(selected).map((part) =>
              renderSelectedPart(part, ctx, true),
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
      const ctx = useUI(props.ui)
      const selected = selectMessageUI(
        { id: 'part', role: 'assistant', parts: [props.part] },
        { interrupts: readInterrupts(ctx.chat), inlineToolNames: [] },
      ).parts[0]
      if (!selected) return null
      return renderSelectedPart(selected, ctx, false)
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
      const ctx = useUI(props.ui)
      const selected = selectChatUI({
        messages: readMessages(ctx.chat),
        interrupts: readInterrupts(ctx.chat),
        inlineToolNames: inlineNames(ctx.components),
      })
      if (slots.default)
        return slots.default({ interrupts: selected.interrupts })
      return selected.interrupts.map((interrupt) =>
        h(UIInterrupt, { ui: props.ui, interrupt }),
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
      const ctx = useUI(props.ui)
      const Component = resolveInterruptComponent(
        props.interrupt,
        ctx.components.interrupts,
      ) as Component | undefined
      if (!Component) {
        ctx.ui.warn(
          `interrupt:${props.interrupt.id}`,
          `[tanstack-ai-ui] Missing interrupt component for ${props.interrupt.kind}`,
        )
        return null
      }
      return h(Component, { chat: ctx.chat, interrupt: props.interrupt })
    }
  },
})

export const UIChat = defineComponent({
  name: 'UIChat',
  props: {
    ui: { type: Object as PropType<UIDescriptor<any>>, required: true },
    chat: { type: Object as PropType<ChatUIHost>, required: true },
    components: {
      type: Object as PropType<ChatUIComponents<any>>,
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
              { chat: props.chat },
              {
                messages: () => h(UIMessages, { ui: props.ui }),
                interrupts: () => h(UIInterrupts, { ui: props.ui }),
                input: () =>
                  props.components.input
                    ? h(props.components.input, { chat: props.chat })
                    : null,
              },
            ),
        },
      )
  },
})
