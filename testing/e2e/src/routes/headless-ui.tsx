import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  defineInterrupt,
  hashSchemaInput,
  INTERRUPT_BINDING_VERSION,
  normalizeApprovalSchema,
  toolDefinition,
} from '@tanstack/ai'
import { useChat } from '@tanstack/ai-react'
import { createChatUI } from '@tanstack/ai-react/ui'
import { EventType } from '@tanstack/ai/client'
import type { ChatFetcher } from '@tanstack/ai-client'
import { z } from 'zod'

const purchaseItem = toolDefinition({
  name: 'purchaseItem',
  description: 'Purchase an item',
  needsApproval: true,
  inputSchema: z.object({ item: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
}).client(async () => ({ ok: true }))

const purchaseApproval = normalizeApprovalSchema(
  purchaseItem.approvalSchema,
  purchaseItem.inputSchema,
)

const fetcher: ChatFetcher = async function* (input) {
  const runId = input.runId
  const threadId = input.threadId
  const messageId = 'asst-headless'
  if (input.resume && input.resume.length > 0) {
    yield {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: 'call-purchase',
      messageId,
      content: '{"ok":true}',
      timestamp: Date.now(),
    }
    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      timestamp: Date.now(),
      outcome: { type: 'success' },
    }
    return
  }
  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: 'assistant',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'call-purchase',
    toolCallName: 'purchaseItem',
    parentMessageId: messageId,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'call-purchase',
    delta: '{"item":"keyboard"}',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TOOL_CALL_END,
    toolCallId: 'call-purchase',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    timestamp: Date.now(),
    outcome: {
      type: 'interrupt',
      interrupts: [
        {
          id: 'approval-purchase',
          reason: 'tool_call',
          toolCallId: 'call-purchase',
          message: 'Approve purchase',
          metadata: {
            kind: 'approval',
            toolName: 'purchaseItem',
            'tanstack:interruptBinding': {
              v: INTERRUPT_BINDING_VERSION,
              kind: 'tool-approval',
              interruptId: 'approval-purchase',
              interruptedRunId: runId,
              generation: 0,
              toolName: 'purchaseItem',
              toolCallId: 'call-purchase',
              originalArgs: { item: 'keyboard' },
              inputSchemaHash: hashSchemaInput(purchaseItem.inputSchema),
              approvalSchemaHash: purchaseApproval.approvalSchemaHash,
              responseSchemaHash: purchaseApproval.responseSchemaHash,
            },
          },
        },
      ],
    },
  }
}

const chatOptions = {
  tools: [purchaseItem],
  initialMessages: [
    {
      id: 'seed-orphan',
      role: 'assistant' as const,
      parts: [
        {
          type: 'tool-result' as const,
          toolCallId: 'orphan-result',
          content: 'standalone-result',
          state: 'complete' as const,
        },
      ],
    },
  ],
  interrupts: [
    defineInterrupt({
      id: 'choosePlan',
      payloadSchema: z.object({ title: z.string() }),
      responseSchema: z.string(),
    }),
  ],
  fetcher,
}

const UI = createChatUI(chatOptions)

const components = UI.defineComponents({
  layout: ({ renderMessages, renderInterrupts, renderInput }) => {
    const chat = UI.useChat()
    return (
      <main>
        {chat.error ? (
          <pre data-testid="chat-error">{chat.error.message}</pre>
        ) : null}
        {renderMessages()}
        {renderInterrupts()}
        {renderInput()}
      </main>
    )
  },
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  input: function Input() {
    const chat = UI.useChat()
    const [ready, setReady] = useState(false)
    useEffect(() => {
      setReady(true)
    }, [])
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const field = event.currentTarget.elements.namedItem('message')
          if (!(field instanceof HTMLInputElement)) return
          const text = field.value.trim()
          if (!text) return
          field.value = ''
          void chat.sendMessage(text)
        }}
      >
        <label>
          Message
          <input aria-label="Message" name="message" data-testid="chat-input" />
        </label>
        <button type="submit" data-testid="send-button" disabled={!ready}>
          Send
        </button>
      </form>
    )
  },
  parts: {
    text: ({ part }) => (part.type === 'text' ? <p>{part.content}</p> : null),
    toolResult: ({ part }) =>
      part.type === 'tool-result' ? (
        <div data-testid="standalone-tool-result">{String(part.content)}</div>
      ) : null,
    fallback: () => null,
  },
  tools: {
    purchaseItem: ({ part, interrupt }) => (
      <div data-testid="purchase-tool">
        {part.input?.item}
        {interrupt?.status === 'pending' ? (
          <button
            data-testid="purchase-approval"
            type="button"
            onClick={() => interrupt.resolveInterrupt(true)}
          >
            Approve purchase
          </button>
        ) : null}
        {part.output ? (
          <div data-testid="purchase-output">
            {part.output.ok ? 'approved' : 'denied'}
          </div>
        ) : null}
      </div>
    ),
  },
  interrupts: {
    generic: { choosePlan: () => null, fallback: () => null },
  },
})

function HeadlessUIPage() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}

export const Route = createFileRoute('/headless-ui')({
  component: HeadlessUIPage,
})
