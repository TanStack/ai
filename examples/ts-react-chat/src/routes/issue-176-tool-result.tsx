import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { modelMessagesToUIMessages, type ModelMessage } from '@tanstack/ai'

const modelMessages: Array<ModelMessage> = [
  {
    role: 'assistant',
    content: 'Let me check the weather.',
    toolCalls: [
      {
        id: 'issue-176-tool-call',
        type: 'function',
        function: {
          name: 'getWeather',
          arguments: '{"city":"NYC"}',
        },
      },
    ],
  },
  {
    role: 'tool',
    content: '{"temp":72,"condition":"sunny"}',
    toolCallId: 'issue-176-tool-call',
  },
]

function Issue176ToolResultRepro() {
  const initialMessages = useMemo(
    () => modelMessagesToUIMessages(modelMessages),
    [],
  )

  const { messages } = useChat({
    id: 'issue-176-tool-result-repro',
    connection: fetchServerSentEvents('/api/tanchat'),
    initialMessages,
  })

  const toolCall = messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === 'tool-call' && part.id === 'issue-176-tool-call',
    )
  const toolResult = messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === 'tool-result' &&
        part.toolCallId === 'issue-176-tool-call',
    )
  const isFixed =
    toolCall?.type === 'tool-call' &&
    toolCall.state === 'complete' &&
    toolCall.output !== undefined

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-orange-300">
            Issue #176 manual repro
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            Server tool result hydration
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300">
            This page initializes a chat from model-message history containing
            an assistant server tool call followed by a matching tool result.
            The original tool-call part should be complete and include output.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-400">
              Tool-call state
            </div>
            <div
              id="issue-176-tool-state"
              className={`mt-2 text-2xl font-semibold ${
                isFixed ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {toolCall?.type === 'tool-call' ? toolCall.state : 'missing'}
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-400">
              Tool-call output
            </div>
            <div
              id="issue-176-tool-output"
              className={`mt-2 text-2xl font-semibold ${
                toolCall?.type === 'tool-call' && toolCall.output !== undefined
                  ? 'text-emerald-300'
                  : 'text-amber-300'
              }`}
            >
              {toolCall?.type === 'tool-call' && toolCall.output !== undefined
                ? 'present'
                : 'missing'}
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-400">
              Tool-result part
            </div>
            <div
              id="issue-176-tool-result"
              className={`mt-2 text-2xl font-semibold ${
                toolResult ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {toolResult ? 'present' : 'missing'}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-800 bg-gray-900">
            <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium text-gray-200">
              ModelMessage history fixture
            </div>
            <pre className="overflow-auto p-4 text-xs leading-5 text-gray-300">
              {JSON.stringify(modelMessages, null, 2)}
            </pre>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900">
            <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium text-gray-200">
              Hydrated UIMessage.parts
            </div>
            <pre
              id="issue-176-messages-json"
              className="overflow-auto p-4 text-xs leading-5 text-gray-300"
            >
              {JSON.stringify(messages, null, 2)}
            </pre>
          </div>
        </section>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/issue-176-tool-result')({
  component: Issue176ToolResultRepro,
})
