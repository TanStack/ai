import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import { modelMessagesToUIMessages, type ModelMessage } from '@tanstack/ai'
import { getGuitarsToolDef, recommendGuitarToolDef } from '@/lib/guitar-tools'

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
  const [prompt, setPrompt] = useState(
    'I want an acoustic guitar recommendation. Use the required tools.',
  )
  const initialMessages = useMemo(
    () => modelMessagesToUIMessages(modelMessages),
    [],
  )
  const liveTools = useMemo(
    () =>
      clientTools(
        getGuitarsToolDef,
        recommendGuitarToolDef.client(({ id }) => ({
          id: Number(id),
        })),
      ),
    [],
  )

  const { messages: fixtureMessages } = useChat({
    id: 'issue-176-tool-result-repro',
    connection: fetchServerSentEvents('/api/tanchat'),
    initialMessages,
  })
  const {
    messages: liveMessages,
    sendMessage,
    isLoading,
    error,
  } = useChat({
    id: 'issue-176-live-tool-result-repro',
    connection: fetchServerSentEvents('/api/tanchat'),
    tools: liveTools,
    body: {
      provider: 'openai',
      model: 'gpt-4o',
    },
  })

  const toolCall = fixtureMessages
    .flatMap((message) => message.parts)
    .find(
      (part) => part.type === 'tool-call' && part.id === 'issue-176-tool-call',
    )
  const toolResult = fixtureMessages
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
  const liveServerToolCall = liveMessages
    .flatMap((message) => message.parts)
    .find((part) => part.type === 'tool-call' && part.name === 'getGuitars')
  const liveServerToolResult = liveMessages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === 'tool-result' &&
        liveServerToolCall?.type === 'tool-call' &&
        part.toolCallId === liveServerToolCall.id,
    )
  const isLiveFixed =
    liveServerToolCall?.type === 'tool-call' &&
    liveServerToolCall.state === 'complete' &&
    liveServerToolCall.output !== undefined

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

        <section className="rounded-lg border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-4 py-3">
            <h2 className="text-lg font-semibold">Live LLM repro</h2>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <div className="flex flex-col gap-3">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-28 rounded-lg border border-gray-700 bg-gray-950 p-3 text-sm text-gray-100 outline-none focus:border-orange-400"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isLoading || !prompt.trim()}
                  onClick={() => sendMessage(prompt)}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-gray-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Send to LLM
                </button>
                {error ? (
                  <span className="text-sm text-red-300">{error.message}</span>
                ) : (
                  <span className="text-sm text-gray-400">
                    {isLoading ? 'Running...' : 'Ready'}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
              <div className="text-xs uppercase tracking-wider text-gray-400">
                Live getGuitars state
              </div>
              <div
                id="issue-176-live-tool-state"
                className={`mt-2 text-2xl font-semibold ${
                  isLiveFixed ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {liveServerToolCall?.type === 'tool-call'
                  ? liveServerToolCall.state
                  : 'not run'}
              </div>
            </div>

            <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
              <div className="text-xs uppercase tracking-wider text-gray-400">
                Live getGuitars output
              </div>
              <div
                id="issue-176-live-tool-output"
                className={`mt-2 text-2xl font-semibold ${
                  liveServerToolCall?.type === 'tool-call' &&
                  liveServerToolCall.output !== undefined
                    ? 'text-emerald-300'
                    : 'text-amber-300'
                }`}
              >
                {liveServerToolCall?.type === 'tool-call' &&
                liveServerToolCall.output !== undefined
                  ? 'present'
                  : 'missing'}
              </div>
            </div>
          </div>
          <div className="grid gap-4 border-t border-gray-800 p-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium text-gray-200">
                Live server tool-call part
              </div>
              <pre className="max-h-80 overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-300">
                {JSON.stringify(liveServerToolCall ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-gray-200">
                Live matching tool-result part
              </div>
              <pre className="max-h-80 overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-300">
                {JSON.stringify(liveServerToolResult ?? null, null, 2)}
              </pre>
            </div>
          </div>
        </section>

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
              {JSON.stringify(fixtureMessages, null, 2)}
            </pre>
          </div>
        </section>

        <section className="rounded-lg border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium text-gray-200">
            Full live messages
          </div>
          <pre
            id="issue-176-live-messages-json"
            className="max-h-[520px] overflow-auto p-4 text-xs leading-5 text-gray-300"
          >
            {JSON.stringify(liveMessages, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/issue-176-tool-result')({
  component: Issue176ToolResultRepro,
})
