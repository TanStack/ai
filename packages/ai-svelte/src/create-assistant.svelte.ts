import {
  AssistantClient,
  computeStructuredParts,
} from '@tanstack/ai-client/assistant'
import type {
  AssistantClientOptions,
  AssistantSystem,
  OneShotCapabilityName,
} from '@tanstack/ai-client/assistant'
import type {
  AnyClientTool,
  ChatClientState,
  ConnectionStatus,
  GenerationClientState,
} from '@tanstack/ai-client'
import type { AssistantDefinition } from '@tanstack/ai/assistant'
import type { ModelMessage } from '@tanstack/ai'
import type { MultimodalContent, UIMessage } from './types'

/** Reactive state for a single one-shot (non-chat) capability. */
interface OneShotState {
  result: unknown
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
}

/**
 * Creates a reactive assistant instance for Svelte 5.
 *
 * This function wraps the `AssistantClient` from `@tanstack/ai-client` and
 * exposes reactive state using Svelte 5 runes, one surface per declared
 * capability (`chat` plus any one-shot generation capabilities). The
 * returned object exposes reactive getters that automatically update when
 * state changes.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createAssistant, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *   // myAssistant: your defineAssistant(...) value
 *
 *   const assistant = createAssistant(myAssistant, {
 *     connection: fetchServerSentEvents('/api/assistant'),
 *   })
 * </script>
 *
 * <div>
 *   {#each assistant.chat.messages as message}
 *     <div>{message.role}: {message.parts[0].content}</div>
 *   {/each}
 *
 *   <button onclick={() => assistant.chat.sendMessage('Hello!')}>Send</button>
 *   <button onclick={() => assistant.image.generate({ prompt: 'a fox' })}>
 *     Generate image
 *   </button>
 * </div>
 * ```
 */
export function createAssistant<
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
): AssistantSystem<TDef, TChatTools, TOptions> & { dispose: () => void } {
  // Reactive state for the chat capability, if declared.
  let chatMessages = $state<Array<UIMessage<TChatTools>>>([])
  let chatIsLoading = $state(false)
  let chatError = $state<Error | undefined>(undefined)
  let chatStatus = $state<ChatClientState>('ready')
  let chatIsSubscribed = $state(false)
  let chatConnectionStatus = $state<ConnectionStatus>('disconnected')
  let chatSessionGenerating = $state(false)

  // Derived structured-output `partial`/`final`, recomputed whenever
  // `chatMessages` changes (mirrors `useChat`/`useAssistant`'s `useMemo`).
  const structuredParts = $derived(computeStructuredParts(chatMessages))

  // Reactive state per one-shot capability, keyed by capability name.
  // Initialized eagerly for every declared one-shot capability, since
  // `assistant.capabilities` is fixed at creation time (mirrors
  // `AssistantClient`'s own constructor, which iterates the same array).
  const oneShotStates = $state<Record<string, OneShotState>>({})
  for (const capability of assistant.capabilities) {
    if (capability === 'chat') continue
    oneShotStates[capability] = {
      result: null,
      isLoading: false,
      error: undefined,
      status: 'idle',
    }
  }

  // Returns (and lazily creates) the reactive state slot for a one-shot
  // capability, avoiding a non-null assertion at each call site below.
  const ensureOneShotState = (capability: string): OneShotState => {
    let state = oneShotStates[capability]
    if (!state) {
      state = {
        result: null,
        isLoading: false,
        error: undefined,
        status: 'idle',
      }
      oneShotStates[capability] = state
    }
    return state
  }

  // Create the AssistantClient eagerly, once. Reactive callbacks are passed
  // into the constructor (the only place ChatClient/GenerationClient accept
  // them) rather than via `updateOptions`, mirroring `createChat`.
  const client = new AssistantClient<TDef, any>({
    ...options,
    assistant,
    callbacks: {
      chat: {
        onMessagesChange: (newMessages) => {
          chatMessages = newMessages
        },
        onLoadingChange: (newIsLoading) => {
          chatIsLoading = newIsLoading
        },
        onErrorChange: (newError) => {
          chatError = newError
        },
        onStatusChange: (newStatus) => {
          chatStatus = newStatus
        },
        onSubscriptionChange: (nextIsSubscribed) => {
          chatIsSubscribed = nextIsSubscribed
        },
        onConnectionStatusChange: (nextStatus) => {
          chatConnectionStatus = nextStatus
        },
        onSessionGeneratingChange: (isGenerating) => {
          chatSessionGenerating = isGenerating
        },
      },
      oneShot: (capability) => ({
        onResultChange: (result) => {
          ensureOneShotState(capability).result = result
        },
        onLoadingChange: (isLoading) => {
          ensureOneShotState(capability).isLoading = isLoading
        },
        onErrorChange: (error) => {
          ensureOneShotState(capability).error = error
        },
        onStatusChange: (status) => {
          ensureOneShotState(capability).status = status
        },
      }),
    },
  })

  chatMessages = client.chat?.getMessages() ?? []

  // Note: No auto-cleanup in Svelte — call `dispose()` in your component's
  // cleanup if needed. Unlike React/Vue/Solid, Svelte 5 runes like $effect
  // can only be used during component initialization.
  const dispose = () => {
    client.dispose()
  }

  // Chat capability methods.
  const sendMessage = async (content: string | MultimodalContent) => {
    await client.chat?.sendMessage(content)
    const msgs = client.chat?.getMessages() ?? []
    const hasStructured =
      msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ?? false
    // Cast: TS can't structurally narrow the conditional return of
    // AssistantChatSurface['sendMessage'] against this runtime branch,
    // mirroring the assembled-`system` cast at the end of this function.
    return (hasStructured ? computeStructuredParts(msgs).final : msgs) as any
  }

  const append = async (message: ModelMessage | UIMessage<TChatTools>) => {
    await client.chat?.append(message)
  }

  const reload = async () => {
    await client.chat?.reload()
  }

  const chatStop = () => {
    client.chat?.stop()
  }

  const clear = () => {
    client.chat?.clear()
  }

  const setMessages = (newMessages: Array<UIMessage<TChatTools>>) => {
    client.chat?.setMessagesManually(newMessages)
  }

  const addToolResult = async (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => {
    await client.chat?.addToolResult(result)
  }

  const addToolApprovalResponse = async (response: {
    id: string
    approved: boolean
  }) => {
    await client.chat?.addToolApprovalResponse(response)
  }

  // Build the returned system: one entry per declared capability, plus a
  // top-level `dispose`. Uses getters so Svelte tracks the underlying
  // `$state` without a `$` prefix.
  const system: Record<string, unknown> = {}

  for (const capability of assistant.capabilities) {
    if (capability === 'chat') {
      system.chat = {
        get messages() {
          return chatMessages
        },
        get isLoading() {
          return chatIsLoading
        },
        get error() {
          return chatError
        },
        get status() {
          return chatStatus
        },
        get isSubscribed() {
          return chatIsSubscribed
        },
        get connectionStatus() {
          return chatConnectionStatus
        },
        get sessionGenerating() {
          return chatSessionGenerating
        },
        // Runtime shape unconditionally exposes partial/final; the public
        // AssistantSystem type hides them when the chat capability's
        // outputSchema is absent, matching useChat's behavior.
        get partial() {
          return structuredParts.partial
        },
        get final() {
          return structuredParts.final
        },
        sendMessage,
        append,
        reload,
        stop: chatStop,
        clear,
        setMessages,
        addToolResult,
        addToolApprovalResponse,
      }
      continue
    }

    const capabilityName = capability as OneShotCapabilityName
    system[capabilityName] = {
      get result() {
        return oneShotStates[capabilityName]?.result ?? null
      },
      get isLoading() {
        return oneShotStates[capabilityName]?.isLoading ?? false
      },
      get error() {
        return oneShotStates[capabilityName]?.error
      },
      get status() {
        return oneShotStates[capabilityName]?.status ?? 'idle'
      },
      generate: async (input: any) => {
        const oneShotClient = client.get(capabilityName)
        await oneShotClient?.generate(input)
        return oneShotClient?.getResult() ?? null
      },
      stop: () => {
        client.get(capabilityName)?.stop()
      },
      reset: () => {
        client.get(capabilityName)?.reset()
      },
    }
  }

  system.dispose = dispose

  // eslint-disable-next-line no-restricted-syntax -- built dynamically from a runtime `assistant.capabilities` array; the static AssistantSystem<TDef, TChatTools> shape can't be verified structurally here, plus the added `dispose` field.
  return system as unknown as AssistantSystem<TDef, TChatTools, TOptions> & {
    dispose: () => void
  }
}
