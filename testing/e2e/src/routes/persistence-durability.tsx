import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import {
  clientTools,
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'
import { z } from 'zod'

/**
 * Browser-refresh persistence harness (client half).
 *
 * A `localStoragePersistence` adapter stores ONE combined `{ messages, resume }`
 * record per thread, so a full `page.reload()` restores the conversation — and
 * any pending-interrupt resume snapshot — straight from `localStorage`, with no
 * server round-trip. The matching provider-free durable endpoint is
 * `/api/persistence-durability`.
 */

const store = localStoragePersistence()

const deleteOrderDef = toolDefinition({
  name: 'delete_order',
  description: 'Delete an order',
  inputSchema: z.object({ id: z.string() }),
  needsApproval: true,
}).client()

const slowDeleteDef = toolDefinition({
  name: 'slow_delete',
  description: 'Delete an order slowly',
  inputSchema: z.object({ id: z.string() }),
  needsApproval: true,
}).client()

const chargeCardDef = toolDefinition({
  name: 'charge_card',
  description: 'Charge a credit card',
  inputSchema: z.object({ amount: z.number() }),
  needsApproval: true,
}).client()

const buyItemDef = toolDefinition({
  name: 'buy_item',
  description: 'Buy an item',
  inputSchema: z.object({ item: z.string(), price: z.number() }),
  needsApproval: true,
}).client()

const getTimezoneClient = toolDefinition({
  name: 'get_timezone',
  description: 'Get browser timezone',
  inputSchema: z.object({}),
  outputSchema: z.object({ tz: z.string() }),
}).client(() => ({ tz: 'UTC' }))

const PAGE_TOOLS = clientTools(
  deleteOrderDef,
  slowDeleteDef,
  chargeCardDef,
  buyItemDef,
  getTimezoneClient,
)

const CONNECTIONS = {
  text: fetchServerSentEvents('/api/persistence-durability'),
  interrupt: fetchServerSentEvents(
    '/api/persistence-durability?scenario=interrupt',
  ),
  'server-interrupt': fetchServerSentEvents(
    '/api/persistence-durability?scenario=server-interrupt',
  ),
  'approval-reload': fetchServerSentEvents(
    '/api/persistence-durability?scenario=approval-reload',
  ),
  'approval-mid-continuation': fetchServerSentEvents(
    '/api/persistence-durability?scenario=approval-mid-continuation',
  ),
  'decline-llm-fail': fetchServerSentEvents(
    '/api/persistence-durability?scenario=decline-llm-fail',
  ),
  'client-tool-reload': fetchServerSentEvents(
    '/api/persistence-durability?scenario=client-tool-reload',
  ),
  'thread-switch': fetchServerSentEvents(
    '/api/persistence-durability?scenario=interrupt',
  ),
  'multi-iter-cut': fetchServerSentEvents(
    '/api/persistence-durability?scenario=multi-iter-cut',
  ),
} as const

type PageScenario = keyof typeof CONNECTIONS

const SERVER_PERSISTENCE_SCENARIOS = new Set<PageScenario>([
  'server-interrupt',
  'approval-reload',
  'approval-mid-continuation',
  'decline-llm-fail',
  'client-tool-reload',
])

function parseScenario(value: unknown): PageScenario {
  if (typeof value === 'string' && value in CONNECTIONS) {
    return value as PageScenario
  }
  return 'text'
}

export const Route = createFileRoute('/persistence-durability')({
  component: PersistenceDurabilityPage,
  validateSearch: (search: Record<string, unknown>) => ({
    scenario: parseScenario(search.scenario),
    threadId:
      typeof search.threadId === 'string' && search.threadId.length > 0
        ? search.threadId
        : undefined,
  }),
})

function PersistenceDurabilityPage() {
  const { scenario, threadId: customThreadId } = Route.useSearch()
  const [interruptSource, setInterruptSource] = useState<
    'hydrate' | 'live' | null
  >(null)
  const [threadSlot, setThreadSlot] = useState<'a' | 'b'>('a')

  const baseChatId =
    customThreadId ??
    (scenario === 'server-interrupt'
      ? 'persistence-durability-server-interrupt'
      : scenario === 'interrupt'
        ? 'persistence-durability-interrupt'
        : scenario === 'text'
          ? 'persistence-durability-text'
          : `persistence-durability-${scenario}`)
  const chatId =
    scenario === 'thread-switch' ? `${baseChatId}-${threadSlot}` : baseChatId

  const useServerPersistence = SERVER_PERSISTENCE_SCENARIOS.has(scenario)
  const useClientPersistence =
    scenario === 'text' ||
    scenario === 'interrupt' ||
    scenario === 'thread-switch'

  const { messages, sendMessage, isLoading, error, interrupts } = useChat<
    typeof PAGE_TOOLS
  >({
    threadId: chatId,
    connection: CONNECTIONS[scenario],
    tools: PAGE_TOOLS,
    persistence: useServerPersistence
      ? true
      : useClientPersistence
        ? store
        : undefined,
    onInterruptStateChange: (_state, context) => {
      setInterruptSource(context.source)
    },
  })

  const [input, setInput] = useState('')

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    void sendMessage(text)
  }

  return (
    <div data-testid="persistence-durability-page" style={{ padding: 16 }}>
      <div
        data-testid="interrupt-count"
        data-count={String(interrupts.length)}
        hidden
      />
      <div
        data-testid="message-count"
        data-count={String(messages.length)}
        hidden
      />
      <div data-testid="interrupt-source" hidden>
        {interruptSource}
      </div>
      <div data-testid="active-thread" hidden>
        {chatId}
      </div>
      {error && <div data-testid="chat-error">{error.message}</div>}

      {scenario === 'thread-switch' && (
        <button
          type="button"
          data-testid="switch-thread"
          onClick={() => setThreadSlot((prev) => (prev === 'a' ? 'b' : 'a'))}
        >
          Switch thread ({threadSlot})
        </button>
      )}

      <div data-testid="message-list">
        {messages.map((message) => (
          <div
            key={message.id}
            data-testid={
              message.role === 'user' ? 'user-message' : 'assistant-message'
            }
          >
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <span key={`${message.id}-${index}`} data-testid="text-part">
                    {part.content}
                  </span>
                )
              }
              if (part.type === 'tool-call') {
                return (
                  <span
                    key={`${message.id}-${index}`}
                    data-testid={`tool-call-${part.name}`}
                    data-state={part.state}
                    data-approval-id={
                      'approval' in part ? (part.approval?.id ?? '') : ''
                    }
                  >
                    {part.name}:{part.state}
                  </span>
                )
              }
              return null
            })}
          </div>
        ))}
      </div>

      {interrupts.map((interrupt) => (
        <div key={interrupt.id} data-testid={`interrupt-${interrupt.id}`}>
          <span data-testid="interrupt-kind">{interrupt.kind}</span>
          <span data-testid="interrupt-message">
            {interrupt.message ?? interrupt.reason}
          </span>
          <span
            data-testid="interrupt-can-resolve"
            data-can-resolve={String(interrupt.canResolve)}
          >
            {String(interrupt.canResolve)}
          </span>
          {interrupt.kind === 'tool-approval' && (
            <>
              <button
                type="button"
                data-testid={`approve-${interrupt.id}`}
                onClick={() => interrupt.resolveInterrupt(true)}
              >
                Approve
              </button>
              <button
                type="button"
                data-testid={`deny-${interrupt.id}`}
                onClick={() => interrupt.resolveInterrupt(false)}
              >
                Deny
              </button>
            </>
          )}
        </div>
      ))}

      {isLoading && <div data-testid="loading-indicator">Generating...</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          data-testid="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Type a message..."
        />
        <button
          data-testid="send-button"
          onClick={handleSubmit}
          disabled={!input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
