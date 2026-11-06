import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai'

// AI SDK `useChat` talks to the TanStack `chat()` route in
// `api.ai-sdk-client.ts`. `?prompt=` sets the first user message, and its
// prefix picks the scenario.
const transport = new DefaultChatTransport({ api: '/api/ai-sdk-client' })

const SCENARIOS: Array<[prompt: string, expect: string]> = [
  ['Weather in Oslo?', 'server tool runs, then "Tool said: sunny in Oslo"'],
  ['Delete a.txt', 'approval card. Approve runs the tool. Deny skips it'],
  ['[error] hi', 'chat() fails with RUN_ERROR, error "The model is down"'],
  ['[crash] hi', 'route throws mid-reply, error "The route crashed mid-reply"'],
  ['[tool-throws] hi', 'explode is output-error "Disk on fire", reply goes on'],
  ['[bad-args] hi', 'broken JSON args: getWeather is output-error, not run'],
  ['[client-tool] where am I?', 'onToolCall answers Berlin, one assistant'],
  ['[reasoning] hi', 'reasoning "Look at the map first." then the text'],
  ['[activity] hi', 'one data-search part updated to done, then "Found 3."'],
  ['[slow] count', 'slow reply. Stop ends it early, status ready'],
]

export const Route = createFileRoute('/ai-sdk-client')({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : undefined,
  }),
  component: AISDKClientPage,
})

function AISDKClientPage() {
  const { prompt = 'Weather in Oslo?' } = Route.useSearch()
  const {
    messages,
    sendMessage,
    addToolApprovalResponse,
    addToolOutput,
    status,
    error,
    stop,
  } = useChat({
    transport,
    sendAutomaticallyWhen: (options) =>
      lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
      (prompt.startsWith('[client-tool]') &&
        lastAssistantMessageIsCompleteWithToolCalls(options)),
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName !== 'getLocation') return
      void addToolOutput({
        tool: 'getLocation',
        toolCallId: toolCall.toolCallId,
        output: 'Berlin',
      })
    },
  })

  const assistant = messages.filter((message) => message.role === 'assistant')
  const parts = assistant.flatMap((message) => message.parts)
  const text = parts.flatMap((part) =>
    part.type === 'text' ? [part.text] : [],
  )
  const reasoning = parts.flatMap((part) =>
    part.type === 'reasoning' ? [part.text] : [],
  )
  const dataParts = parts.flatMap((part) =>
    part.type.startsWith('data-') && 'data' in part
      ? [`${part.type}:${JSON.stringify(part.data)}`]
      : [],
  )
  const toolParts = parts.filter(isToolUIPart)
  const toolOutputs = toolParts.flatMap((part) =>
    part.state === 'output-available' ? [String(part.output)] : [],
  )

  useEffect(() => {
    void sendMessage({ text: prompt })
    // Send once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="ai-sdk-client-page">
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
      {toolParts.map((part) =>
        part.state === 'approval-requested' ? (
          <div key={part.toolCallId}>
            <button
              data-testid="approve-button"
              onClick={() =>
                void addToolApprovalResponse({
                  id: part.approval.id,
                  approved: true,
                })
              }
            >
              Approve
            </button>
            <button
              data-testid="deny-button"
              onClick={() =>
                void addToolApprovalResponse({
                  id: part.approval.id,
                  approved: false,
                })
              }
            >
              Deny
            </button>
          </div>
        ) : null,
      )}
      <button data-testid="stop-button" onClick={() => void stop()}>
        Stop
      </button>
      <div data-testid="status">{status}</div>
      <div data-testid="error">{error?.message ?? ''}</div>
      <div data-testid="assistant-count">{assistant.length}</div>
      <div data-testid="tool-states">
        {toolParts
          .map((part) => `${getToolName(part)}:${part.state}`)
          .join(',')}
      </div>
      <div data-testid="tool-errors">
        {toolParts
          .flatMap((part) =>
            part.state === 'output-error' ? [part.errorText] : [],
          )
          .join(',')}
      </div>
      <div data-testid="tool-outputs">{toolOutputs.join(',')}</div>
      <div data-testid="reasoning">{reasoning.join('')}</div>
      <div data-testid="data-parts">{dataParts.join('|')}</div>
      <div data-testid="assistant-text">{text.join('')}</div>
    </div>
  )
}
