import { getContext, setContext } from 'svelte'
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
import type { MessagePart, UIMessage } from '@tanstack/ai-client'

// ponytail: duck-typed so createChat assigns; UIMessage generics are invariant
export type ChatUIHost = {
  messages: ReadonlyArray<any>
  interrupts?: ReadonlyArray<any>
  error?: Error
  isLoading?: boolean
  status?: string
  sendMessage?: (content: string, ...args: Array<any>) => Promise<void> | void
}

export type ChatUIComponents<TOptions> = {
  layout: unknown
  message: unknown
  input?: unknown
  parts: {
    [K in ChatUIPartKey]?: unknown
  } & {
    fallback?: unknown
  }
  tools?: {
    [K in ChatUIToolName<TOptions>]?: unknown
  }
  interrupts?: {
    tools?: {
      [K in ChatUIToolName<TOptions>]?:
        | unknown
        | { component: unknown; placement?: 'inline' | 'list' }
    }
    registered?: {
      [K in ChatUIRegisteredInterruptId<TOptions>]?: unknown
    }
    generic?: unknown
    unbound?: unknown
    fallback?: unknown
  }
}

export type UIDescriptor<TOptions = unknown> = {
  key: symbol
  warn: (key: string, message: string) => void
  defineComponents: (
    components: ChatUIComponents<TOptions>,
  ) => ChatUIComponents<TOptions>
}

export type UIContextValue<TOptions = unknown> = {
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

export function createUI<const TOptions>(
  options: TOptions,
): UIDescriptor<TOptions> {
  void options
  return {
    key: Symbol('tanstack-ai-ui'),
    warn: createWarnOnce(),
    defineComponents(components) {
      return components
    },
  }
}

export function setUIContext<TOptions>(value: UIContextValue<TOptions>) {
  setContext(value.ui.key, value)
}

export function getUIContext<TOptions>(ui: UIDescriptor<TOptions>) {
  const value = getContext<UIContextValue<TOptions> | undefined>(ui.key)
  if (!value) {
    throw new Error(
      'Chat UI components must be wrapped in UIProvider or UIChat.',
    )
  }
  return value
}

export function readMessages(chat: ChatUIHost) {
  return chat.messages ?? []
}

export function readInterrupts(chat: ChatUIHost) {
  return chat.interrupts ?? []
}

export function inlineNames<TOptions>(components: ChatUIComponents<TOptions>) {
  return collectInlineToolNames(
    components.interrupts?.tools as Record<string, unknown> | undefined,
  )
}

export function messageParts(
  ctx: UIContextValue,
  message: UIMessage,
): Array<ChatUISelectedPart> {
  return automaticPartsForMessage(
    selectMessageUI(message, {
      interrupts: readInterrupts(ctx.chat),
      inlineToolNames: inlineNames(ctx.components),
    }),
  )
}

export function listInterrupts(ctx: UIContextValue) {
  return selectChatUI({
    messages: readMessages(ctx.chat),
    interrupts: readInterrupts(ctx.chat),
    inlineToolNames: inlineNames(ctx.components),
  }).interrupts
}

export function toolComponent(ctx: UIContextValue, name: string) {
  return ctx.components.tools?.[name as never]
}

export function partComponent(ctx: UIContextValue, key: string) {
  return (
    ctx.components.parts[key as ChatUIPartKey] ?? ctx.components.parts.fallback
  )
}

export function interruptComponent(
  ctx: UIContextValue,
  interrupt: ChatUIInterrupt,
) {
  return resolveInterruptComponent(interrupt, ctx.components.interrupts)
}

export type LayoutProps<TOptions> = {
  chat: ChatUIHost
  readonly __ui?: TOptions
}
export type MessageProps<TOptions> = {
  chat: ChatUIHost
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
}
export type InputProps<TOptions> = {
  chat: ChatUIHost
  readonly __ui?: TOptions
}
export type PartProps<TOptions> = {
  chat: ChatUIHost
  part: MessagePart<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
}
export type ToolProps<TOptions> = {
  chat: ChatUIHost
  part: unknown
  result?: unknown
  interrupt?: unknown
  readonly __ui?: TOptions
}
export type InterruptProps<TOptions> = {
  chat: ChatUIHost
  interrupt: ChatUIInterrupt | RegisteredUIInterrupt<TOptions>
}
