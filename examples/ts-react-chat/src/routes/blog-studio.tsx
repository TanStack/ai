import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
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
import { blogPlugin, forNarration, heroPromptFor } from '../lib/blog-studio'
import type { ImageGenerationResult, TTSResult } from '@tanstack/ai'
import type { FormEvent, ReactNode } from 'react'

export const Route = createFileRoute('/blog-studio')({
  component: BlogStudio,
})

type StepState = 'pending' | 'active' | 'done' | 'failed'

// Derive a step's UI state from a one-shot plugin surface (heroImage /
// narration): active while running, failed on error, done once a result lands.
function genStep(surface: {
  isLoading: boolean
  error: Error | undefined
  result: unknown
}): StepState {
  if (surface.isLoading) return 'active'
  if (surface.error) return 'failed'
  if (surface.result) return 'done'
  return 'pending'
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

function BlogStudio() {
  // The blog plugin exposes three independent surfaces behind one endpoint.
  // Orchestration happens here on the client — there is no server composition.
  const p = usePlugin(blogPlugin, {
    connection: fetchServerSentEvents('/api/blog-studio'),
    drafting: {},
    heroImage: {},
    narration: {},
  })

  const { drafting, heroImage, narration } = p

  // The finished, schema-validated draft (once the structured-output stream
  // completes); `partial` is the live, progressively-parsed version.
  const post = drafting.final
  const partial = drafting.partial

  const imageUrl = imageUrlOf(heroImage.result)
  const audioSrc = audioSrcOf(narration.result)

  // Any leg of the pipeline in flight.
  const isRunning = drafting.isLoading || heroImage.isLoading || narration.isLoading

  // Prefer the finished post; fall back to the live streaming draft.
  const shownTitle = post?.title ?? partial.title
  const shownSubtitle = post?.subtitle ?? partial.subtitle
  const shownBody = post?.body ?? partial.body
  const showArticle = Boolean(shownTitle || shownBody)
  const draftedChars = shownBody?.length ?? 0

  const writingStep: StepState = drafting.isLoading
    ? 'active'
    : post
      ? 'done'
      : drafting.error
        ? 'failed'
        : 'pending'
  const heroStep = genStep(heroImage)
  const narrationStep = genStep(narration)

  const heroBusy = heroImage.isLoading
  const heroFailed = heroStep === 'failed'
  const narrationBusy = narration.isLoading
  const narrationFailed = narrationStep === 'failed'

  // Has anything started? Drives the step list + empty state.
  const hasRun =
    isRunning ||
    Boolean(post) ||
    Boolean(heroImage.result) ||
    Boolean(narration.result) ||
    Boolean(shownBody)

  // Client-side orchestration: draft the post, then illustrate and narrate in
  // parallel — both derived from the completed draft. Each step drives its own
  // reactive surface, so the UI fills in as work finishes.
  async function orchestrate(topic: string) {
    drafting.clear()
    heroImage.reset()
    narration.reset()

    const draft = await drafting.sendMessage(
      `Write a blog post about: ${topic}`,
    )
    if (!draft) return // drafting failed / was stopped before completing

    await Promise.all([
      heroImage.run({ prompt: heroPromptFor(draft) }),
      narration.run({ text: forNarration(draft.body) }),
    ])
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const topic = String(
      new FormData(e.currentTarget).get('topic') ?? '',
    ).trim()
    if (!topic || isRunning) return
    void orchestrate(topic)
  }

  function stopAll() {
    drafting.stop()
    heroImage.stop()
    narration.stop()
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
          The client writes the article, then illustrates it and records a
          voice-over in parallel — three independent plugins behind one
          endpoint, orchestrated in the browser, each streamed back live.
        </p>

        <form onSubmit={onSubmit}>
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
                onClick={stopAll}
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
            {/* The same plugins the pipeline used, driven directly by the user
                — inputs derived from the current post. */}
            <button
              type="button"
              disabled={isRunning || heroImage.isLoading}
              onClick={() =>
                void heroImage.run({ prompt: heroPromptFor(post) })
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {heroImage.isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ImageIcon size={16} />
              )}
              Regenerate hero image
            </button>
            <button
              type="button"
              disabled={isRunning || narration.isLoading}
              onClick={() =>
                void narration.run({ text: forNarration(post.body) })
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {narration.isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Volume2 size={16} />
              )}
              Re-narrate
            </button>
          </div>
        )}

        {(drafting.error || heroImage.error || narration.error) && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(drafting.error ?? heroImage.error ?? narration.error)?.message}
          </div>
        )}
      </aside>

      {/* Right: the post. Appears as soon as the drafting stream emits a
          title/body — the body fills in live — then the hero image and
          voice-over slot in as their runs finish. */}
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
                  The client batches the streamed structured-output updates, so
                  this re-parses at a bounded rate rather than once per token. */}
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
                  : 'Starting the draft…'}
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
