import type { ComponentBody, Context, OctaneNode } from 'octane'
import type { UseChatReturn } from '../types'
import type { ChatUIContexts } from './create-ui-contexts.tsrx'
import type {
  ChatUIInterruptName,
  ChatUIInterruptsOf,
  ChatUIPartKey,
  ChatUIPartOf,
  ChatUISchemaOf,
  ChatUIToolName,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import type { QueuedMessage } from '@tanstack/ai-client'

type ComponentType<P = any> = ComponentBody<P>

export type ChatUIHost<TOptions = unknown> = UseChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

export type ChatUIQueueItem = QueuedMessage & { cancelQueued: () => void }

export type LayoutProps<
  TOptions,
  TInput extends ComponentType<any> | undefined = ComponentType<any>,
> = {
  Messages: ComponentType
  Interrupts: ComponentType
  Queue: ComponentType
  readonly __ui?: TOptions
} & (TInput extends ComponentType<any> ? { Input: ComponentType } : {})

export type MessageProps<TOptions> = {
  message: ChatUIHost<TOptions>['messages'][number]
  Parts: ComponentType
}

export type InputProps<TOptions> = { readonly __ui?: TOptions }
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
  part: { name: TName }
  result?: unknown
  interrupt?: unknown
}
export type InterruptProps<
  TOptions,
  TName extends ChatUIInterruptName<TOptions> = never,
> = {
  interrupt: { kind: string }
  readonly __ui?: TOptions
}

export type ChatUIFactoryConfig<
  TOptions,
  TInput extends ComponentType<any> | undefined = ComponentType<any>,
> = {
  components: {
    layout: ComponentType<LayoutProps<TOptions, TInput>>
    message: ComponentType<MessageProps<TOptions>>
    input?: TInput
    queue?: ComponentType<QueueProps<TOptions>>
  }
  partsComponents: Record<string, ComponentType<any> | undefined>
  toolsComponents?: Record<string, ComponentType<any> | undefined>
  interruptsComponents?: {
    tools?: Record<string, ComponentType<any> | undefined>
    generic?: Record<string, ComponentType<any> | undefined>
  }
  context?: {
    chatContext?: ChatUIContexts['chatContext']
    partContext?: ChatUIContexts['partContext']
    interruptContext?: ChatUIContexts['interruptContext']
  }
}

export type ChatUIComponents<
  TOptions,
  TInput extends ComponentType<any> | undefined = ComponentType<any>,
> = ChatUIFactoryConfig<TOptions, TInput>

export declare function createChatUI<
  const TOptions,
  TInput extends ComponentType<any> | undefined =
    | ComponentType<any>
    | undefined,
>(
  options: TOptions,
  config: ChatUIFactoryConfig<TOptions, TInput>,
): {
  Chat: ComponentType<{ chat: ChatUIHost<TOptions> }>
  Provider: ComponentType<{
    chat: ChatUIHost<TOptions>
    children?: OctaneNode
  }>
  Messages: ComponentType
  Message: ComponentType
  Part: ComponentType
  Interrupts: ComponentType
  Interrupt: ComponentType
  Queue: ComponentType
  useChatContext: () => ChatUIHost<TOptions>
  Input: TInput
}

export type { Context }
