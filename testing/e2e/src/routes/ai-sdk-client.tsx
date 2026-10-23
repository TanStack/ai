import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai'

// AI SDK `useChat` talks to the TanStack `chat()` route in
// `api.ai-sdk-client.ts`. `?prompt=` sets the first user message.
const transport = new DefaultChatTransport({ api: '/api/ai-sdk-client' })

export const Route = createFileRoute('/ai-sdk-client')({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : undefined,
  }),
  component: AISDKClientPage,
})

function AISDKClientPage() {
  const { prompt = 'Weather in Oslo?' } = Route.useSearch()
  const { messages, sendMessage, addToolApprovalResponse } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })

  const parts = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts)
  const text = parts.flatMap((part) =>
    part.type === 'text' ? [part.text] : [],
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
      {toolParts.map((part) =>
        part.state === 'approval-requested' ? (
          <button
            key={part.toolCallId}
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
        ) : null,
      )}
      <div data-testid="tool-outputs">{toolOutputs.join(',')}</div>
      <div data-testid="assistant-text">{text.join('')}</div>
    </div>
  )
}
