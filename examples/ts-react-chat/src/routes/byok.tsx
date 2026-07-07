import { useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import {
  ByokKeyManager,
  ByokProvider,
  byokHeaders,
  isPasskeyStorageSupported,
  memoryStorage,
  passkeyStorage,
  useByok,
} from '@tanstack/ai-byok/react'
import type { UIMessage } from '@tanstack/ai-react'
import type { ProviderId } from '@tanstack/ai-byok/react'

export const Route = createFileRoute('/byok')({
  component: ByokPage,
})

// Providers this demo relay supports (see src/routes/api.byok-chat.ts).
const MODELS: Array<{ provider: ProviderId; model: string; label: string }> = [
  { provider: 'openai', model: 'gpt-5.2', label: 'OpenAI · GPT-5.2' },
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI · GPT-4o' },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    label: 'Anthropic · Claude Sonnet 4.6',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    label: 'Gemini · 3.1 Pro',
  },
]

function ByokPage() {
  // Encrypted persistence where the platform supports it (passkey/PRF), else
  // session-only. Chosen once — storage is fixed for the provider's life.
  const [storage] = useState(() =>
    isPasskeyStorageSupported() ? passkeyStorage() : memoryStorage(),
  )
  return (
    <ByokProvider storage={storage}>
      <ByokChat />
    </ByokProvider>
  )
}

function ByokChat() {
  const { keys } = useByok()
  // Read the latest keys at request time without recreating the connection.
  const keysRef = useRef(keys)
  keysRef.current = keys

  const [selected, setSelected] = useState(MODELS[0])
  const [input, setInput] = useState('')

  const connection = useMemo(
    () =>
      fetchServerSentEvents('/api/byok-chat', () => ({
        headers: byokHeaders(keysRef.current),
      })),
    [],
  )

  const body = useMemo(
    () => ({ provider: selected.provider, model: selected.model }),
    [selected],
  )

  const { messages, sendMessage, isLoading, error } = useChat({
    connection,
    body,
  })

  const missingKey = !keys[selected.provider]

  return (
    <div className="mx-auto flex h-[calc(100vh-72px)] max-w-3xl flex-col gap-4 p-4">
      <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
        <h2 className="mb-1 text-lg font-semibold text-white">
          Bring your own key
        </h2>
        <p className="mb-4 text-sm text-gray-400">
          Keys stay in your browser and are sent per-request in a header — never
          the message body, never stored on the server.
        </p>
        <ByokKeyManager providers={['openai', 'anthropic', 'gemini']} />
      </div>

      <div className="flex items-center gap-2">
        <select
          value={`${selected.provider}:${selected.model}`}
          onChange={(event) => {
            const next = MODELS.find(
              (m) => `${m.provider}:${m.model}` === event.target.value,
            )
            if (next) setSelected(next)
          }}
          className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
        >
          {MODELS.map((m) => (
            <option
              key={`${m.provider}:${m.model}`}
              value={`${m.provider}:${m.model}`}
            >
              {m.label}
            </option>
          ))}
        </select>
        {missingKey ? (
          <span className="text-sm text-amber-400">
            Add your {selected.provider} key above to chat.
          </span>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/50 p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500">Send a message to start.</p>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        {error ? <p className="text-sm text-red-400">{error.message}</p> : null}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!input.trim()) return
          sendMessage(input.trim())
          setInput('')
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask something…"
          className="flex-1 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-white"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-md bg-orange-500 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {isLoading ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  )
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('')
  if (!text) return null
  return (
    <div className={message.role === 'user' ? 'text-right' : 'text-left'}>
      <span
        className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
          message.role === 'user'
            ? 'bg-orange-500/20 text-orange-100'
            : 'bg-gray-800 text-gray-100'
        }`}
      >
        {text}
      </span>
    </div>
  )
}
