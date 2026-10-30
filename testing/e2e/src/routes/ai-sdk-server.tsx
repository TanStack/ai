import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { useChat } from '@tanstack/ai-react'
import { fromChatTransport } from '@tanstack/ai-ui-message-stream'
import { DefaultChatTransport } from 'ai'
import { z } from 'zod'
import type { UIMessage } from '@tanstack/ai'

// The route's tool, so its approval is a bound `tool-approval` interrupt.
const addToCart = toolDefinition({
  name: 'addToCart',
  description: 'Add a guitar to the cart',
  inputSchema: z.object({ guitarId: z.string(), quantity: z.number() }),
  needsApproval: true,
})

// A client tool. `fromChatTransport` sends it to the route in `clientTools`.
const getLocation = toolDefinition({
  name: 'getLocation',
  description: 'The location of the user',
  inputSchema: z.object({}),
}).client(() => 'Berlin')

const tools = [addToCart, getLocation] as const

const guitar = z.object({ name: z.string(), price: z.number() })

// TanStack `useChat` talks to the AI SDK route in `api.ai-sdk-server.ts`.
// `?prompt=` sets the first user message, and its tag picks the scenario.
const transport = new DefaultChatTransport({ api: '/api/ai-sdk-server' })
const connection = fromChatTransport(transport, { tools })
const structuredConnection = fromChatTransport(transport, {
  outputSchema: guitar,
})

const SCENARIOS: Array<[prompt: string, expect: string]> = [
  ['[chat] recommend a guitar', 'aimock streamText text about a Stratocaster'],
  ['[ai-sdk-approval] buy the stratocaster', 'approve: added, cart reply'],
  ['[ai-sdk-deny] buy the stratocaster', 'deny: "Nothing was added."'],
  ['[ai-sdk-tool-error]', 'tool-output-error "Disk on fire", then a reply'],
  ['[ai-sdk-bad-args]', 'tool-input-error: lookup result is an error'],
  ['[ai-sdk-client-tool]', 'client tool runs: "You are in Berlin."'],
  ['[ai-sdk-reasoning]', 'thinking "Compare necks." then the text'],
  ['[ai-sdk-structured]', 'structured-output {"name":"Stratocaster",...}'],
  ['[ai-sdk-data]', 'one data-search activity, updated in place'],
  ['[ai-sdk-data-two]', 'data-search and data-weather, same id, two cards'],
  ['[ai-sdk-error]', 'error chunk: error "Upstream failed"'],
  ['[ai-sdk-abort]', 'abort chunk: run cancelled, no error'],
  ['[ai-sdk-early-end]', 'ends before finish: one reconnect, then "Partial"'],
  ['[ai-sdk-drop]', 'drop + no resume GET: error at once, no retry limit'],
]

export const Route = createFileRoute('/ai-sdk-server')({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : undefined,
  }),
  component: AISDKServerPage,
})

function AISDKServerPage() {
  const { prompt = '[chat] recommend a guitar' } = Route.useSearch()
  return (
    <div data-testid="ai-sdk-server-page">
      <ul>
        {SCENARIOS.map(([scenario, expected]) => (
          <li key={scenario}>
            <a href={`?${new URLSearchParams({ prompt: scenario })}`}>
              {scenario}
            </a>{' '}
            expect: {expected}
          </li>
        ))}
      </ul>
      {prompt.startsWith('[ai-sdk-structured]') ? (
        <StructuredChat prompt={prompt} />
      ) : (
        <ToolChat prompt={prompt} />
      )}
    </div>
  )
}

function ToolChat({ prompt }: { prompt: string }) {
  const chat = useChat({ threadId: 'ai-sdk-server', connection, tools })
  return (
    <>
      {chat.interrupts.map((interrupt) =>
        interrupt.kind === 'tool-approval' ? (
          <div key={interrupt.id}>
            <button
              data-testid="approve-button"
              onClick={() => interrupt.resolveInterrupt(true)}
            >
              Approve {interrupt.toolName}
            </button>
            <button
              data-testid="deny-button"
              onClick={() => interrupt.resolveInterrupt(false)}
            >
              Deny {interrupt.toolName}
            </button>
          </div>
        ) : null,
      )}
      <ChatView prompt={prompt} {...chat} />
    </>
  )
}

function StructuredChat({ prompt }: { prompt: string }) {
  const chat = useChat({
    threadId: 'ai-sdk-server-structured',
    connection: structuredConnection,
    outputSchema: guitar,
  })
  return <ChatView prompt={prompt} {...chat} />
}

function ChatView({
  prompt,
  messages,
  sendMessage,
  status,
  error,
}: {
  prompt: string
  messages: ReadonlyArray<UIMessage>
  sendMessage: (content: string) => Promise<void>
  status: string
  error: Error | undefined
}) {
  const assistant = messages.filter((message) => message.role === 'assistant')
  const parts = messages.flatMap((message) => message.parts)
  const assistantText = assistant
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join('')
  const toolResults = parts.filter((part) => part.type === 'tool-result')
  const activities = messages.flatMap((message) =>
    message.role === 'activity'
      ? message.parts.flatMap((part) =>
          part.type === 'activity' ? [JSON.stringify(part.content)] : [],
        )
      : [],
  )

  useEffect(() => {
    void sendMessage(prompt)
    // Send once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {activities.map((content, index) => (
        <div key={index} data-testid="activity-content">
          {content}
        </div>
      ))}
      <div data-testid="status">{status}</div>
      <div data-testid="error">{error?.message ?? ''}</div>
      <div data-testid="assistant-count">{assistant.length}</div>
      <div data-testid="tool-results">
        {toolResults.map((part) => part.content).join(',')}
      </div>
      <div data-testid="tool-result-states">
        {toolResults
          .map((part) => [part.state, part.outcome].filter(Boolean).join(':'))
          .join(',')}
      </div>
      <div data-testid="thinking">
        {parts
          .flatMap((part) => (part.type === 'thinking' ? [part.content] : []))
          .join('')}
      </div>
      <div data-testid="structured">
        {parts
          .flatMap((part) =>
            part.type === 'structured-output'
              ? [JSON.stringify('data' in part ? part.data : part.partial)]
              : [],
          )
          .join('')}
      </div>
      <div data-testid="assistant-text">{assistantText}</div>
    </>
  )
}
