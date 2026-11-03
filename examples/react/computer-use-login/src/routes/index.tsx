import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { requestLoginTool } from '@/request-login'
import type { UIMessage } from '@tanstack/ai-react'

const THREAD_ID = 'computer-use-login'

const TASK = `Open https://the-internet.herokuapp.com/login in Chromium and sign in.
When you are signed in, say what the page shows and stop.`

type Part = UIMessage['parts'][number]

const MEDIA_PREFIX = 'harness-media:'

/**
 * The screenshots in one tool result, as `<img>` sources. The harness keeps
 * each screenshot in its media store. The message has only its id.
 */
function screenshots(part: Part) {
  if (part.type !== 'tool-result' || typeof part.content === 'string') return []
  return part.content.flatMap((content) => {
    if (content.type !== 'image') return []
    const { source } = content
    if (source.type === 'data') {
      return [`data:${source.mimeType};base64,${source.value}`]
    }
    if (source.value.startsWith(MEDIA_PREFIX)) {
      const id = source.value.slice(MEDIA_PREFIX.length)
      return [
        `/api/harness/media?${new URLSearchParams({ threadId: THREAD_ID, id })}`,
      ]
    }
    return [source.value]
  })
}

function Messages({ messages }: { messages: ReadonlyArray<UIMessage> }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  if (!messages.length) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-2 text-xl font-semibold text-white">
            Sign in without the model
          </h2>
          <p className="text-sm text-gray-400">
            Click Send. The model opens a sign-in page in a Docker desktop. When
            it needs a password, a card asks you. The model never sees what you
            type.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`mb-2 rounded-lg p-4 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          {message.parts.map((part, index) => {
            if (part.type === 'text' && part.content) {
              return (
                <div key={index} className="whitespace-pre-wrap text-white">
                  {part.content}
                </div>
              )
            }
            return screenshots(part).map((src) => (
              <img
                key={`${index}-${src.slice(-16)}`}
                src={src}
                alt="What the model sees"
                className="my-2 max-w-xl rounded border border-gray-700"
              />
            ))
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * The model asked for a sign-in. The username and password go to
 * `/api/login`, not to the chat. The answer to the model is only "yes".
 */
function LoginCard({
  site,
  onAnswer,
}: {
  site: string
  onAnswer: (approved: boolean) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [isSending, setIsSending] = useState(false)

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSending(true)
    setError(undefined)
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: THREAD_ID, site, username, password }),
      })
      if (!response.ok) {
        throw new Error(
          `The server did not take the login (${response.status}).`,
        )
      }
      setPassword('')
      onAnswer(true)
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : String(sendError),
      )
      setIsSending(false)
    }
  }

  return (
    <form
      onSubmit={signIn}
      className="mx-4 mt-2 flex flex-col gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-100"
    >
      <p className="font-medium">
        Sign in to <span className="font-mono">{new URL(site).origin}</span>
      </p>
      <p className="text-xs text-orange-200/80">
        The server fills the form in the browser. The model never sees your
        password.
      </p>
      <input
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
        placeholder="Username"
        aria-label="Username"
        required
        className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
      />
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        placeholder="Password"
        aria-label="Password"
        required
        className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
      />
      {error ? <p className="text-red-400">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSending}
          className="rounded bg-orange-500 px-3 py-1 text-white disabled:opacity-50"
        >
          {isSending ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button"
          disabled={isSending}
          onClick={() => onAnswer(false)}
          className="rounded bg-gray-700 px-3 py-1 text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Another approval, like an OpenAI safety check on a computer action. */
function ApprovalCard({
  message,
  onAnswer,
}: {
  message: string | undefined
  onAnswer: (approved: boolean) => void
}) {
  return (
    <div className="mx-4 mt-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
      <p className="mb-2 font-medium">{message ?? 'Approve this action?'}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onAnswer(true)}
          className="rounded bg-orange-500 px-3 py-1 text-white"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onAnswer(false)}
          className="rounded bg-gray-700 px-3 py-1 text-white"
        >
          Decline
        </button>
      </div>
    </div>
  )
}

function ChatPage() {
  const [input, setInput] = useState(TASK)
  const { messages, sendMessage, isLoading, error, stop, interrupts } = useChat(
    {
      connection: fetchServerSentEvents('/api/harness/run'),
      threadId: THREAD_ID,
      // No browser code: the tool runs on the server. This gives the
      // approval of the tool its typed arguments.
      tools: [requestLoginTool.client()],
      // Load the thread from the server after a reload.
      persistence: true,
    },
  )

  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex h-screen bg-gray-900">
      <div className="flex w-full flex-col">
        <Messages messages={messages} />

        {interrupts.map((interrupt) => {
          if (interrupt.kind === 'tool-approval') {
            return (
              <LoginCard
                key={interrupt.id}
                site={interrupt.originalArgs.site}
                onAnswer={(approved) => interrupt.resolveInterrupt(approved)}
              />
            )
          }
          if (interrupt.kind === 'generic') {
            return (
              <ApprovalCard
                key={interrupt.id}
                message={interrupt.message}
                onAnswer={(approved) => interrupt.resolveInterrupt(approved)}
              />
            )
          }
          return null
        })}

        {error ? (
          <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error.message}
          </div>
        ) : null}

        <div className="border-t border-orange-500/10 bg-gray-900/80">
          <div className="w-full px-4 py-3">
            {isLoading ? (
              <div className="mb-3 flex items-center justify-center">
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Stop
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Tell the model what to do on the desktop..."
                className="w-full resize-none rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                rows={3}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
