import { createFileRoute, Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertTriangle,
  Check,
  Image as ImageIcon,
  Loader2,
  Newspaper,
  PenLine,
  Sparkles,
  Square,
  Volume2,
  Wand2,
} from 'lucide-react'
import { EventType } from '@tanstack/ai'
import {
  forNarration,
  heroPromptFor,
  type BlogPost,
} from '../lib/blog-studio'
import {
  BLOG_STUDIO_PLAIN_EVENTS,
  createBlogPostStreamFn,
  regenerateBlogHeroFn,
  regenerateBlogNarrationFn,
  type BlogStudioStep,
} from '../lib/blog-studio-plain-server-fns'
import type { ImageGenerationResult, TTSResult } from '@tanstack/ai'
import type { FormEvent, ReactNode } from 'react'

export const Route = createFileRoute('/blog-studio-plain')({
  component: BlogStudioPlain,
})

type StepState = 'pending' | 'active' | 'done' | 'failed'

function imageUrlOf(result: ImageGenerationResult | null): string | null {
  const image = result?.images[0]
  if (!image) return null
  return (
    image.url ??
    (image.b64Json ? `data:image/png;base64,${image.b64Json}` : null)
  )
}

function audioSrcOf(result: TTSResult | null): string | null {
  if (!result) return null
  return `data:${result.contentType ?? 'audio/mpeg'};base64,${result.audio}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isBlogPost(value: unknown): value is BlogPost {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.subtitle === 'string' &&
    typeof value.body === 'string'
  )
}

function isImageResult(value: unknown): value is ImageGenerationResult {
  return isRecord(value) && Array.isArray(value.images)
}

function isTtsResult(value: unknown): value is TTSResult {
  return isRecord(value) && typeof value.audio === 'string'
}

/** Read `data: {…}\\n\\n` SSE from a Response (same format as toServerSentEventsResponse). */
async function* readSseJson(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<unknown> {
  if (!response.ok) {
    throw new Error(
      `HTTP error! status: ${response.status} ${response.statusText}`,
    )
  }
  const body = response.body
  if (!body) throw new Error('Response has no body')

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          yield JSON.parse(data) as unknown
        } catch {
          // skip malformed
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function BlogStudioPlain() {
  const abortRef = useRef<AbortController | null>(null)

  const [topic, setTopic] = useState('')
  const [hasRun, setHasRun] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [writingStep, setWritingStep] = useState<StepState>('pending')
  const [heroStep, setHeroStep] = useState<StepState>('pending')
  const [narrationStep, setNarrationStep] = useState<StepState>('pending')

  const [post, setPost] = useState<BlogPost | null>(null)
  const [hero, setHero] = useState<ImageGenerationResult | null>(null)
  const [audio, setAudio] = useState<TTSResult | null>(null)
  const [draftChars, setDraftChars] = useState(0)

  const [heroBusy, setHeroBusy] = useState(false)
  const [narrationBusy, setNarrationBusy] = useState(false)

  const imageUrl = imageUrlOf(hero)
  const audioSrc = audioSrcOf(audio)
  const showArticle = Boolean(post)

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setIsRunning(false)
    setHeroBusy(false)
    setNarrationBusy(false)
  }

  function resetPipeline() {
    setError(null)
    setPost(null)
    setHero(null)
    setAudio(null)
    setDraftChars(0)
    setWritingStep('pending')
    setHeroStep('pending')
    setNarrationStep('pending')
  }

  function applyStepEvent(value: unknown) {
    if (!isRecord(value) || typeof value.step !== 'string') return
    const step = value.step as BlogStudioStep
    const status = value.status
    const setStep =
      step === 'drafting'
        ? setWritingStep
        : step === 'heroImage'
          ? setHeroStep
          : step === 'narration'
            ? setNarrationStep
            : null
    if (!setStep) return

    if (status === 'started') {
      setStep('active')
      return
    }
    if (status === 'error') {
      setStep('failed')
      if (typeof value.error === 'string') setError(value.error)
      return
    }
    if (status === 'done') {
      setStep('done')
      if (step === 'drafting' && isBlogPost(value.result)) {
        setPost(value.result)
      } else if (step === 'heroImage' && isImageResult(value.result)) {
        setHero(value.result)
      } else if (step === 'narration' && isTtsResult(value.result)) {
        setAudio(value.result)
      }
    }
  }

  async function run(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const nextTopic = topic.trim()
    if (!nextTopic || isRunning) return

    stop()
    resetPipeline()
    setHasRun(true)
    setIsRunning(true)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      // Server function returns an SSE Response. One request: server chains
      // draft → (hero ∥ narration) and streams pipeline:step / pipeline:result
      // plus live structured-output deltas while drafting.
      const response = await createBlogPostStreamFn({
        data: { topic: nextTopic },
        signal: abort.signal,
      })

      if (!(response instanceof Response)) {
        throw new Error('Expected an SSE Response from createBlogPostStreamFn')
      }

      for await (const chunk of readSseJson(response, abort.signal)) {
        if (!isRecord(chunk) || typeof chunk.type !== 'string') continue

        if (chunk.type === EventType.RUN_ERROR) {
          const message =
            typeof chunk.message === 'string'
              ? chunk.message
              : 'Pipeline failed'
          if (message !== 'Aborted') setError(message)
          setWritingStep((s) => (s === 'done' ? s : 'failed'))
          setHeroStep((s) => (s === 'active' ? 'failed' : s))
          setNarrationStep((s) => (s === 'active' ? 'failed' : s))
          break
        }

        // Live draft JSON length while structured output streams.
        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
          const delta = chunk.delta
          if (typeof delta === 'string') {
            setDraftChars((n) => n + delta.length)
          }
        }

        if (chunk.type === EventType.CUSTOM) {
          if (chunk.name === BLOG_STUDIO_PLAIN_EVENTS.STEP) {
            applyStepEvent(chunk.value)
          } else if (
            chunk.name === BLOG_STUDIO_PLAIN_EVENTS.RESULT &&
            isRecord(chunk.value)
          ) {
            if (isBlogPost(chunk.value.post)) setPost(chunk.value.post)
            if (isImageResult(chunk.value.hero)) setHero(chunk.value.hero)
            if (isTtsResult(chunk.value.audio)) setAudio(chunk.value.audio)
            setWritingStep('done')
            setHeroStep((s) => (s === 'failed' ? s : 'done'))
            setNarrationStep((s) => (s === 'failed' ? s : 'done'))
          }
        }
      }
    } catch (err) {
      if (abort.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Pipeline failed')
      setWritingStep((s) => (s === 'done' ? s : 'failed'))
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null
        setIsRunning(false)
      }
    }
  }

  async function regenerateHero() {
    if (!post || isRunning || heroBusy) return
    setHeroBusy(true)
    setHeroStep('active')
    setError(null)
    try {
      const result = await regenerateBlogHeroFn({
        data: { prompt: heroPromptFor(post) },
      })
      setHero(result)
      setHeroStep('done')
    } catch (err) {
      setHeroStep('failed')
      setError(err instanceof Error ? err.message : 'Hero regenerate failed')
    } finally {
      setHeroBusy(false)
    }
  }

  async function regenerateNarration() {
    if (!post || isRunning || narrationBusy) return
    setNarrationBusy(true)
    setNarrationStep('active')
    setError(null)
    try {
      const result = await regenerateBlogNarrationFn({
        data: { text: forNarration(post.body) },
      })
      setAudio(result)
      setNarrationStep('done')
    } catch (err) {
      setNarrationStep('failed')
      setError(
        err instanceof Error ? err.message : 'Narration regenerate failed',
      )
    } finally {
      setNarrationBusy(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gradient-to-b from-stone-50 to-sky-50 text-stone-800 md:flex-row">
      <aside className="w-full shrink-0 border-b border-stone-200 bg-white/70 p-6 md:w-96 md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="mb-2 flex items-center gap-2 text-sky-700">
          <Newspaper size={20} />
          <span className="text-sm font-semibold uppercase tracking-wider">
            Blog Studio (plain)
          </span>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-stone-900">
          Server-composed, streaming
        </h1>
        <p className="mb-3 text-stone-500">
          One{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">
            createServerFn
          </code>{' '}
          chains draft → (hero ∥ narration) on the server and streams step
          progress over SSE (
          <code className="rounded bg-stone-100 px-1 text-xs">
            pipeline:step
          </code>
          , live draft deltas, then{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">
            pipeline:result
          </code>
          ). No transaction layer.
        </p>
        <p className="mb-5 text-xs text-stone-400">
          Compare with the{' '}
          <Link
            to="/blog-studio"
            className="font-medium text-sky-700 underline underline-offset-2"
          >
            transaction version
          </Link>
          : verb registry, typed client, demuxed sub-runs.
        </p>

        <form onSubmit={(e) => void run(e)}>
          <label
            htmlFor="blog-topic-plain"
            className="mb-1 block text-sm font-medium text-stone-600"
          >
            Topic
          </label>
          <input
            id="blog-topic-plain"
            name="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. The quiet comeback of urban foxes"
            disabled={isRunning}
            className="mb-3 w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:opacity-60"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isRunning}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-3 font-medium text-white shadow-sm transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRunning ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Wand2 size={18} />
              )}
              {isRunning ? 'Working…' : 'Write the post'}
            </button>
            {isRunning && (
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
              >
                <Square size={16} />
                Stop
              </button>
            )}
          </div>
        </form>

        {hasRun && (
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <StepRow
              label="Writing the post"
              icon={<PenLine size={16} />}
              state={writingStep}
              detail={
                writingStep === 'active' && draftChars > 0
                  ? `${draftChars} chars drafted`
                  : undefined
              }
            />
            <StepRow
              label="Illustrating"
              icon={<ImageIcon size={16} />}
              state={heroStep}
            />
            <StepRow
              label="Recording voice-over"
              icon={<Volume2 size={16} />}
              state={narrationStep}
            />
          </div>
        )}

        {post && (
          <div className="mt-5 flex flex-col gap-2 border-t border-stone-200 pt-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Touch up
            </span>
            <button
              type="button"
              disabled={isRunning || heroBusy}
              onClick={() => void regenerateHero()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {heroBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ImageIcon size={16} />
              )}
              Regenerate hero image
            </button>
            <button
              type="button"
              disabled={isRunning || narrationBusy}
              onClick={() => void regenerateNarration()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {narrationBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Volume2 size={16} />
              )}
              Re-narrate
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {showArticle && post ? (
          <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl shadow-stone-200/60">
            <div className="relative aspect-[3/2] w-full bg-stone-100">
              {imageUrl && !heroBusy && heroStep !== 'active' ? (
                <img
                  src={imageUrl}
                  alt={post.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  {heroBusy || heroStep === 'active' ? (
                    <div className="flex flex-col items-center gap-2 text-stone-400">
                      <Loader2 size={28} className="animate-spin" />
                      <span className="text-sm">Illustrating…</span>
                    </div>
                  ) : heroStep === 'failed' ? (
                    <div className="flex flex-col items-center gap-2 text-stone-400">
                      <AlertTriangle size={28} className="text-amber-500" />
                      <span className="text-sm">
                        Couldn&apos;t generate a hero image
                      </span>
                    </div>
                  ) : (
                    <ImageIcon size={40} className="text-stone-300" />
                  )}
                </div>
              )}
            </div>

            <div className="px-8 py-8">
              <h1 className="mb-3 text-4xl font-extrabold leading-tight tracking-tight text-stone-900">
                {post.title}
              </h1>
              {post.subtitle && (
                <p className="mb-6 text-xl text-stone-500">{post.subtitle}</p>
              )}

              <div className="mb-6 flex items-center gap-3 border-y border-stone-100 py-3 text-sm text-stone-500">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                  <Sparkles size={16} />
                </div>
                <span>Written &amp; narrated by TanStack AI</span>
                {narrationBusy || narrationStep === 'active' ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <Loader2 size={14} className="animate-spin" /> Recording
                    voice-over…
                  </span>
                ) : audioSrc ? (
                  <div className="ml-auto flex items-center gap-2">
                    <Volume2 size={16} className="text-sky-700" />
                    <audio src={audioSrc} controls className="h-8" />
                  </div>
                ) : narrationStep === 'failed' ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <AlertTriangle size={14} className="text-amber-500" />
                    Voice-over unavailable
                  </span>
                ) : null}
              </div>

              <div className="text-[1.05rem] leading-8 text-stone-800 [&_a]:text-sky-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-sky-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-stone-600 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-stone-900 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_strong]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {post.body}
                </ReactMarkdown>
              </div>
            </div>
          </article>
        ) : isRunning ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center text-stone-400">
              <Loader2 size={40} className="animate-spin text-sky-500" />
              <p className="max-w-xs text-sm">
                {writingStep === 'active'
                  ? draftChars > 0
                    ? `Drafting… ${draftChars} characters so far.`
                    : 'Drafting the article…'
                  : 'Illustrating and recording voice-over…'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center text-stone-400">
              <Newspaper size={48} className="text-stone-300" />
              <p className="max-w-xs text-sm">
                Your finished post streams in step-by-step from a single server
                function.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function StepRow({
  label,
  icon,
  state,
  detail,
}: {
  label: string
  icon: ReactNode
  state: StepState
  detail?: string
}) {
  const cls =
    state === 'active'
      ? 'text-sky-700 font-medium'
      : state === 'done'
        ? 'text-stone-500'
        : state === 'failed'
          ? 'text-amber-600'
          : 'text-stone-300'
  return (
    <span className={`flex items-center gap-2 ${cls}`}>
      {state === 'active' ? (
        <Loader2 size={16} className="animate-spin" />
      ) : state === 'done' ? (
        <Check size={16} />
      ) : state === 'failed' ? (
        <AlertTriangle size={16} />
      ) : (
        icon
      )}
      {label}
      {detail && (
        <span className="ml-auto text-xs tabular-nums text-stone-400">
          {detail}
        </span>
      )}
    </span>
  )
}
