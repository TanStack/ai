import { defineInterrupt, toolDefinition } from '@tanstack/ai/client'
import { z } from 'zod'
import type { ChatUIInterrupt } from '../src/ui'
import type { QueuedMessage, UIMessage } from '../src/types'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Look up weather',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temperature: z.number() }),
}).client()

const purchaseItem = toolDefinition({
  name: 'purchaseItem',
  description: 'Purchase an item',
  needsApproval: true,
  inputSchema: z.object({ item: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
}).client()

const choosePlan = defineInterrupt({
  id: 'choosePlan',
  payloadSchema: z.object({ title: z.string() }),
  responseSchema: z.string(),
})

const answerSchema = z.object({ answer: z.string() })

const stubConnection = {
  connect: async function* () {
    return
  },
}

export const chatOptions = {
  connection: stubConnection,
  tools: [getWeather, purchaseItem],
  interrupts: [choosePlan],
  outputSchema: answerSchema,
}

function noop(): void {
  return
}

export const approvalInterrupt = {
  kind: 'tool-approval',
  id: 'approval-1',
  interruptId: 'approval-1',
  reason: 'tool_call',
  message: 'Approve purchase',
  threadId: 'thread-1',
  interruptedRunId: 'run-1',
  generation: 0,
  status: 'pending',
  errors: [],
  canResolve: true,
  toolName: 'purchaseItem',
  toolCallId: 'call-weather',
  originalArgs: { item: 'keyboard' },
  binding: {
    kind: 'tool-approval',
    toolCallId: 'call-weather',
    toolName: 'purchaseItem',
  },
  cancel: noop,
  clearResolution: noop,
  resolveInterrupt: noop,
} as unknown as ChatUIInterrupt

export const genericInterrupt = {
  kind: 'generic',
  id: 'generic-1',
  interruptId: 'generic-1',
  reason: 'choose-plan',
  message: 'Choose a plan',
  threadId: 'thread-1',
  interruptedRunId: 'run-1',
  generation: 0,
  status: 'pending',
  errors: [],
  canResolve: true,
  definitionId: 'choosePlan',
  key: 'choosePlan',
  payload: { title: 'Pro' },
  binding: {
    kind: 'generic',
    definitionId: 'choosePlan',
    key: 'choosePlan',
    batchIndex: 0,
  },
  cancel: noop,
  clearResolution: noop,
  resolveInterrupt: noop,
} as unknown as ChatUIInterrupt

export const unboundInterrupt = {
  kind: 'unbound',
  id: 'unbound-1',
  interruptId: 'unbound-1',
  reason: 'foreign',
  message: 'Owned elsewhere',
  threadId: 'thread-1',
  interruptedRunId: 'run-1',
  generation: 0,
  status: 'pending',
  errors: [],
  canResolve: false,
} as unknown as ChatUIInterrupt

export const messageWithToolResults: UIMessage = {
  id: 'message-1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-call',
      id: 'call-weather',
      name: 'getWeather',
      arguments: '{"city":"Paris"}',
      input: { city: 'Paris' },
      output: { temperature: 18 },
      state: 'complete',
    },
    {
      type: 'tool-result',
      toolCallId: 'call-weather',
      content: '{"temperature":18}',
      state: 'complete',
    },
    {
      type: 'structured-output',
      status: 'complete',
      raw: '{"answer":"yes"}',
      data: { answer: 'yes' },
    },
  ],
}

export const unknownToolMessage: UIMessage = {
  id: 'message-unknown',
  role: 'assistant',
  parts: [
    {
      type: 'tool-call',
      id: 'call-unknown',
      name: 'notConfigured',
      arguments: '{}',
      state: 'complete',
    },
  ],
}

export const orphanResultMessage: UIMessage = {
  id: 'message-orphan-result',
  role: 'assistant',
  parts: [
    {
      type: 'text',
      content: 'result follows',
    },
    {
      type: 'tool-result',
      toolCallId: 'missing-call',
      content: 'standalone',
      state: 'complete',
    },
  ],
}

export const purchaseApprovalMessage: UIMessage = {
  id: 'message-purchase',
  role: 'assistant',
  parts: [
    {
      type: 'tool-call',
      id: 'call-purchase',
      name: 'purchaseItem',
      arguments: '{"item":"keyboard"}',
      input: { item: 'keyboard' },
      state: 'approval-requested',
      approval: {
        id: 'approval-purchase',
        needsApproval: true,
      },
    },
  ],
}

export const purchaseApprovalInterrupt = {
  ...approvalInterrupt,
  id: 'approval-purchase',
  interruptId: 'approval-purchase',
  toolCallId: 'call-purchase',
  binding: {
    kind: 'tool-approval',
    toolCallId: 'call-purchase',
    toolName: 'purchaseItem',
  },
} as unknown as ChatUIInterrupt

export function createChatResult(init: {
  messages?: Array<UIMessage>
  interrupts?: Array<ChatUIInterrupt>
  error?: Error
  isLoading?: boolean
  status?: 'ready' | 'submitted' | 'streaming' | 'error'
  queue?: Array<QueuedMessage>
  cancelQueued?: (id: string) => void
}) {
  const interrupts = init.interrupts ?? []
  return {
    messages: init.messages ?? [],
    interrupts,
    pendingInterrupts: interrupts,
    error: init.error,
    isLoading: init.isLoading ?? false,
    status: init.status ?? 'ready',
    queue: init.queue ?? [],
    cancelQueued: init.cancelQueued ?? noop,
    sendMessage: async () => undefined,
    stop: noop,
    reload: async () => undefined,
    clear: noop,
    setMessages: noop,
  }
}

export function createSolidChatResult(
  messages: Array<UIMessage>,
  interrupts: Array<ChatUIInterrupt> = [],
  extra: {
    queue?: Array<QueuedMessage>
    cancelQueued?: (id: string) => void
  } = {},
) {
  const chat = createChatResult({ messages, interrupts, ...extra })
  return {
    ...chat,
    messages: () => chat.messages,
    interrupts: () => chat.interrupts,
    pendingInterrupts: () => chat.pendingInterrupts,
    error: () => chat.error,
    isLoading: () => chat.isLoading,
    status: () => chat.status,
    queue: () => chat.queue,
  }
}

export function createVueChatResult(
  messages: Array<UIMessage>,
  interrupts: Array<ChatUIInterrupt> = [],
  extra: {
    queue?: Array<QueuedMessage>
    cancelQueued?: (id: string) => void
  } = {},
) {
  const chat = createChatResult({ messages, interrupts, ...extra })
  return {
    ...chat,
    messages: { value: chat.messages },
    interrupts: { value: chat.interrupts },
    pendingInterrupts: { value: chat.pendingInterrupts },
    error: { value: chat.error },
    isLoading: { value: chat.isLoading },
    status: { value: chat.status },
    queue: { value: chat.queue },
  }
}

export function createSvelteChatResult(
  messages: Array<UIMessage>,
  interrupts: Array<ChatUIInterrupt> = [],
  extra: {
    queue?: Array<QueuedMessage>
    cancelQueued?: (id: string) => void
  } = {},
) {
  return createChatResult({ messages, interrupts, ...extra })
}
