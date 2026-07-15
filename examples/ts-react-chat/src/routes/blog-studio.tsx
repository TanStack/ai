import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
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
import { blogTxnDef, forNarration, heroPromptFor } from '../lib/blog-studio'
import type { ImageGenerationResult, TTSResult } from '@tanstack/ai'
import type { FormEvent, ReactNode } from 'react'

export const Route = createFileRoute('/blog-studio')({
  component: BlogStudio,
})

type StepState = 'pending' | 'active' | 'done' | 'failed'

// Map a live sub-run's status onto a step state. `undefined` means the
// server hasn't started that sub-run yet.
function subRunToStep(
  status: 'running' | 'success' | 'error' | undefined,
): StepState {
  return status === 'running'
    ? 'active'
    : status === 'success'
      ? 'done'
      : status === 'error'
        ? 'failed'
        : 'pending'
}

// The image result carries either a URL or base64 data, provider-dependent.
function imageUrlOf(result: ImageGenerationResult | null): string | null {
  const image = result?.images[0]
  if (!image) return null
  return (
    image.url ??
    (image.b64Json ? `data:image/png;base64,${image.b64Json}` : null)
  )
}

// The TTS result is base64 audio + a content type → a ready-to-play data URL.
function audioSrcOf(result: TTSResult | null): string | null {
  if (!result) return null
  return `data:${result.contentType ?? 'audio/mpeg'};base64,${result.audio}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// The drafting sub-run's live `partial` is typed `unknown` (progressively
// parsed structured output). Narrow it to the blog-post fields without an
// `as` cast — each field may be absent or half-written while streaming.
function asBlogPostDraft(partial: unknown): {
  title?: string
  subtitle?: string
  body?: string
} {
  if (!isRecord(partial)) return {}
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined
  return {
    title: str(partial.title),
    subtitle: str(partial.subtitle),
    body: str(partial.body),
  }
}

function BlogStudio() {
  const txn = useTransaction(blogTxnDef, {
    connection: fetchServerSentEvents('/api/blog-studio'),
  })

  // Everything below is derived from the transaction's reactive state — no
  // useState / useEffect. `blogPost` is the one-click transaction; `heroImage`
  // and `narration` are the same verbs, driven directly by the user for
  // regeneration.
  const { blogPost } = txn
  const heroRerun = txn.heroImage
  const narrationRerun = txn.narration

  const post = blogPost.result?.post ?? null
  // Prefer an individually regenerated hero / narration over the one the
  // transaction produced.
  const imageUrl = imageUrlOf(heroRerun.result ?? blogPost.result?.hero ?? null)
  const audioSrc = audioSrcOf(
    narrationRerun.result ?? blogPost.result?.audio ?? null,
  )

  // Live sub-run state, demultiplexed from the single SSE response: one entry
  // per `ctx.call` the server made, keyed by verb name.
  const subRuns = blogPost.subRuns
  const draftingRun = subRuns.find((run) => run.verb === 'drafting')
  const heroRun = subRuns.find((run) => run.verb === 'heroImage')
  const narrationRun = subRuns.find((run) => run.verb === 'narration')

  const isRunning = blogPost.isLoading
  const hasRun = blogPost.status !== 'idle'

  // While the `drafting` chat sub-run streams, the demux progressively parses
  // its structured output into `partial` — a live `{ title?, subtitle?, body? }`
  // that fills in as the JSON arrives. Render it directly for a streaming
  // preview before the transaction finishes and `blogPost.result` lands.
  const liveDraft = asBlogPostDraft(draftingRun?.partial)
  const draftedChars = liveDraft.body?.length ?? 0
  const writingStep = subRunToStep(draftingRun?.status)

  // Prefer the finished post; fall back to the live streaming draft.
  const shownTitle = post?.title ?? liveDraft.title
  const shownSubtitle = post?.subtitle ?? liveDraft.subtitle
  const shownBody = post?.body ?? liveDraft.body
  const showArticle = Boolean(shownTitle || shownBody)

  const heroBusy = heroRerun.isLoading || heroRun?.status === 'running'
  const heroFailed = heroRerun.status === 'error' || heroRun?.status === 'error'
  const narrationBusy =
    narrationRerun.isLoading || narrationRun?.status === 'running'
  const narrationFailed =
    narrationRerun.status === 'error' || narrationRun?.status === 'error'

  function run(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const topic = String(
      new FormData(e.currentTarget).get('topic') ?? '',
    ).trim()
    if (!topic || isRunning) return

    // Reset the surfaces so a re-run starts clean: the previous post, and any
    // individually regenerated hero/narration that would shadow the new
    // transaction's results.
    blogPost.reset()
    heroRerun.reset()
    narrationRerun.reset()

    // ONE call. The server composes drafting → (illustrate ∥ narrate) and
    // streams every sub-run live into `blogPost.subRuns`; the final
    // `{ post, hero, audio }` lands in `blogPost.result`. Fire and forget —
    // the reactive surfaces drive the UI.
    void blogPost.run({ topic })
  }

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gradient-to-b from-stone-50 to-amber-50 text-stone-800 md:flex-row">
      {/* Left: the studio controls */}
      <aside className="w-full shrink-0 border-b border-stone-200 bg-white/70 p-6 md:w-96 md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="mb-2 flex items-center gap-2 text-amber-700">
          <Newspaper size={20} />
          <span className="text-sm font-semibold uppercase tracking-wider">
            Blog Studio
          </span>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-stone-900">
          Turn a topic into a finished post
        </h1>
        <p className="mb-5 text-stone-500">
          One transaction writes the article, then illustrates it and records a
          voice-over in parallel — composed on the server from a single request,
          with every step streamed back live.
        </p>

        <form onSubmit={run}>
          <label
            htmlFor="blog-topic"
            className="mb-1 block text-sm font-medium text-stone-600"
          >
            Topic
          </label>
          <input
            id="blog-topic"
            name="topic"
            defaultValue=""
            placeholder="e.g. The quiet comeback of urban foxes"
            disabled={isRunning}
            className="mb-3 w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:opacity-60"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isRunning}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-600 px-5 py-3 font-medium text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                onClick={() => blogPost.stop()}
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
                writingStep === 'active' && draftedChars > 0
                  ? `${draftedChars} chars drafted`
                  : undefined
              }
            />
            <StepRow
              label="Illustrating"
              icon={<ImageIcon size={16} />}
              state={subRunToStep(heroRun?.status)}
            />
            <StepRow
              label="Recording voice-over"
              icon={<Volume2 size={16} />}
              state={subRunToStep(narrationRun?.status)}
            />
          </div>
        )}

        {post && (
          <div className="mt-5 flex flex-col gap-2 border-t border-stone-200 pt-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Touch up
            </span>
            {/* The same verbs the transaction composed, driven directly by
                the user — inputs derived from the current post. */}
            <button
              type="button"
              disabled={isRunning || heroRerun.isLoading}
              onClick={() =>
                void heroRerun.run({ prompt: heroPromptFor(post) })
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {heroRerun.isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ImageIcon size={16} />
              )}
              Regenerate hero image
            </button>
            <button
              type="button"
              disabled={isRunning || narrationRerun.isLoading}
              onClick={() =>
                void narrationRerun.run({ text: forNarration(post.body) })
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {narrationRerun.isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Volume2 size={16} />
              )}
              Re-narrate
            </button>
          </div>
        )}

        {blogPost.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {blogPost.error.message}
          </div>
        )}
      </aside>

      {/* Right: the post. Appears as soon as the drafting sub-run streams a
          title/body — the body fills in live — then the hero image and
          voice-over slot in as their sub-runs finish. */}
      <main className="flex-1 overflow-y-auto p-6">
        {showArticle ? (
          <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl shadow-stone-200/60">
            {/* Hero image */}
            <div className="relative aspect-[3/2] w-full bg-stone-100">
              {imageUrl && !heroBusy ? (
                <img
                  src={imageUrl}
                  alt={shownTitle ?? 'Hero image'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  {heroBusy ? (
                    <div className="flex flex-col items-center gap-2 text-stone-400">
                      <Loader2 size={28} className="animate-spin" />
                      <span className="text-sm">Illustrating…</span>
                    </div>
                  ) : heroFailed ? (
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
              {shownTitle ? (
                <h1 className="mb-3 text-4xl font-extrabold leading-tight tracking-tight text-stone-900">
                  {shownTitle}
                </h1>
              ) : (
                <div className="mb-3 h-10 w-2/3 animate-pulse rounded bg-stone-100" />
              )}
              {shownSubtitle && (
                <p className="mb-6 text-xl text-stone-500">{shownSubtitle}</p>
              )}

              {/* Byline + voice-over */}
              <div className="mb-6 flex items-center gap-3 border-y border-stone-100 py-3 text-sm text-stone-500">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Sparkles size={16} />
                </div>
                <span>Written &amp; narrated by TanStack AI</span>
                {narrationBusy ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <Loader2 size={14} className="animate-spin" /> Recording
                    voice-over…
                  </span>
                ) : audioSrc ? (
                  <div className="ml-auto flex items-center gap-2">
                    <Volume2 size={16} className="text-amber-700" />
                    <audio src={audioSrc} controls className="h-8" />
                  </div>
                ) : narrationFailed ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <AlertTriangle size={14} className="text-amber-500" />
                    Voice-over unavailable
                  </span>
                ) : null}
              </div>

              {/* Body — rendered as Markdown live while the draft streams in.
                  The client batches the streamed structured-output updates
                  (see TransactionClient), so this re-parses at a bounded rate
                  rather than once per token. */}
              <div className="text-[1.05rem] leading-8 text-stone-800 [&_a]:text-amber-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-amber-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-stone-600 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-stone-900 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_strong]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {shownBody ?? ''}
                </ReactMarkdown>
                {writingStep === 'active' && (
                  <span className="ml-0.5 inline-block h-5 w-2 animate-pulse bg-amber-400 align-text-bottom" />
                )}
              </div>
            </div>
          </article>
        ) : isRunning ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center text-stone-400">
              <Loader2 size={40} className="animate-spin text-amber-500" />
              <p className="max-w-xs text-sm">
                {draftedChars > 0
                  ? `Drafting the article… ${draftedChars} characters so far.`
                  : 'Starting the transaction…'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center text-stone-400">
              <Newspaper size={48} className="text-stone-300" />
              <p className="max-w-xs text-sm">
                Your finished post — hero image, article, and voice-over — will
                appear here.
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
      ? 'text-amber-700 font-medium'
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
