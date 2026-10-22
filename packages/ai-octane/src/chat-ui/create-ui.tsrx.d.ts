import type { ComponentBody, OctaneNode } from 'octane'
type ComponentType<P = any> = ComponentBody<P>
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
import type { UseChatReturn } from '../types'
import type { ChatUIContexts } from './create-ui-contexts.tsrx'
export type ChatUIHost<TOptions = unknown> = UseChatReturn<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>
export type ChatUIQueueItem = QueuedMessage & {
  cancelQueued: () => void
}
export type LayoutProps<
  TOptions,
  TInput extends ComponentType<any> | undefined = ComponentType<
    InputProps<TOptions>
  >,
> = {
  Messages: ComponentType
  Interrupts: ComponentType
  Queue: ComponentType
  readonly __ui?: TOptions
} & (TInput extends ComponentType<any>
  ? {
      Input: ComponentType
    }
  : {})
export type MessageProps<TOptions> = {
  message: UIMessage<ChatUIToolsOf<TOptions>, ChatUIData<TOptions>>
  Parts: ComponentType
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
  part: Extract<
    ToolCallPart<ChatUIToolsOf<TOptions>>,
    {
      name: TName
    }
  >
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
/** The chrome around the message list: `layout`, `message`, and `input`. */
export type ChatUIChromeComponents<
  TOptions,
  TInput extends ComponentType<InputProps<TOptions>> | undefined =
    ComponentType<InputProps<TOptions>>,
> = {
  layout: ComponentType<LayoutProps<TOptions, TInput>>
  message: ComponentType<MessageProps<TOptions>>
  input?: TInput
  queue?: ComponentType<QueueProps<TOptions>>
}
export type ChatUIPartsComponents<TOptions> = {
  [K in ChatUIPartKey]?: ComponentType<PartProps<TOptions, K>>
} & {
  fallback?: ComponentType<PartProps<TOptions>>
}
export type ChatUIInterruptsComponents<TOptions> = {
  tools?: ToolApprovalMap<TOptions>
  generic: GenericInterruptComponents<TOptions>
}
export type ChatUIComponents<
  TOptions,
  TInput extends ComponentType<InputProps<TOptions>> | undefined =
    ComponentType<InputProps<TOptions>>,
> = {
  components: ChatUIChromeComponents<TOptions, TInput>
  partsComponents: ChatUIPartsComponents<TOptions>
} & (ChatUIHasNamedTools<TOptions> extends true
  ? {
      toolsComponents: {
        [K in ChatUIToolName<TOptions>]: ComponentType<ToolProps<TOptions, K>>
      }
    }
  : {
      toolsComponents?: {
        [K in ChatUIToolName<TOptions>]?: ComponentType<ToolProps<TOptions, K>>
      }
    }) &
  (ChatUIHasNamedInterrupts<TOptions> extends true
    ? {
        interruptsComponents: ChatUIInterruptsComponents<TOptions>
      }
    : {
        interruptsComponents?: {
          tools?: ToolApprovalMap<TOptions>
          generic?: GenericInterruptComponents<TOptions>
        }
      })
/** Scoped contexts, for widgets in other files or nested chat trees. */
export type ChatUIContextConfig = {
  chatContext?: ChatUIContexts['chatContext']
  partContext?: ChatUIContexts['partContext']
  interruptContext?: ChatUIContexts['interruptContext']
}
export type ChatUIFactoryConfig<
  TOptions,
  TInput extends ComponentType<InputProps<TOptions>> | undefined =
    ComponentType<InputProps<TOptions>>,
> = ChatUIComponents<TOptions, TInput> & {
  context?: ChatUIContextConfig
}
/** A zero-prop widget bound to the surrounding part or interrupt. */
export type BoundWidget = ComponentType<Record<string, never>>
/** The widgets `UI.Part` mixes onto the selected part it passes to children. */
export type PartMixins<TOptions> = {
  [K in ChatUIPartKey]?: BoundWidget
} & {
  [K in ChatUIToolName<TOptions>]: BoundWidget
} & {
  Render: BoundWidget
}
/** The widgets `UI.Interrupt` mixes onto the interrupt it passes to children. */
export type InterruptMixins<TOptions> = {
  [K in ChatUINamedInterruptId<TOptions>]: BoundWidget
} & {
  [K in ChatUIToolName<TOptions>]?: BoundWidget
} & {
  fallback?: BoundWidget
  Render: BoundWidget
}
/**
 * Bind chat options and UI widgets once at module scope. This matches Form
 * `createFormHook` and Table `createTableHook`: widgets register here, mix
 * onto Part / Interrupt / the UI kit, and automatic dispatch still walks the
 * message list.
 *
 * `chatOptions` is type-only at runtime. Pass optional `chatContext`,
 * `partContext`, and `interruptContext` from {@link createChatHookContexts}
 * when widgets live in other files or when nested chats need isolation.
 */
export declare function createChatUI<
  const TOptions,
  TInput extends ComponentType<any> | undefined =
    | ComponentType<InputProps<NoInfer<TOptions>>>
    | undefined,
>(
  options: TOptions,
  config: ChatUIFactoryConfig<NoInfer<TOptions>, TInput>,
): {
  Chat: ({
    chat,
  }: {
    chat: ChatUIHost<TOptions>
  }) => import('octane/jsx-runtime').JSX.Element
  Provider: ({
    chat,
    children,
  }: {
    chat: ChatUIHost<TOptions>
    children?: OctaneNode
  }) => import('octane/jsx-runtime').JSX.Element
  Messages: ({
    children,
  }?: {
    children?: (messages: ChatUIMessages<TOptions>) => OctaneNode
  }) => import('octane/jsx-runtime').JSX.Element
  Message: ({
    message,
    children,
  }: {
    message: ChatUIMessages<TOptions>[number]
    children?: (parts: Array<ChatUISelectedPart>) => OctaneNode
  }) => import('octane/jsx-runtime').JSX.Element
  Part: ({
    part,
    children,
  }: {
    part: MessagePart | ChatUISelectedPart
    children?: (mixed: ChatUISelectedPart & PartMixins<TOptions>) => OctaneNode
  }) => import('octane/jsx-runtime').JSX.Element | null
  Interrupts: ({
    children,
  }?: {
    children?: (interrupts: ReadonlyArray<ChatUIInterrupt>) => OctaneNode
  }) => import('octane/jsx-runtime').JSX.Element
  Interrupt: (({
    interrupt,
    children,
  }: {
    interrupt: ChatUIInterrupt
    children?: (
      mixed: ChatUIInterrupt & InterruptMixins<TOptions>,
    ) => OctaneNode
  }) => import('octane/jsx-runtime').JSX.Element) & {
    readonly type: ({
      interrupt,
      children,
    }: {
      interrupt: ChatUIInterrupt
      children?: (
        mixed: ChatUIInterrupt & InterruptMixins<TOptions>,
      ) => OctaneNode
    }) => import('octane/jsx-runtime').JSX.Element
    displayName?: string
  }
  Queue: () => import('octane/jsx-runtime').JSX.Element | null
  useChatContext: () => ChatUIHost<TOptions>
  Input: TInput | undefined
}
