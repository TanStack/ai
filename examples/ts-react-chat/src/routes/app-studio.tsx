import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { GitBranch, Play } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import {
  errorMessageFromBody,
  previewUrlFrom,
  threadIdsFromForkBody,
  variantPrompt,
} from '../lib/app-studio-helpers'
import type { UIMessage } from '@tanstack/ai-react'

export const Route = createFileRoute('/app-studio')({
  component: AppStudioPage,
})

const connection = fetchServerSentEvents('/api/app-studio')
const THREADS_KEY = 'app-studio:threads'

interface StudioThread {
  id: string
  title: string
  parentId: string | null
  variant?: 'A' | 'B'
  inheritedPreviewUrls?: Array<string>
}

interface CompareState {
  leftId: string
  rightId: string
  prompt: string
  inheritedPreviewUrls: Array<string>
}

function loadThreads(): Array<StudioThread> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(THREADS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (item === null || typeof item !== 'object') return []
      const id = Reflect.get(item, 'id')
      const title = Reflect.get(item, 'title')
      const parentId = Reflect.get(item, 'parentId')
      const variant = Reflect.get(item, 'variant')
      const inherited = Reflect.get(item, 'inheritedPreviewUrls')
      if (typeof id !== 'string' || typeof title !== 'string') return []
      const inheritedPreviewUrls = Array.isArray(inherited)
        ? inherited.filter((url) => typeof url === 'string')
        : []
      return [
        {
          id,
          title,
          parentId: typeof parentId === 'string' ? parentId : null,
          ...(variant === 'A' || variant === 'B' ? { variant } : {}),
          ...(inheritedPreviewUrls.length > 0 ? { inheritedPreviewUrls } : {}),
        },
      ]
    })
  } catch {
    return []
  }
}

function newThread(parentId: string | null = null): StudioThread {
  return {
    id: `studio-${crypto.randomUUID()}`,
    title: parentId ? 'Fork' : 'New app',
    parentId,
  }
}

function ThreadNav({
  threads,
  activeId,
  compare,
  onSelect,
  horizontal = false,
}: {
  threads: Array<StudioThread>
  activeId: string
  compare: CompareState | null
  onSelect: (id: string) => void
  horizontal?: boolean
}) {
  return (
    <nav
      aria-label="App chats"
      className={
        horizontal ? 'min-w-0 flex-1 overflow-x-auto' : 'flex-1 overflow-y-auto'
      }
    >
      <ul
        role="list"
        className={horizontal ? 'flex gap-1' : 'flex flex-col gap-1'}
      >
        {threads.map((thread) => {
          const isActive =
            thread.id === activeId ||
            thread.id === compare?.leftId ||
            thread.id === compare?.rightId
          return (
            <li
              key={thread.id}
              className={
                horizontal ? 'shrink-0' : thread.parentId ? 'ml-3' : ''
              }
            >
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
                  horizontal ? '' : 'w-full'
                } ${isActive ? 'bg-cyan-800' : 'hover:bg-gray-800'}`}
                onClick={() => onSelect(thread.id)}
              >
                {thread.title}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function collectPreviewUrls(messages: Array<UIMessage>): Set<string> {
  const urls = new Set<string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== 'tool-call' || part.name !== 'exposePreview') continue
      const url = previewUrlFrom(part.output)
      if (url) urls.add(url)
    }
  }
  return urls
}

function latestPreview(
  messages: Array<UIMessage>,
  skip: ReadonlySet<string> = new Set(),
): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (!message) continue
    for (const part of message.parts) {
      if (part.type !== 'tool-call' || part.name !== 'exposePreview') continue
      const url = previewUrlFrom(part.output)
      if (url && !skip.has(url)) return url
    }
  }
  return null
}

function hasUserText(messages: Array<UIMessage>, text: string): boolean {
  return messages.some(
    (message) =>
      message.role === 'user' &&
      message.parts.some(
        (part) => part.type === 'text' && part.content === text,
      ),
  )
}

function AppStudioPage() {
  const [threads, setThreads] = useState<Array<StudioThread>>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [compare, setCompare] = useState<CompareState | null>(null)
  const [wantCompare, setWantCompare] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loaded = loadThreads()
    if (loaded.length === 0) {
      const first = newThread()
      setThreads([first])
      setActiveId(first.id)
    } else {
      setThreads(loaded)
      setActiveId(loaded[0]?.id ?? null)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(THREADS_KEY, JSON.stringify(threads))
  }, [threads, hydrated])

  const createRoot = () => {
    const thread = newThread()
    setCompare(null)
    setWantCompare(false)
    setError(null)
    setThreads((prev) => [thread, ...prev])
    setActiveId(thread.id)
  }

  const titleFrom = useCallback((id: string, title: string) => {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === id &&
        (thread.title === 'New app' || thread.title === 'Fork')
          ? { ...thread, title }
          : thread,
      ),
    )
  }, [])

  const forkOne = async (inheritedPreviewUrls: Array<string>) => {
    if (!activeId || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/app-studio-fork', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId: activeId, label: 'continue' }),
      })
      const body: unknown = await response.json()
      if (!response.ok) {
        throw new Error(errorMessageFromBody(body, 'Could not fork this chat'))
      }
      const [nextId] = threadIdsFromForkBody(body)
      if (nextId === undefined) {
        throw new Error('Could not fork this chat')
      }
      const child: StudioThread = {
        id: nextId,
        title: 'Fork',
        parentId: activeId,
        ...(inheritedPreviewUrls.length > 0 ? { inheritedPreviewUrls } : {}),
      }
      setThreads((prev) => [child, ...prev])
      setCompare(null)
      setActiveId(nextId)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not fork this chat',
      )
    } finally {
      setBusy(false)
    }
  }

  const startCompare = async (
    prompt: string,
    inheritedPreviewUrls: Array<string>,
  ) => {
    if (!activeId || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/app-studio-fork', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: activeId,
          count: 2,
          label: 'compare',
        }),
      })
      const body: unknown = await response.json()
      if (!response.ok) {
        throw new Error(
          errorMessageFromBody(body, 'Could not start the comparison'),
        )
      }
      const ids = threadIdsFromForkBody(body)
      const leftId = ids[0]
      const rightId = ids[1]
      if (leftId === undefined || rightId === undefined) {
        throw new Error('Could not start the comparison')
      }
      const inherited =
        inheritedPreviewUrls.length > 0 ? { inheritedPreviewUrls } : {}
      setThreads((prev) => [
        {
          id: leftId,
          title: 'Variant A',
          parentId: activeId,
          variant: 'A',
          ...inherited,
        },
        {
          id: rightId,
          title: 'Variant B',
          parentId: activeId,
          variant: 'B',
          ...inherited,
        },
        ...prev,
      ])
      setCompare({ leftId, rightId, prompt, inheritedPreviewUrls })
      setWantCompare(false)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not start the comparison',
      )
    } finally {
      setBusy(false)
    }
  }

  const keepVariant = (id: string) => {
    setActiveId(id)
    setCompare(null)
  }

  const onActiveTitle = useCallback(
    (title: string) => {
      if (activeId === null) return
      titleFrom(activeId, title)
    },
    [activeId, titleFrom],
  )

  if (!hydrated || !activeId) {
    return (
      <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center bg-gray-950 text-sm text-gray-400">
        <p role="status">Loading chats.</p>
      </div>
    )
  }

  const selectThread = (id: string) => {
    setCompare(null)
    setWantCompare(false)
    setActiveId(id)
  }

  return (
    <div className="flex h-[calc(100vh-4.5rem)] bg-gray-950 text-gray-100">
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-gray-800 p-3 flex-col gap-2">
        <button
          type="button"
          className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium hover:bg-cyan-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          onClick={createRoot}
        >
          Start new app
        </button>
        <ThreadNav
          threads={threads}
          activeId={activeId}
          compare={compare}
          onSelect={selectThread}
        />
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="lg:hidden border-b border-gray-800 p-2 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            className="shrink-0 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium hover:bg-cyan-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            onClick={createRoot}
          >
            Start new app
          </button>
          <ThreadNav
            threads={threads}
            activeId={activeId}
            compare={compare}
            onSelect={selectThread}
            horizontal
          />
        </div>
        <header className="border-b border-gray-800 px-4 py-3">
          <h1 className="text-lg font-semibold">App Studio</h1>
          <p className="text-sm text-gray-400">
            Describe an app. The agent builds it in a sandbox and shows a
            preview. Fork the chat to continue, or compare two directions and
            keep one. Needs Docker and <code>XAI_API_KEY</code>.
          </p>
        </header>

        {error ? (
          <p
            role="alert"
            className="mx-4 mt-3 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </p>
        ) : null}

        {compare ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
            <ComparePane
              threadId={compare.leftId}
              label="A"
              prompt={compare.prompt}
              inheritedPreviewUrls={compare.inheritedPreviewUrls}
              onKeep={() => keepVariant(compare.leftId)}
            />
            <ComparePane
              threadId={compare.rightId}
              label="B"
              prompt={compare.prompt}
              inheritedPreviewUrls={compare.inheritedPreviewUrls}
              onKeep={() => keepVariant(compare.rightId)}
            />
          </div>
        ) : (
          <StudioPane
            key={activeId}
            threadId={activeId}
            inheritedPreviewUrls={
              threads.find((thread) => thread.id === activeId)
                ?.inheritedPreviewUrls ?? []
            }
            wantCompare={wantCompare}
            setWantCompare={setWantCompare}
            busy={busy}
            onFork={forkOne}
            onCompare={startCompare}
            onTitle={onActiveTitle}
          />
        )}
      </main>
    </div>
  )
}

function StudioPane({
  threadId,
  inheritedPreviewUrls,
  wantCompare,
  setWantCompare,
  busy,
  onFork,
  onCompare,
  onTitle,
}: {
  threadId: string
  inheritedPreviewUrls: Array<string>
  wantCompare: boolean
  setWantCompare: (value: boolean) => void
  busy: boolean
  onFork: (inheritedPreviewUrls: Array<string>) => void
  onCompare: (
    prompt: string,
    inheritedPreviewUrls: Array<string>,
  ) => Promise<void>
  onTitle: (title: string) => void
}) {
  const {
    messages,
    sendMessage,
    isLoading,
    error: chatError,
  } = useChat({
    threadId,
    connection,
    persistence: true,
  })
  const [input, setInput] = useState('')
  const preview = useMemo(
    () => latestPreview(messages, new Set(inheritedPreviewUrls)),
    [inheritedPreviewUrls, messages],
  )
  const hasBuiltApp = messages.some(
    (message) =>
      message.role === 'assistant' &&
      message.parts.some(
        (part) =>
          (part.type === 'text' && Boolean(part.content)) ||
          part.type === 'tool-call',
      ),
  )

  useEffect(() => {
    const firstUser = messages.find((message) => message.role === 'user')
    const part = firstUser?.parts.find((item) => item.type === 'text')
    if (part && 'content' in part && typeof part.content === 'string') {
      onTitle(part.content.slice(0, 40))
    }
  }, [messages, onTitle])

  const send = async () => {
    const trimmed = input.trim()
    if (isLoading || busy) return
    if (wantCompare) {
      if (!hasBuiltApp) return
      setInput('')
      await onCompare(trimmed, [...collectPreviewUrls(messages)])
      return
    }
    if (!trimmed) return
    setInput('')
    void sendMessage(trimmed)
  }

  return (
    <>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
        <MessageList messages={messages} isLoading={isLoading} />
        <PreviewFrame url={preview} />
      </div>
      <form
        className="border-t border-gray-800 p-3 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <label htmlFor="studio-prompt" className="text-sm text-gray-300">
          {wantCompare ? 'Change to compare' : 'What to build'}
        </label>
        {chatError ? (
          <p
            role="alert"
            className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          >
            {chatError.message}
          </p>
        ) : null}
        <textarea
          id="studio-prompt"
          className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          rows={3}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            wantCompare
              ? 'Make the board denser, or leave empty to compare two looks.'
              : 'Build a kanban board with localStorage, then show the preview.'
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={wantCompare}
              disabled={!hasBuiltApp || busy || isLoading}
              onChange={(event) => setWantCompare(event.target.checked)}
            />
            Compare two directions
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-600 px-3 py-1.5 text-sm hover:bg-gray-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            onClick={() => void onFork([...collectPreviewUrls(messages)])}
            disabled={!hasBuiltApp || busy || isLoading}
          >
            <GitBranch className="w-4 h-4" aria-hidden="true" />
            Fork chat
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-medium hover:bg-cyan-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            disabled={
              busy || isLoading || (!wantCompare && input.trim() === '')
            }
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            {wantCompare ? 'Compare both' : 'Build'}
          </button>
        </div>
        {!hasBuiltApp ? (
          <p className="text-xs text-gray-500">
            Build the app first. Then you can fork the chat or compare two
            directions.
          </p>
        ) : null}
      </form>
    </>
  )
}

function ComparePane({
  threadId,
  label,
  prompt,
  inheritedPreviewUrls,
  onKeep,
}: {
  threadId: string
  label: 'A' | 'B'
  prompt: string
  inheritedPreviewUrls: Array<string>
  onKeep: () => void
}) {
  const {
    messages,
    sendMessage,
    isLoading,
    error: chatError,
  } = useChat({
    threadId,
    connection,
    persistence: true,
  })
  const preview = useMemo(
    () => latestPreview(messages, new Set(inheritedPreviewUrls)),
    [inheritedPreviewUrls, messages],
  )
  const expected = variantPrompt(prompt, label)
  const [waitedForHydrate, setWaitedForHydrate] = useState(false)
  const sentVariant = useRef(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setWaitedForHydrate(true), 3000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (sentVariant.current) return
    if (hasUserText(messages, expected)) {
      sentVariant.current = true
      return
    }
    if (messages.length === 0 && !waitedForHydrate) return
    sentVariant.current = true
    void sendMessage(expected)
  }, [expected, messages, sendMessage, waitedForHydrate])

  return (
    <div className="min-h-0 flex flex-col border-t lg:border-t-0 lg:border-l border-gray-800 first:border-l-0">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <h2 className="text-sm font-medium">Variant {label}</h2>
        <button
          type="button"
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          onClick={onKeep}
          disabled={isLoading}
        >
          Keep variant {label}
        </button>
      </div>
      {chatError ? (
        <p
          role="alert"
          className="mx-3 mt-2 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200"
        >
          {chatError.message}
        </p>
      ) : null}
      <div className="flex-1 min-h-0 grid grid-rows-2">
        <MessageList messages={messages} isLoading={isLoading} />
        <PreviewFrame url={preview} />
      </div>
    </div>
  )
}

function MessageList({
  messages,
  isLoading,
}: {
  messages: Array<UIMessage>
  isLoading: boolean
}) {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    node?.scrollTo({ top: node.scrollHeight })
  }, [messages, node])

  return (
    <div ref={setNode} className="overflow-y-auto p-3 text-sm space-y-3">
      {messages.map((message) => (
        <div key={message.id} className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            {message.role}
          </div>
          {message.parts.map((part, index) => {
            const key = `${message.id}-${index}`
            if (part.type === 'text' && part.content) {
              return (
                <div key={key} className="prose prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
                  >
                    {part.content}
                  </ReactMarkdown>
                </div>
              )
            }
            if (part.type === 'tool-call') {
              return (
                <div
                  key={key}
                  className="rounded-md bg-gray-900 px-2 py-1 font-mono text-xs text-gray-400"
                >
                  {part.name}
                </div>
              )
            }
            return null
          })}
        </div>
      ))}
      {isLoading ? (
        <p role="status" className="text-cyan-300">
          The agent is working in the sandbox.
        </p>
      ) : null}
    </div>
  )
}

function PreviewFrame({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="border-t border-gray-800 bg-gray-900/50 p-4 text-sm text-gray-500">
        Preview appears here after the app is running.
      </div>
    )
  }
  return (
    <iframe
      title="App preview"
      src={url}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      className="h-full min-h-48 w-full border-t border-gray-800 bg-white"
    />
  )
}
