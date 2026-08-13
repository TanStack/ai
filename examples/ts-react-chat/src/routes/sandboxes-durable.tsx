import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangle,
  FileText,
  Github,
  Play,
  Server,
  Square,
  Terminal,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import {
  GROK_MODEL_OPTIONS,
  GROK_PROTOCOL_OPTIONS,
  GROK_TRANSPORT_OPTIONS,
  HARNESSES,
  PROVIDERS,
  isGrokModel,
  isGrokProtocol,
  isGrokTransport,
  parseVerdict,
} from '../sandbox-triage-options'
import type {
  GrokBuildModel,
  GrokBuildProtocol,
  GrokTransport,
  HarnessName,
  ProviderName,
  Verdict,
} from '../sandbox-triage-options'
import type { UIMessage } from '@tanstack/ai-react'

export const Route = createFileRoute('/sandboxes-durable')({
  component: SandboxesPage,
})

/**
 * The thread INDEX (which threads exist, and their titles) is small app state and
 * lives in localStorage. The transcripts themselves live on the SERVER, one per
 * thread id — this list is only how the UI enumerates and labels them. Same split
 * as `/persistent-chat`.
 *
 * A stable id per thread is not cosmetic here: it is the whole mechanism. The
 * server stores the run and transcript under it, and `useChat` hydrates by it on
 * mount. `/sandboxes` mints a fresh uuid per mount, which is correct there (each
 * visit is a one-off triage) and would make durability untestable here.
 */
const THREADS_KEY = 'sandboxes-durable:threads'

interface Thread {
  id: string
  title: string
}

function loadThreads(): Array<Thread> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(THREADS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed as Array<Thread>) : []
  } catch {
    return []
  }
}

function newThread(): Thread {
  return { id: `thread-${crypto.randomUUID()}`, title: 'New triage' }
}

/**
 * One connection instance for every thread. `useChat` keys both the hydration GET
 * (`?threadId`) and the run itself on the thread id, so switching threads reuses
 * this without rebuilding it.
 */
const connection = fetchServerSentEvents('/api/sandbox-triage-durable')

/** Per-thread run state, as the sidebar shows it. */
interface ThreadStatus {
  status: 'running' | 'idle' | 'unknown'
  detached?: boolean
}

/**
 * Poll per-thread run status for the sidebar.
 *
 * Server-owned on purpose: a run keeps going while nobody watches, so the only
 * truthful source for "is this thread busy?" is the run store — never client
 * state, which by definition knows nothing about the threads you are not looking
 * at. One request covers every thread (`?statuses=a,b,c`).
 */
/** Cadence while at least one run is going. */
const STATUS_POLL_ACTIVE_MS = 2500
/** Cadence when every thread is idle — the usual case, so keep it cheap. */
const STATUS_POLL_IDLE_MS = 30_000

function useThreadStatuses(ids: Array<string>): Record<string, ThreadStatus> {
  const [statuses, setStatuses] = useState<Record<string, ThreadStatus>>({})
  // Join into a primitive so the effect re-runs when the SET changes, not on
  // every render (a new array identity each time would poll in a loop).
  const key = ids.join(',')
  // Read inside the loop so the cadence can change without tearing the loop down
  // and restarting it.
  const anyRunningRef = useRef(false)

  useEffect(() => {
    if (key === '') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/sandbox-triage-durable?statuses=${encodeURIComponent(key)}`,
          { signal: controller.signal },
        )
        if (!res.ok) return
        const json: unknown = await res.json()
        if (cancelled || json === null || typeof json !== 'object') return
        const next = json as Record<string, ThreadStatus>
        setStatuses(next)
        anyRunningRef.current = Object.values(next).some(
          (s) => s.status === 'running',
        )
      } catch {
        // A failed poll leaves the previous chips in place — a transient blip
        // must not make every thread flash to "unknown".
      } finally {
        // SELF-SCHEDULING, and only after the previous poll settled. Two reasons,
        // both seen in a real session with 16 threads in this list:
        //
        // 1. A fixed `setInterval` kept firing while everything was idle and every
        //    run had finished — one request every 2.5s forever, each making the
        //    server run one `findActiveRun` per thread. It backs right off now.
        // 2. `setInterval` does not wait for the previous request. When the page
        //    was short of connections the polls STACKED, which is what made the
        //    network tab look like a flood of the same URL. Scheduling from
        //    `finally` means at most one poll is ever in flight.
        if (!cancelled) {
          timer = setTimeout(
            () => void poll(),
            anyRunningRef.current ? STATUS_POLL_ACTIVE_MS : STATUS_POLL_IDLE_MS,
          )
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [key])

  return statuses
}

function StatusDot({ status }: { status: ThreadStatus | undefined }) {
  if (status?.status === 'running') {
    return (
      <span
        title={
          status.detached ? 'running (detached — nobody attached)' : 'running'
        }
        className={`inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400 ${
          status.detached ? '' : 'animate-pulse'
        }`}
      />
    )
  }
  return (
    <span
      title={status?.status === 'unknown' ? 'status unavailable' : 'idle'}
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-slate-600"
    />
  )
}

// ---------------------------------------------------------------------------
// VerdictChip
// ---------------------------------------------------------------------------

const VERDICT_STYLES: Record<Verdict, { label: string; cls: string }> = {
  relevant: {
    label: 'Relevant',
    cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  'not-relevant': {
    label: 'Not relevant',
    cls: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
  },
  uncertain: {
    label: 'Uncertain',
    cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
}

function VerdictChip({ verdict }: { verdict: Verdict }) {
  const s = VERDICT_STYLES[verdict]
  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// FileEventsStrip — fed by the file.changed custom event (git diff string)
// ---------------------------------------------------------------------------

interface FileChangedEvent {
  path: string
  diff: string
}

function FileEventsStrip({ events }: { events: Array<FileChangedEvent> }) {
  if (events.length === 0) return null
  return (
    <div className="border-t border-indigo-500/10 bg-gray-900/60 px-4 py-2 text-xs font-mono text-gray-400">
      <div className="mb-1 flex items-center gap-1 text-indigo-300">
        <FileText className="w-3 h-3" /> changed files
      </div>
      {events.map((e, i) => (
        <div key={`${e.path}-${i}`} className="mt-1">
          <div className="text-indigo-200 mb-0.5">{e.path}</div>
          <pre className="overflow-x-auto max-h-40 overflow-y-auto whitespace-pre text-gray-400 bg-gray-800/50 rounded p-2">
            {e.diff}
          </pre>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CodeModeStrip — live log from code-mode (execute_typescript) custom events,
// bridged back from inside the sandbox via the tool bridge.
// ---------------------------------------------------------------------------

interface CodeModeLine {
  kind: 'start' | 'console'
  level?: string
  text: string
}

const LEVEL_CLS: Record<string, string> = {
  error: 'text-red-300',
  warn: 'text-amber-300',
  info: 'text-sky-300',
  log: 'text-gray-300',
}

function CodeModeStrip({ lines }: { lines: Array<CodeModeLine> }) {
  if (lines.length === 0) return null
  return (
    <div className="border-t border-violet-500/10 bg-gray-900/60 px-4 py-2 text-xs font-mono">
      <div className="mb-1 flex items-center gap-1 text-violet-300">
        <Terminal className="w-3 h-3" /> code mode
      </div>
      <pre className="overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap bg-gray-800/50 rounded p-2">
        {lines.map((line, i) =>
          line.kind === 'start' ? (
            <div key={i} className="text-violet-200">
              ▶ {line.text}
            </div>
          ) : (
            <div
              key={i}
              className={LEVEL_CLS[line.level ?? 'log'] ?? 'text-gray-300'}
            >
              {line.text}
            </div>
          ),
        )}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ToolCall — copied verbatim from sandbox-web/src/routes/index.tsx
// ---------------------------------------------------------------------------

function ToolCall({
  name,
  args,
  output,
}: {
  name: string
  args: string
  output?: unknown
}) {
  let parsedArgs: unknown = args
  try {
    parsedArgs = JSON.parse(args)
  } catch {
    // leave as the raw string
  }
  const running = output === undefined
  return (
    <div className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-900/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-900/20 text-indigo-300 text-sm">
        {running ? (
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-4 h-4 rounded-full bg-indigo-500/50" />
        )}
        <span className="font-mono font-medium">{name}</span>
      </div>
      <pre className="px-3 py-2 text-xs text-gray-300 overflow-x-auto max-h-40 overflow-y-auto">
        {typeof parsedArgs === 'string'
          ? parsedArgs
          : JSON.stringify(parsedArgs, null, 2)}
      </pre>
      {output !== undefined && (
        <pre className="px-3 pb-3 text-xs text-gray-400 border-t border-indigo-500/20 overflow-x-auto max-h-40 overflow-y-auto">
          {typeof output === 'string'
            ? output
            : JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SandboxWaiting — aligned with sandbox-web/src/routes/index.tsx
// ---------------------------------------------------------------------------

type SandboxWaitKind = 'boot' | 'continue'

function SandboxWaiting({ kind }: { kind: SandboxWaitKind }) {
  const headline = kind === 'boot' ? 'Starting sandbox…' : 'Agent is working…'
  const detail =
    kind === 'boot'
      ? 'starting the sandbox container and coding agent. The first message takes a moment.'
      : 'resuming the sandbox and continuing the conversation.'
  return (
    <div className="p-4">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-linear-to-r from-indigo-500 to-violet-600 shrink-0">
          <Server className="w-4 h-4 text-white" />
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-indigo-500/30 bg-indigo-900/10 px-4 py-3">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">
            <span className="font-medium text-indigo-200">{headline}</span>{' '}
            <span className="text-gray-400">{detail}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * `isLoading` alone cannot answer this after a tab switch.
 *
 * A sandboxed run spends its first minutes inside `withSandbox`'s `ensure` —
 * creating the sandbox, cloning the repo — and emits NOTHING until that finishes.
 * A client returning in that window hydrates the transcript (which ends with the
 * user's message) but has no stream to be "loading" from, so `isLoading` is false
 * and the pane rendered empty: the run looked lost even though it was healthy and
 * still working.
 *
 * `hasActiveRun` is the server's answer to the same question — `findActiveRun` on
 * the run record — so the waiting state survives leaving and re-entering the
 * thread. Either signal is sufficient: `isLoading` covers the tab that started the
 * run, `hasActiveRun` covers every tab that comes back to it.
 */
export function sandboxWaitKind(
  isLoading: boolean,
  hasActiveRun: boolean,
  messages: Array<UIMessage>,
): SandboxWaitKind | false {
  // "Nothing has come back for the current turn yet." An EMPTY transcript counts,
  // and that is the case this used to get wrong: chat persistence saves the pending
  // user turn from `onStart`, which — like the run record — runs after every
  // middleware `setup`, so throughout the minutes a sandbox takes to build the
  // hydration response is literally `{ messages: [], activeRun: { runId } }`.
  // Requiring a message therefore hid the waiting state for exactly the window it
  // exists to cover, and a returning tab rendered an empty pane.
  const nothingYet =
    messages.length === 0 || messages[messages.length - 1].role === 'user'
  if (!nothingYet) return false
  // `isLoading` covers the tab that started the run; `hasActiveRun` (the server's
  // `findActiveRun`) covers every tab that comes back to it.
  if (!isLoading && !hasActiveRun) return false
  return messages.some((m) => m.role === 'assistant') ? 'continue' : 'boot'
}

// ---------------------------------------------------------------------------
// Messages — adapted from sandbox-web/src/routes/index.tsx:
//   - drops exposePreview / PreviewLink branch
//   - computes verdict per assistant message and renders VerdictChip
// ---------------------------------------------------------------------------

function Messages({
  messages,
  waiting,
}: {
  messages: Array<UIMessage>
  waiting: SandboxWaitKind | false
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, waiting])

  if (!messages.length) {
    // A run can be in flight with NO messages: chat persistence saves the pending
    // user turn from `onStart`, which runs after every middleware `setup`, so for
    // the minutes a sandbox takes to build the hydration response is
    // `{ messages: [], activeRun: { runId } }`. Returning the empty-state hint here
    // unconditionally made the waiting panel unreachable in exactly that window —
    // a tab coming back to a healthy, still-booting run was told to start one.
    if (waiting) return <SandboxWaiting kind={waiting} />
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center text-gray-500">
        <p className="max-w-md">
          Pick a harness and provider, paste a GitHub issue URL, and click
          Triage — the agent clones the repo into a sandbox and investigates
          read-only, streaming tool calls live.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
      style={{ scrollbarWidth: 'thin' }}
    >
      {messages.map((message) => {
        const results = new Map<string, string>()
        for (const part of message.parts) {
          if (part.type === 'tool-result') {
            results.set(
              part.toolCallId,
              typeof part.content === 'string'
                ? part.content
                : JSON.stringify(part.content),
            )
          }
        }

        // Compute verdict for assistant messages by joining all text parts.
        const verdict =
          message.role === 'assistant'
            ? parseVerdict(
                message.parts
                  .flatMap((p) => (p.type === 'text' ? [p.content] : []))
                  .join('\n'),
              )
            : null

        return (
          <div
            key={message.id}
            className={`p-4 rounded-lg mb-2 ${
              message.role === 'assistant'
                ? 'bg-linear-to-r from-indigo-500/5 to-violet-600/5'
                : 'bg-transparent'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium text-white shrink-0 ${
                  message.role === 'assistant'
                    ? 'bg-linear-to-r from-indigo-500 to-violet-600'
                    : 'bg-gray-700'
                }`}
              >
                {message.role === 'assistant' ? 'AI' : 'U'}
              </div>
              <div className="flex-1 min-w-0">
                {verdict && (
                  <div className="mb-2">
                    <VerdictChip verdict={verdict} />
                  </div>
                )}
                {message.parts.map((part, index) => {
                  if (part.type === 'text' && part.content) {
                    return (
                      <div key={`text-${index}`} className="markdown-content">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[
                            rehypeRaw,
                            rehypeSanitize,
                            rehypeHighlight,
                          ]}
                        >
                          {part.content}
                        </ReactMarkdown>
                      </div>
                    )
                  }
                  if (part.type === 'tool-call') {
                    const resultContent = results.get(part.id)
                    const output = part.output ?? resultContent
                    return (
                      <ToolCall
                        key={part.id}
                        name={part.name}
                        args={part.arguments}
                        output={output}
                      />
                    )
                  }
                  return null
                })}
              </div>
            </div>
          </div>
        )
      })}
      {waiting && <SandboxWaiting kind={waiting} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SandboxesPage
// ---------------------------------------------------------------------------

/**
 * Thread list + the active thread's pane. ChatGPT-shaped on purpose: the point of
 * durable runs is that a conversation outlives the tab, which is only observable
 * if you can leave a thread and come back to it.
 */
function SandboxesPage() {
  const [threads, setThreads] = useState<Array<Thread>>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // localStorage is unavailable during SSR, so the first render is empty on both
  // sides (no hydration mismatch) and the index loads in an effect.
  useEffect(() => {
    const loaded = loadThreads()
    if (loaded.length === 0) {
      const first = newThread()
      setThreads([first])
      setActiveId(first.id)
    } else {
      setThreads(loaded)
      setActiveId(loaded[0]!.id)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(THREADS_KEY, JSON.stringify(threads))
  }, [threads, hydrated])

  // Server-owned run state for every thread in the list, not just the open one.
  const statuses = useThreadStatuses(threads.map((t) => t.id))

  const createThread = () => {
    const thread = newThread()
    setThreads((prev) => [thread, ...prev])
    setActiveId(thread.id)
  }

  // Label a thread by the issue it triaged, so the sidebar is readable. A no-op
  // once the thread has a real title, so it never churns state.
  const titleThread = (id: string, title: string) => {
    setThreads((prev) => {
      const current = prev.find((t) => t.id === id)
      if (!current || current.title !== 'New triage') return prev
      return prev.map((t) => (t.id === id ? { ...t, title } : t))
    })
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-64 shrink-0 flex-col gap-2 border-r border-slate-800 p-3">
        <button
          type="button"
          onClick={createThread}
          className="rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500"
        >
          + New triage
        </button>
        <div className="flex flex-col gap-1 overflow-y-auto">
          {threads.map((thread) => {
            const status = statuses[thread.id]
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => setActiveId(thread.id)}
                title={thread.id}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  thread.id === activeId
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                <StatusDot status={status} />
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                {status?.status === 'running' ? (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-emerald-400">
                    {status.detached ? 'detached' : 'running'}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <p className="mt-auto text-[11px] leading-snug text-slate-500">
          Transcripts live on the server, one per thread id. This list is just
          the index. Start a run, then refresh or switch threads and come back —
          the run keeps going and you rejoin it mid-stream.
        </p>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {activeId ? (
          // Keyed by threadId: a fresh instance mounts per thread and hydrates
          // that thread from the server. Nothing to wire beyond the id.
          <TriagePane
            key={activeId}
            threadId={activeId}
            // The same server-owned status the sidebar dot uses. Passed down so a
            // thread re-entered while its sandbox is still booting shows the
            // waiting state instead of an empty pane — the run emits nothing until
            // `ensure` finishes, so the client cannot infer it from the stream.
            hasActiveRun={statuses[activeId]?.status === 'running'}
            onIssue={(title) => titleThread(activeId, title)}
          />
        ) : null}
      </div>
    </div>
  )
}

function TriagePane({
  threadId,
  hasActiveRun,
  onIssue,
}: {
  threadId: string
  hasActiveRun: boolean
  onIssue: (title: string) => void
}) {
  const [harness, setHarness] = useState<HarnessName>('grok')
  const [provider, setProvider] = useState<ProviderName>('docker')
  const [issueUrl, setIssueUrl] = useState(
    'https://github.com/TanStack/ai/issues/859',
  )
  const [fileEvents, setFileEvents] = useState<Array<FileChangedEvent>>([])
  const [codeModeLines, setCodeModeLines] = useState<Array<CodeModeLine>>([])
  const [keepAlive, setKeepAlive] = useState(false)
  const [useSubscription, setUseSubscription] = useState(false)
  const [grokModel, setGrokModel] = useState<GrokBuildModel>('composer-2.5')
  const [grokProtocol, setGrokProtocol] = useState<GrokBuildProtocol>('acp')
  const [grokTransport, setGrokTransport] = useState<GrokTransport>('auto')

  // Subscription auth only applies to Claude Code on the local-process provider.
  const canUseSubscription = provider === 'local' && harness === 'claude-code'

  const { messages, sendMessage, isLoading, stop, error } = useChat({
    // TOP-LEVEL, not just in `body`. This is the id `useChat` hydrates by and the
    // id the server stores the run and transcript under. Passing it only inside
    // `body` (as `/sandboxes` does, where nothing rejoins) leaves the client
    // hydrating a different, auto-generated thread than the one the server wrote
    // — so a refresh finds nothing and the conversation looks wiped.
    threadId,
    connection,
    // Server-authoritative: keep no transcript and no run pointer client-side.
    // On mount `useChat` calls the route's GET itself (keyed by threadId), gets
    // the stored transcript plus a cursor to any in-flight run, and tails that
    // run through the replay branch. This flag plus a stable `threadId` is the
    // whole of what makes a refresh resume.
    persistence: true,
    body: {
      harness,
      provider,
      issueUrl,
      keepAlive,
      useSubscription: canUseSubscription && useSubscription,
      ...(harness === 'grok' ? { grokModel, grokProtocol, grokTransport } : {}),
    },
    onCustomEvent: (eventType, data) => {
      if (data === null || typeof data !== 'object') return
      if (
        eventType === 'file.changed' &&
        'diff' in data &&
        typeof data.diff === 'string'
      ) {
        const diff = data.diff
        const path =
          'path' in data && typeof data.path === 'string' ? data.path : '.'
        setFileEvents((prev) => [...prev, { path, diff }])
        return
      }
      // Code-mode progress, bridged from inside the sandbox.
      if (eventType === 'code_mode:execution_started') {
        const chars =
          'codeLength' in data && typeof data.codeLength === 'number'
            ? ` (${data.codeLength} chars)`
            : ''
        setCodeModeLines((prev) => [
          ...prev,
          { kind: 'start', text: `executing TypeScript${chars}…` },
        ])
        return
      }
      if (eventType === 'code_mode:console') {
        const level =
          'level' in data && typeof data.level === 'string' ? data.level : 'log'
        const message =
          'message' in data && typeof data.message === 'string'
            ? data.message
            : JSON.stringify(data)
        setCodeModeLines((prev) => [
          ...prev,
          { kind: 'console', level, text: message },
        ])
      }
    },
  })

  // Live elapsed timer while a run is in flight — makes a long, quiet step
  // (e.g. a code-mode execution) visibly "still running", not hung.
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isLoading) return
    const startedAt = Date.now()
    setElapsed(0)
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    )
    return () => clearInterval(id)
  }, [isLoading])

  const canRun = useMemo(
    () => /\/issues\/\d+/.test(issueUrl) && !isLoading,
    [issueUrl, isLoading],
  )

  // A run finished (not loading, no error) but the last message is still the
  // user's — the agent streamed no assistant content. Surfaces the otherwise
  // invisible "completed with zero output" case.
  const noOutput = !isLoading && !error && messages.at(-1)?.role === 'user'

  function run() {
    if (!canRun) return
    setFileEvents([])
    setCodeModeLines([])
    // Label the thread by what it triaged (`TanStack/ai#859`), so the sidebar
    // reads like a conversation list rather than a column of uuids.
    const match = /github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/.exec(issueUrl)
    onIssue(match ? `${match[1]}#${match[2]}` : issueUrl)
    sendMessage(`Triage ${issueUrl}`)
  }

  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    // `min-h-full`, not `h-screen`: this pane now lives inside the page's own
    // full-height flex shell, and a second viewport-height box would scroll twice.
    <div className="flex min-h-full flex-col bg-gray-900 text-white">
      <header className="flex items-center gap-3 border-b border-indigo-500/10 bg-gray-900/80 px-4 py-3 backdrop-blur-sm">
        <Github className="w-5 h-5 text-indigo-400" />
        <span className="font-semibold">Sandbox Issue Triage</span>
        <span className="text-xs text-gray-500">
          clone a repo · investigate · root-cause
        </span>
      </header>

      <div className="border-b border-indigo-500/10 bg-gray-900/60 px-4 py-3 flex flex-wrap items-center gap-3">
        <select
          value={harness}
          onChange={(e) => setHarness(e.target.value as HarnessName)}
          disabled={isLoading}
          className="rounded-lg border border-indigo-500/20 bg-gray-800 px-3 py-2 text-sm"
        >
          {Object.entries(HARNESSES).map(([name, spec]) => (
            <option key={name} value={name}>
              {spec.label}
            </option>
          ))}
        </select>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as ProviderName)}
          disabled={isLoading}
          className="rounded-lg border border-indigo-500/20 bg-gray-800 px-3 py-2 text-sm"
        >
          {Object.entries(PROVIDERS).map(([name, spec]) => (
            <option key={name} value={name}>
              {spec.label}
            </option>
          ))}
        </select>
        {harness === 'grok' && (
          <>
            <select
              value={grokModel}
              onChange={(e) => {
                if (isGrokModel(e.target.value)) {
                  setGrokModel(e.target.value)
                }
              }}
              disabled={isLoading}
              title="Grok Build model"
              className="rounded-lg border border-indigo-500/20 bg-gray-800 px-3 py-2 text-sm"
            >
              {GROK_MODEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={grokProtocol}
              onChange={(e) => {
                if (isGrokProtocol(e.target.value)) {
                  setGrokProtocol(e.target.value)
                }
              }}
              disabled={isLoading}
              title="Grok Build wire protocol"
              className="rounded-lg border border-indigo-500/20 bg-gray-800 px-3 py-2 text-sm"
            >
              {GROK_PROTOCOL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {grokProtocol === 'acp' && (
              <select
                value={grokTransport}
                onChange={(e) => {
                  if (isGrokTransport(e.target.value)) {
                    setGrokTransport(e.target.value)
                  }
                }}
                disabled={isLoading}
                title="ACP transport (auto picks stdio vs WebSocket)"
                className="rounded-lg border border-indigo-500/20 bg-gray-800 px-3 py-2 text-sm"
              >
                {GROK_TRANSPORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        <input
          value={issueUrl}
          onChange={(e) => setIssueUrl(e.target.value)}
          disabled={isLoading}
          placeholder="https://github.com/owner/repo/issues/123"
          className="flex-1 min-w-[18rem] rounded-lg border border-indigo-500/20 bg-gray-800 px-3 py-2 text-sm placeholder-gray-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter') run()
          }}
        />
        <label
          className="flex items-center gap-1.5 text-xs text-gray-400 select-none"
          title="By default the sandbox is destroyed after the run (success, error, or stop). Check to keep it alive."
        >
          <input
            type="checkbox"
            checked={keepAlive}
            onChange={(e) => setKeepAlive(e.target.checked)}
            disabled={isLoading}
          />
          keep sandbox
        </label>
        <label
          className={`flex items-center gap-1.5 text-xs select-none ${
            canUseSubscription ? 'text-gray-400' : 'text-gray-600'
          }`}
          title={
            canUseSubscription
              ? 'Use your logged-in Claude Code subscription instead of the API key (no API billing). Requires `claude login` on the host.'
              : 'Only available for Claude Code on the Local process provider.'
          }
        >
          <input
            type="checkbox"
            checked={canUseSubscription && useSubscription}
            onChange={(e) => setUseSubscription(e.target.checked)}
            disabled={isLoading || !canUseSubscription}
          />
          use my subscription
        </label>
        {isLoading ? (
          <button
            onClick={stop}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-700"
          >
            <Square className="w-4 h-4 fill-current" /> Stop
            <span className="font-mono tabular-nums text-red-100/80">
              {elapsedLabel}
            </span>
          </button>
        ) : (
          <button
            onClick={run}
            disabled={!canRun}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> Triage
          </button>
        )}
      </div>

      {error && (
        <div className="mx-auto mt-3 flex max-w-4xl w-full items-start gap-2 rounded-lg border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="min-w-0">
            <div className="font-medium text-red-300">Run failed</div>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-red-200/90">
              {error.message}
            </pre>
          </div>
        </div>
      )}
      {noOutput && (
        <div className="mx-auto mt-3 flex max-w-4xl w-full items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>
            The run finished but the agent produced no output. Check the dev
            server logs for details (e.g. a sandbox or CLI error).
          </span>
        </div>
      )}

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full overflow-hidden">
        <Messages
          messages={messages}
          waiting={sandboxWaitKind(isLoading, hasActiveRun, messages)}
        />
      </div>
      <CodeModeStrip lines={codeModeLines} />
      <FileEventsStrip events={fileEvents} />
    </div>
  )
}
