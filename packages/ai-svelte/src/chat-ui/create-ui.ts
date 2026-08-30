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
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '@tanstack/ai-client'
import type { CreateChatReturn } from '../types'

export type ChatUIHost<TOptions = unknown> = CreateChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  unknown,
  ChatUIInterruptsOf<TOptions>
>

type GenericInterruptComponents<TOptions> =
  ChatUIHasNamedInterrupts<TOptions> extends true
    ? {
        [K in ChatUINamedInterruptId<TOptions>]: unknown
      } & {
        fallback?: unknown
      }
    : {
        fallback?: unknown
      }

type ToolApprovalMap<TOptions> = {
  [K in ChatUIToolName<TOptions>]?: unknown
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
} & (ChatUIHasNamedTools<TOptions> extends true
  ? { tools: { [K in ChatUIToolName<TOptions>]: unknown } }
  : { tools?: { [K in ChatUIToolName<TOptions>]?: unknown } }) &
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
  key: symbol
  warn: (key: string, message: string) => void
  components: ChatUIComponents<TOptions>
  useChatContext: () => ChatUIHost<TOptions>
}

export type UIContextValue<TOptions = unknown> = {
  chat: ChatUIHost<TOptions>
  components: ChatUIComponents<TOptions>
  ui: UIDescriptor<TOptions>
}

type ComponentsValue<TOptions = unknown> = {
  components: ChatUIComponents<TOptions>
  warn: (key: string, message: string) => void
  inlineToolNames: ReadonlyArray<string>
}

type UIRuntime<TOptions = unknown> = UIDescriptor<TOptions> & {
  componentsKey: symbol
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

export function createDescriptor<const TOptions>(
  components: ChatUIComponents<TOptions>,
): UIDescriptor<TOptions> {
  const ui: UIRuntime<TOptions> = {
    key: Symbol('tanstack-ai-ui-chat'),
    componentsKey: Symbol('tanstack-ai-ui-components'),
    warn: createWarnOnce(),
    components,
    useChatContext() {
      return getChatContext(ui)
    },
  }
  return ui
}

export function setUIContext<TOptions>(value: UIContextValue<TOptions>) {
  setContext(value.ui.key, value.chat)
  setContext((value.ui as UIRuntime).componentsKey, {
    components: value.components,
    warn: value.ui.warn,
    inlineToolNames: inlineNames(value.components),
  } satisfies ComponentsValue<TOptions>)
}

export function getChatContext<TOptions>(ui: UIDescriptor<TOptions>) {
  const chat = getContext<ChatUIHost<TOptions> | undefined>(ui.key)
  if (!chat) {
    throw new Error(
      'Chat UI components must be wrapped in UIProvider or UIChat.',
    )
  }
  return chat
}

export function getComponentsContext<TOptions>(ui: UIDescriptor<TOptions>) {
  const value = getContext<ComponentsValue<TOptions> | undefined>(
    (ui as UIRuntime).componentsKey,
  )
  if (!value) {
    throw new Error(
      'Chat UI components must be wrapped in UIProvider or UIChat.',
    )
  }
  return value
}

export function getUIContext<TOptions>(ui: UIDescriptor<TOptions>) {
  return {
    ui,
    chat: getChatContext(ui),
    components: getComponentsContext(ui).components,
  } satisfies UIContextValue<TOptions>
}

export function readMessages<TOptions>(chat: ChatUIHost<TOptions>) {
  return chat.messages ?? []
}

export function readInterrupts<TOptions>(chat: ChatUIHost<TOptions>) {
  return chat.interrupts ?? []
}

export function inlineNames<TOptions>(components: ChatUIComponents<TOptions>) {
  return collectInlineToolNames(
    components.interrupts?.tools as Record<string, unknown> | undefined,
    Object.keys(components.tools ?? {}),
  )
}

export function messageParts(
  message: UIMessage,
  interrupts: ReadonlyArray<ChatUIInterrupt>,
  inlineToolNames: ReadonlyArray<string>,
): Array<ChatUISelectedPart> {
  return automaticPartsForMessage(
    selectMessageUI(message, { interrupts, inlineToolNames }),
  )
}

export function listInterrupts<TOptions>(
  chat: ChatUIHost<TOptions>,
  inlineToolNames: ReadonlyArray<string>,
) {
  return selectChatUI({
    messages: readMessages(chat),
    interrupts: readInterrupts(chat),
    inlineToolNames,
  }).interrupts
}

export function toolComponent<TOptions>(
  components: ChatUIComponents<TOptions>,
  name: string,
) {
  return components.tools?.[name as never]
}

export function partComponent<TOptions>(
  components: ChatUIComponents<TOptions>,
  key: string,
) {
  return components.parts[key as ChatUIPartKey] ?? components.parts.fallback
}

export function interruptComponent<TOptions>(
  components: ChatUIComponents<TOptions>,
  interrupt: ChatUIInterrupt,
) {
  return resolveInterruptComponent(interrupt, components.interrupts)
}

export type LayoutProps<TOptions> = {
  readonly __ui?: TOptions
}
export type MessageProps<TOptions> = {
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
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
  readonly __ui?: TOptions
}
export type InterruptProps<
  TOptions,
  TName extends ChatUIInterruptName<TOptions> = never,
> = {
  interrupt: ChatUIInterruptOf<TOptions, TName>
  readonly __ui?: TOptions
}
