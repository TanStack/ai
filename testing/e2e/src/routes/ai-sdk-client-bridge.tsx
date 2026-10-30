import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useChat } from '@ai-sdk/react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { toChatTransport } from '@tanstack/ai-ui-message-stream'
import {
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai'

// AI SDK `useChat` talks to the plain TanStack `chat()` route in
// `api.ai-sdk-client-bridge.ts`. The bridge runs here, in the browser.
const transport = toChatTransport(
  fetchServerSentEvents('/api/ai-sdk-client-bridge'),
)

const SCENARIOS: Array<[prompt: string, expect: string]> = [
  ['Weather in Oslo?', 'server tool runs, then "Tool said: sunny in Oslo"'],
  ['Delete a.txt', 'approval card. Approve runs the tool. Deny skips it'],
  ['[client-tool] where am I?', 'onToolCall answers Berlin, one assistant'],
  ['[error] hi', 'chat() fails, error "The model is down"'],
]

export const Route = createFileRoute('/ai-sdk-client-bridge')({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : undefined,
  }),
  component: AISDKClientBridgePage,
})

function AISDKClientBridgePage() {
  const { prompt = 'Weather in Oslo?' } = Route.useSearch()
  const {
    messages,
    sendMessage,
    addToolApprovalResponse,
    addToolOutput,
    status,
    error,
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
  const toolParts = parts.filter(isToolUIPart)

  useEffect(() => {
    void sendMessage({ text: prompt })
    // Send once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="ai-sdk-client-bridge-page">
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
      <div data-testid="status">{status}</div>
      <div data-testid="error">{error?.message ?? ''}</div>
      <div data-testid="assistant-count">{assistant.length}</div>
      <div data-testid="tool-states">
        {toolParts
          .map((part) => `${getToolName(part)}:${part.state}`)
          .join(',')}
      </div>
      <div data-testid="assistant-text">{text.join('')}</div>
    </div>
  )
}
