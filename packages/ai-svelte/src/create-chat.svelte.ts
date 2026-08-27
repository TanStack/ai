import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { onMount } from 'svelte'
import type {
  ChatClientState,
  ResolvableChatInterrupt,
  ChatInterruptState,
  ChatResumeState,
  ConnectionStatus,
  InferredClientContext,
  QueuedMessage,
  SendMessageOptions,
  StructuredOutputPart,
} from '@tanstack/ai-client'
import type {
  AnyClientTool,
  InterruptDefinition,
  InferSchemaType,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai'
import type {
  CreateChatOptions,
  CreateChatReturn,
  DeepPartial,
  MultimodalContent,
  UIMessage,
} from './types'

const EMPTY_INTERRUPTS = Object.freeze([])
const EMPTY_INTERRUPT_ERRORS = Object.freeze([])

function persistenceOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TSchema extends SchemaInput | undefined,
  TContext,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
>(
  options: CreateChatOptions<TTools, TSchema, TContext, TInterrupts>,
):
  | { persistence: NonNullable<typeof options.persistence>; threadId: string }
  | { threadId?: typeof options.threadId } {
  if (typeof options.threadId === 'string' && options.persistence) {
    return { persistence: options.persistence, threadId: options.threadId }
  }
  return options.threadId !== undefined ? { threadId: options.threadId } : {}
}

function definedFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const fieldEntries = Object.entries(fields)
  for (const [key, value] of fieldEntries) {
    if (value !== undefined) out[key] = value
  }
  return out
}

export function createChat<
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
>(
  options: CreateChatOptions<TTools, TSchema, TContext, TInterrupts>,
): CreateChatReturn<TTools, TSchema, TContext, TInterrupts> {
  // Create reactive state using Svelte 5 runes
  let messages = $state<Array<UIMessage<TTools>>>(options.initialMessages || [])
  let isLoading = $state(false)
  let error = $state<Error | undefined>(undefined)
  let status = $state<ChatClientState>('ready')
  let isSubscribed = $state(false)
  let connectionStatus = $state<ConnectionStatus>('disconnected')
  let sessionGenerating = $state(false)
  let queue = $state<Array<QueuedMessage>>([])
  let runId = $state<string | null>(null)
  let interruptState = $state.raw<ChatInterruptState<TTools, TInterrupts>>({
    interrupts: EMPTY_INTERRUPTS,
    pendingInterrupts: EMPTY_INTERRUPTS,
    interruptErrors: EMPTY_INTERRUPT_ERRORS,
    resuming: false,
  })

  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  const transport = options.connection
    ? { connection: options.connection }
    : { fetcher: options.fetcher }

  const client = new ChatClient<TTools, TContext, TInterrupts>({
    devtoolsBridgeFactory: createChatDevtoolsBridge,
    ...transport,
    ...persistenceOptions(options),
    byokProvider: () => options.byokProvider?.(),
    tools: options.tools,
    onChunk: (chunk: StreamChunk) => {
      options.onChunk?.(chunk)
    },
    onFinish: (message) => {
      options.onFinish?.(message)
    },
    onError: (err) => {
      options.onError?.(err)
    },
    onMessagesChange: (newMessages: Array<UIMessage<TTools>>) => {
      messages = newMessages
    },
    onLoadingChange: (newIsLoading: boolean) => {
      isLoading = newIsLoading
      syncResumeState()
    },
    onStatusChange: (newStatus: ChatClientState) => {
      status = newStatus
    },
    onErrorChange: (newError: Error | undefined) => {
      error = newError
    },
    onSubscriptionChange: (nextIsSubscribed: boolean) => {
      isSubscribed = nextIsSubscribed
    },
    onConnectionStatusChange: (nextStatus: ConnectionStatus) => {
      connectionStatus = nextStatus
    },
    onSessionGeneratingChange: (isGenerating: boolean) => {
      sessionGenerating = isGenerating
    },
    onQueueChange: (nextQueue: Array<QueuedMessage>) => {
      queue = nextQueue
    },
    onRunIdChange: (nextRunId) => {
      runId = nextRunId
    },
    onInterruptStateChange: (nextInterruptState, context) => {
      interruptState = nextInterruptState
      options.onInterruptStateChange?.(nextInterruptState, context)
    },
    devtools: {
      ...options.devtools,
      framework: 'svelte',
      hookName: 'useChat',
      outputKind: options.outputSchema ? 'structured' : 'chat',
    },
    ...definedFields({
      initialMessages: options.initialMessages,
      initialResumeSnapshot: options.initialResumeSnapshot,
      body: options.body,
      forwardedProps: options.forwardedProps,
      byok: options.byok,
      context: options.context,
      onResponse: options.onResponse,
      interrupts: options.interrupts,
      onCustomEvent: options.onCustomEvent,
      streamProcessor: options.streamProcessor,
      queue: options.queue,
    }),
  })

  function syncResumeState() {
    runId = client.getCurrentRunId()
    interruptState = client.getInterruptState()
  }

  messages = client.getMessages()
  interruptState = client.getInterruptState()

  if (options.live) {
    client.subscribe()
  }

  client.mountDevtools()

  if (typeof window !== 'undefined') {
    try {
      onMount(() => {
        syncResumeState()
        client.attach()
        return () => {
          client.detach()
        }
      })
    } catch {
      // Svelte lifecycle hooks are only valid during component initialization.
    }
  }

  // Define methods
  const sendMessage = async (
    content: string | MultimodalContent,
    sendOptions?: SendMessageOptions,
  ) => {
    try {
      await client.sendMessage(content, undefined, sendOptions)
    } finally {
      syncResumeState()
    }
  }

  const cancelQueued = (id: string) => client.cancelQueued(id)

  const append = async (message: ModelMessage | UIMessage<TTools>) => {
    try {
      await client.append(message)
    } finally {
      syncResumeState()
    }
  }

  const reload = async () => {
    try {
      await client.reload()
    } finally {
      syncResumeState()
    }
  }

  const stop = () => {
    client.stop()
  }

  const dispose = () => {
    client.dispose()
  }

  const clear = () => {
    client.clear()
    syncResumeState()
  }

  const setMessages = (newMessages: Array<UIMessage<TTools>>) => {
    client.setMessagesManually(newMessages)
  }

  const addToolResult = async (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => {
    await client.addToolResult(result)
  }

  const addToolApprovalResponse = async (response: {
    id: string
    approved: boolean
  }) => {
    await client.addToolApprovalResponse(response)
    syncResumeState()
  }

  const resumeInterrupts = async (
    resumeItems: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ) => {
    const result = await client.resumeInterrupts(resumeItems, state)
    syncResumeState()
    return result
  }

  const resolveInterrupts = (
    resolution:
      | boolean
      | ((
          interrupt: ResolvableChatInterrupt<TTools, TInterrupts>,
        ) => undefined),
  ) => {
    if (typeof resolution === 'boolean') {
      client.resolveInterrupts(resolution)
    } else {
      client.resolveInterrupts(resolution)
    }
  }

  const cancelInterrupts = () => {
    client.cancelInterrupts()
  }

  const retryInterrupts = () => {
    client.retryInterrupts()
  }

  const resumeInterruptsUnsafe = (
    resumeItems: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ) => client.resumeInterruptsUnsafe(resumeItems, state)

  const updateBody = (newBody: Record<string, any>) => {
    client.updateOptions({ body: newBody })
  }

  const updateForwardedProps = (newForwardedProps: Record<string, any>) => {
    client.updateOptions({ forwardedProps: newForwardedProps })
  }

  const updateContext = (newContext: TContext) => {
    client.updateOptions({ context: newContext })
  }

  const activeStructuredPart: StructuredOutputPart | null = $derived.by(() => {
    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex === -1) return null
    for (let i = messages.length - 1; i > lastUserIndex; i--) {
      const m = messages[i]
      if (m?.role !== 'assistant') continue
      const part = m.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )
      if (part) return part
    }
    return null
  })

  const partial: Partial = $derived.by(() => {
    if (!activeStructuredPart) return {} as Partial
    const v = activeStructuredPart.partial ?? activeStructuredPart.data
    return (v ?? {}) as Partial
  })

  const final: Final | null = $derived(
    activeStructuredPart && activeStructuredPart.status === 'complete'
      ? (activeStructuredPart.data as Final)
      : null,
  )

  // Return the chat interface with reactive getters
  // Using getters allows Svelte to track reactivity without needing $ prefix
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- rune return shape diverges from generic CreateChatReturn<TTools, TSchema, TContext> due to TSchema conditional partial/final fields; TS can't structurally narrow.
  return {
    get messages() {
      return messages
    },
    get isLoading() {
      return isLoading
    },
    get error() {
      return error
    },
    get status() {
      return status
    },
    get isSubscribed() {
      return isSubscribed
    },
    get connectionStatus() {
      return connectionStatus
    },
    get sessionGenerating() {
      return sessionGenerating
    },
    get queue() {
      return queue
    },
    get runId() {
      return runId
    },
    get interrupts() {
      return interruptState.interrupts
    },
    get pendingInterrupts() {
      return interruptState.interrupts
    },
    get interruptErrors() {
      return interruptState.interruptErrors
    },
    get resuming() {
      return interruptState.resuming
    },
    get partial() {
      return partial
    },
    get final() {
      return final
    },
    sendMessage,
    cancelQueued,
    append,
    reload,
    stop,
    dispose,
    setMessages,
    clear,
    addToolResult,
    addToolApprovalResponse,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    resumeInterruptsUnsafe,
    resumeInterrupts,
    updateBody,
    updateForwardedProps,
    updateContext,
  } as unknown as CreateChatReturn<TTools, TSchema, TContext, TInterrupts>
}
