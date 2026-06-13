import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { AGENTS, DEFAULT_AGENT } from '@/lib/agents'
import type { UIMessage } from '@tanstack/ai-react'
import type { AgentMode } from '@/lib/agents'

export const Route = createFileRoute('/')({
  component: CodingAgentPage,
})

function ToolCallCard({
  part,
}: {
  part: Extract<UIMessage['parts'][number], { type: 'tool-call' }>
}) {
  const args = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(part.arguments), null, 2)
    } catch {
      return part.arguments
    }
  }, [part.arguments])

  const output = useMemo(() => {
    if (part.output === undefined) return undefined
    return typeof part.output === 'string'
      ? part.output
      : JSON.stringify(part.output, null, 2)
  }, [part.output])

  return (
    <details className="my-1 rounded border border-gray-800 bg-gray-900/60 text-sm">
      <summary className="cursor-pointer select-none px-3 py-1.5 font-mono text-amber-300">
        🔧 {part.name}
        <span className="ml-2 text-xs text-gray-500">
          {output !== undefined ? 'done' : part.state}
        </span>
      </summary>
      <div className="space-y-2 border-t border-gray-800 px-3 py-2">
        <pre className="overflow-x-auto rounded bg-gray-950 p-2 text-xs text-gray-300">
          {args}
        </pre>
        {output !== undefined && (
          <pre className="max-h-48 overflow-auto rounded bg-gray-950 p-2 text-xs text-emerald-200">
            {output}
          </pre>
        )}
      </div>
    </details>
  )
}

function Message({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={isUser ? 'text-right' : 'text-left'}>
      <div
        className={
          isUser
            ? 'inline-block max-w-[80%] rounded-lg bg-blue-600 px-3 py-2 text-left'
            : 'block'
        }
      >
        {message.parts.map((part, index) => {
          if (part.type === 'text' && part.content.trim()) {
            return (
              <p key={index} className="whitespace-pre-wrap py-1">
                {part.content}
              </p>
            )
          }
          if (part.type === 'thinking' && part.content.trim()) {
            return (
              <details key={index} className="my-1 text-sm text-gray-400">
                <summary className="cursor-pointer select-none">
                  💭 thinking…
                </summary>
                <p className="whitespace-pre-wrap border-l-2 border-gray-700 pl-3">
                  {part.content}
                </p>
              </details>
            )
          }
          if (part.type === 'tool-call') {
            return <ToolCallCard key={part.id} part={part} />
          }
          return null
        })}
      </div>
    </div>
  )
}

function CodingAgentPage() {
  const [agentId, setAgentId] = useState<string>(DEFAULT_AGENT)
  const [mode, setMode] = useState<AgentMode>('read-only')
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)
  const [input, setInput] = useState('')

  const body = useMemo(
    () => ({ agentId, mode, sessionId }),
    [agentId, mode, sessionId],
  )

  const { messages, sendMessage, isLoading, clear, error } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    body,
    onCustomEvent: (eventType, data) => {
      if (
        eventType === 'claude-code.session-id' &&
        typeof data === 'object' &&
        data !== null &&
        'sessionId' in data &&
        typeof data.sessionId === 'string'
      ) {
        setSessionId(data.sessionId)
      }
    },
  })

  const newSession = () => {
    setSessionId(undefined)
    clear()
  }

  const send = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    void sendMessage(text)
  }

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-4">
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-800 py-3">
        <h1 className="mr-auto text-lg font-semibold">Coding Agent</h1>
        <select
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm"
        >
          {AGENTS.map((agent) => (
            <option key={agent.id} value={agent.id} disabled={!agent.available}>
              {agent.label}
            </option>
          ))}
        </select>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as AgentMode)}
          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm"
        >
          <option value="read-only">Read-only</option>
          <option value="edit">Edit mode</option>
        </select>
        <button
          onClick={newSession}
          className="rounded border border-gray-700 px-2 py-1 text-sm hover:bg-gray-800"
        >
          New session
        </button>
      </header>

      <div className="py-1 text-xs text-gray-500">
        {sessionId
          ? `Resuming Claude Code session ${sessionId.slice(0, 8)}… — follow-ups send only your latest message.`
          : 'No session yet — the first reply starts one and pins it via the claude-code.session-id event.'}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="text-gray-500">
            Try: “What files are in this project, and what do they do?” — then
            switch to Edit mode and ask it to fix the bug in{' '}
            <code className="text-gray-400">workspace/temperature.js</code>.
          </p>
        )}
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {error && (
          <p className="rounded border border-red-800 bg-red-950/40 p-2 text-sm text-red-300">
            {String(error)}
          </p>
        )}
      </div>

      <footer className="flex gap-2 border-t border-gray-800 py-3">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send()
          }}
          placeholder="Ask the agent to explore or change the workspace…"
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 outline-none focus:border-gray-500"
        />
        <button
          onClick={send}
          disabled={isLoading || !input.trim()}
          className="rounded bg-blue-600 px-4 py-2 font-medium disabled:opacity-40"
        >
          {isLoading ? 'Working…' : 'Send'}
        </button>
      </footer>
    </main>
  )
}
