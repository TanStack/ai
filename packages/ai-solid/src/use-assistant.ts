import {
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
} from 'solid-js'

import {
  AssistantClient,
  computeStructuredParts,
} from '@tanstack/ai-client/assistant'
import type {
  AnyClientTool,
  ChatClientState,
  ConnectionStatus,
  GenerationClientState,
  MultimodalContent,
  UIMessage,
} from '@tanstack/ai-client'
import type {
  AssistantClientOptions,
  AssistantSystem,
  OneShotCapabilityName,
} from '@tanstack/ai-client/assistant'
import type { ModelMessage } from '@tanstack/ai'
import type { AssistantDefinition } from '@tanstack/ai/assistant'

/** Reactive chat sub-state, mirrored from the `ChatClient` callbacks. */
interface ChatState<TChatTools extends ReadonlyArray<AnyClientTool>> {
  messages: Array<UIMessage<TChatTools>>
  isLoading: boolean
  error: Error | undefined
  status: ChatClientState
  isSubscribed: boolean
  connectionStatus: ConnectionStatus
  sessionGenerating: boolean
}

/** Reactive one-shot sub-state, mirrored from a `GenerationClient`'s callbacks. */
interface OneShotState {
  result: unknown
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
}

const defaultOneShotState: OneShotState = {
  result: null,
  isLoading: false,
  error: undefined,
  status: 'idle',
}

/**
 * Solid hook for a multi-capability `AssistantDefinition` — composes one
 * reactive surface per declared capability (`chat`, and/or one or more
 * one-shot generation capabilities) backed by a single `AssistantClient`.
 *
 * Mirrors the `useChat` idiom: state lives in `createSignal`s, the client is
 * built once in a `createMemo` (`clientId` is a stable per-hook id), and every reactive
 * callback is threaded into the `AssistantClient` constructor via its
 * `callbacks` option — `ChatClient` and `GenerationClient` only accept these
 * callbacks at construction time, not through `updateOptions`.
 *
 * @example
 * ```tsx
 * const assistant = useAssistant(myAssistant, {
 *   connection: fetchServerSentEvents('/api/assistant'),
 * })
 *
 * await assistant.chat.sendMessage('Hello')
 * await assistant.image.generate({ prompt: 'A sunset' })
 * ```
 */
export function useAssistant<
  TDef extends AssistantDefinition<any>,
  TChatTools extends ReadonlyArray<AnyClientTool> = [],
  // Capture the options so per-capability `onResult` transforms flow into each
  // one-shot capability's `result` type (`any` tools keep `chat.tools`
  // unconstrained; chat tool typing comes from the definition).
  TOptions extends Omit<
    AssistantClientOptions<TDef, any>,
    'assistant' | 'callbacks'
  > = Omit<AssistantClientOptions<TDef, any>, 'assistant' | 'callbacks'>,
>(
  assistant: TDef,
  options: TOptions,
): AssistantSystem<TDef, TChatTools, TOptions> {
  const hookId = createUniqueId()
  const clientId = options.id || hookId

  const [chatState, setChatState] = createSignal<ChatState<TChatTools>>({
    messages: [],
    isLoading: false,
    error: undefined,
    status: 'ready',
    isSubscribed: false,
    connectionStatus: 'disconnected',
    sessionGenerating: false,
  })

  const initialOneShotState: Record<string, OneShotState> = {}
  for (const capability of assistant.capabilities) {
    if (capability !== 'chat') {
      initialOneShotState[capability] = { ...defaultOneShotState }
    }
  }
  const [oneShotState, setOneShotState] =
    createSignal<Record<string, OneShotState>>(initialOneShotState)

  // Build the AssistantClient with every reactive callback wired through the
  // constructor's `callbacks` option (VP2: ChatClient/GenerationClient only
  // accept these at construction time).
  const client = createMemo(() => {
    return new AssistantClient<TDef, any>({
      ...options,
      assistant,
      id: clientId,
      callbacks: {
        chat: {
          onMessagesChange: (messages) =>
            setChatState((s) => ({ ...s, messages })),
          onLoadingChange: (isLoading) =>
            setChatState((s) => ({ ...s, isLoading })),
          onErrorChange: (error) => setChatState((s) => ({ ...s, error })),
          onStatusChange: (status) => setChatState((s) => ({ ...s, status })),
          onSubscriptionChange: (isSubscribed) =>
            setChatState((s) => ({ ...s, isSubscribed })),
          onConnectionStatusChange: (connectionStatus) =>
            setChatState((s) => ({ ...s, connectionStatus })),
          onSessionGeneratingChange: (sessionGenerating) =>
            setChatState((s) => ({ ...s, sessionGenerating })),
        },
        oneShot: (capability) => ({
          onResultChange: (result) =>
            setOneShotState((s) => ({
              ...s,
              [capability]: {
                ...(s[capability] ?? defaultOneShotState),
                result,
              },
            })),
          onLoadingChange: (isLoading) =>
            setOneShotState((s) => ({
              ...s,
              [capability]: {
                ...(s[capability] ?? defaultOneShotState),
                isLoading,
              },
            })),
          onErrorChange: (error) =>
            setOneShotState((s) => ({
              ...s,
              [capability]: {
                ...(s[capability] ?? defaultOneShotState),
                error,
              },
            })),
          onStatusChange: (status) =>
            setOneShotState((s) => ({
              ...s,
              [capability]: {
                ...(s[capability] ?? defaultOneShotState),
                status,
              },
            })),
        }),
      },
    })
  })

  // Sync initial chat state now that the client (and its `chat` sub-client,
  // if declared) exists — mirrors useChat's `setMessages(client().getMessages())`.
  const initialChatClient = client().chat
  if (initialChatClient) {
    setChatState({
      messages: initialChatClient.getMessages(),
      isLoading: initialChatClient.getIsLoading(),
      error: initialChatClient.getError(),
      status: initialChatClient.getStatus(),
      isSubscribed: initialChatClient.getIsSubscribed(),
      connectionStatus: initialChatClient.getConnectionStatus(),
      sessionGenerating: initialChatClient.getSessionGenerating(),
    })
  }

  onMount(() => {
    client().chat?.mountDevtools()
  })

  // Cleanup on unmount: tear down the chat client and every one-shot client.
  onCleanup(() => {
    client().dispose()
  })

  // Narrowing helpers: capability presence is guaranteed by construction (a
  // surface for `capability` is only built below when the assistant actually
  // declares it), but the sub-client getters are typed as `T | undefined`, so
  // reads go through an explicit check rather than a non-null assertion.
  const requireChatClient = () => {
    const chatClient = client().chat
    if (chatClient === undefined) {
      throw new Error(
        'useAssistant: "chat" capability was not declared on this assistant',
      )
    }
    return chatClient
  }

  const requireOneShotClient = (capability: OneShotCapabilityName) => {
    const oneShotClient = client().get(capability)
    if (oneShotClient === undefined) {
      throw new Error(
        `useAssistant: "${capability}" capability was not declared on this assistant`,
      )
    }
    return oneShotClient
  }

  // Built dynamically per declared capability below; the object shape can't
  // be statically checked against the mapped `AssistantSystem` type, so it's
  // assembled as `Record<string, any>` and cast once at the end.
  const system: Record<string, any> = {}

  for (const capability of assistant.capabilities) {
    if (capability === 'chat') {
      system.chat = {
        get messages() {
          return chatState().messages
        },
        get isLoading() {
          return chatState().isLoading
        },
        get error() {
          return chatState().error
        },
        get status() {
          return chatState().status
        },
        get isSubscribed() {
          return chatState().isSubscribed
        },
        get connectionStatus() {
          return chatState().connectionStatus
        },
        get sessionGenerating() {
          return chatState().sessionGenerating
        },
        // Runtime shape unconditionally exposes partial/final; the public
        // AssistantSystem type hides them when the chat capability's
        // outputSchema is absent, matching useChat's behavior.
        get partial() {
          return computeStructuredParts(chatState().messages).partial
        },
        get final() {
          return computeStructuredParts(chatState().messages).final
        },
        sendMessage: async (content: string | MultimodalContent) => {
          const chatClient = requireChatClient()
          await chatClient.sendMessage(content)
          const msgs = chatClient.getMessages()
          const hasStructured =
            msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ??
            false
          // Cast: TS can't structurally narrow the conditional return of
          // AssistantChatSurface['sendMessage'] against this runtime branch,
          // mirroring the assembled-`system` cast at the end of this hook.
          return (
            hasStructured ? computeStructuredParts(msgs).final : msgs
          ) as any
        },
        append: async (message: ModelMessage | UIMessage<TChatTools>) => {
          await requireChatClient().append(message)
        },
        reload: async () => {
          await requireChatClient().reload()
        },
        stop: () => {
          requireChatClient().stop()
        },
        clear: () => {
          requireChatClient().clear()
        },
        setMessages: (messages: Array<UIMessage<TChatTools>>) => {
          requireChatClient().setMessagesManually(messages)
        },
        addToolResult: async (result: {
          toolCallId: string
          tool: string
          output: any
          state?: 'output-available' | 'output-error'
          errorText?: string
        }) => {
          await requireChatClient().addToolResult(result)
        },
        addToolApprovalResponse: async (response: {
          id: string
          approved: boolean
        }) => {
          await requireChatClient().addToolApprovalResponse(response)
        },
      }
      continue
    }

    const oneShotCapability = capability as OneShotCapabilityName
    system[capability] = {
      get result() {
        return oneShotState()[oneShotCapability]?.result ?? null
      },
      get isLoading() {
        return oneShotState()[oneShotCapability]?.isLoading ?? false
      },
      get error() {
        return oneShotState()[oneShotCapability]?.error
      },
      get status() {
        return oneShotState()[oneShotCapability]?.status ?? 'idle'
      },
      generate: async (input: Record<string, any>) => {
        const oneShotClient = requireOneShotClient(oneShotCapability)
        await oneShotClient.generate(input)
        return oneShotClient.getResult()
      },
      stop: () => {
        requireOneShotClient(oneShotCapability).stop()
      },
      reset: () => {
        requireOneShotClient(oneShotCapability).reset()
      },
    }
  }

  // eslint-disable-next-line no-restricted-syntax -- built dynamically per declared capability; TS can't structurally verify the assembled object against the mapped AssistantSystem type
  return system as unknown as AssistantSystem<TDef, TChatTools, TOptions>
}
