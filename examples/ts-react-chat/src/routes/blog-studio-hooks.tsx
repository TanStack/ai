import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  fetchServerSentEvents,
  useChat,
  useGenerateImage,
  useGenerateSpeech,
} from '@tanstack/ai-react'
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
import { BlogPostSchema, forNarration, heroPromptFor } from '../lib/blog-studio'
import type { GenerationClientState } from '@tanstack/ai-client'
import type { ImageGenerationResult, TTSResult } from '@tanstack/ai'
import type { FormEvent, ReactNode } from 'react'

export const Route = createFileRoute('/blog-studio-hooks')({
  component: BlogStudioHooks,
})

type StepState = 'pending' | 'active' | 'done' | 'failed'

function generationToStep(status: GenerationClientState): StepState {
  return status === 'generating'
    ? 'active'
    : status === 'success'
      ? 'done'
      : status === 'error'
        ? 'failed'
        : 'pending'
}

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

function BlogStudioHooks() {
  const hero = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
    body: { model: 'gpt-image-2' },
  })

  const narration = useGenerateSpeech({
    connection: fetchServerSentEvents('/api/generate/speech'),
    body: { provider: 'openai' },
  })

  const {
    sendMessage,
    isLoading: isDrafting,
    error: draftError,
    stop: stopDraft,
    partial,
    final,
    clear,
  } = useChat({
    id: 'blog-studio-hooks-draft',
    outputSchema: BlogPostSchema,
    connection: fetchServerSentEvents('/api/blog-draft'),
  })

  // `final` only becomes non-null once the structured draft is complete.
  // `generate()` is a no-op if that hook is already in flight, so a
  // duplicate effect run (e.g. Strict Mode) is harmless.
  useEffect(() => {
    if (!final) return

    void Promise.all([
      hero.generate({
        prompt: heroPromptFor(final),
        size: '1536x1024',
      }),
      narration.generate({
        text: forNarration(final.body),
        voice: 'alloy',
      }),
    ])
  }, [final, hero.generate, narration.generate])

  const post = final
  const imageUrl = imageUrlOf(hero.result)
  const audioSrc = audioSrcOf(narration.result)

  const isRunning = isDrafting || hero.isLoading || narration.isLoading

  const hasRun = Boolean(isDrafting || final || draftError)

  const liveDraft = partial
  const draftedChars = liveDraft.body?.length ?? 0
  const writingStep: StepState = isDrafting
    ? 'active'
    : post
      ? 'done'
      : draftError
        ? 'failed'
        : 'pending'

  const shownTitle = post?.title ?? liveDraft.title
  const shownSubtitle = post?.subtitle ?? liveDraft.subtitle
  const shownBody = post?.body ?? liveDraft.body
  const showArticle = Boolean(shownTitle || shownBody)

  const heroStep = generationToStep(hero.status)
  const narrationStep = generationToStep(narration.status)

  function stopAll() {
    stopDraft()
    hero.stop()
    narration.stop()
  }

  function run(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const topic = String(
      new FormData(e.currentTarget).get('topic') ?? '',
    ).trim()
    if (!topic || isRunning) return

    clear()
    hero.reset()
    narration.reset()

    void sendMessage(`Write a blog post about: ${topic}`)
  }

  const pipelineError =
    draftError?.message ?? hero.error?.message ?? narration.error?.message

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gradient-to-b from-stone-50 to-violet-50 text-stone-800 md:flex-row">
      <aside className="w-full shrink-0 border-b border-stone-200 bg-white/70 p-6 md:w-96 md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="mb-2 flex items-center gap-2 text-violet-700">
          <Newspaper size={20} />
          <span className="text-sm font-semibold uppercase tracking-wider">
            Blog Studio (hooks)
          </span>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-stone-900">
          Client-composed pipeline
        </h1>
        <p className="mb-5 text-stone-500">
          Three TanStack AI hooks orchestrate the flow on the client:{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">useChat</code>{' '}
          drafts the article, then{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">
            useGenerateImage
          </code>{' '}
          and{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">
            useGenerateSpeech
          </code>{' '}
          run in parallel once the draft lands.
        </p>
        <p className="mb-5 text-xs text-stone-400">
          Compare with the{' '}
          <Link
            to="/blog-studio"
            className="font-medium text-violet-700 underline underline-offset-2"
          >
            assistant version
          </Link>{' '}
          (one multi-capability endpoint, client chains) or the{' '}
          <Link
            to="/blog-studio-server"
            className="font-medium text-violet-700 underline underline-offset-2"
          >
            server version
          </Link>{' '}
          (one SSE stream, server chains).
        </p>

        <form onSubmit={run}>
          <label
            htmlFor="blog-topic-hooks"
            className="mb-1 block text-sm font-medium text-stone-600"
          >
            Topic
          </label>
          <input
            id="blog-topic-hooks"
            name="topic"
            defaultValue=""
            placeholder="e.g. The quiet comeback of urban foxes"
            disabled={isRunning}
            className="mb-3 w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-60"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isRunning}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-3 font-medium text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
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
            <button
              type="button"
              disabled={isRunning || hero.isLoading}
              onClick={() =>
                void hero.generate({
                  prompt: heroPromptFor(post),
                  size: '1536x1024',
                })
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {hero.isLoading ? (
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
                void narration.generate({
                  text: forNarration(post.body),
                  voice: 'alloy',
                })
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

        {pipelineError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pipelineError}
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {showArticle ? (
          <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl shadow-stone-200/60">
            <div className="relative aspect-[3/2] w-full bg-stone-100">
              {imageUrl && !hero.isLoading ? (
                <img
                  src={imageUrl}
                  alt={shownTitle ?? 'Hero image'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  {hero.isLoading ? (
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

              <div className="mb-6 flex items-center gap-3 border-y border-stone-100 py-3 text-sm text-stone-500">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                  <Sparkles size={16} />
                </div>
                <span>Written &amp; narrated by TanStack AI</span>
                {narration.isLoading ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <Loader2 size={14} className="animate-spin" /> Recording
                    voice-over…
                  </span>
                ) : audioSrc ? (
                  <div className="ml-auto flex items-center gap-2">
                    <Volume2 size={16} className="text-violet-700" />
                    <audio src={audioSrc} controls className="h-8" />
                  </div>
                ) : narrationStep === 'failed' ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <AlertTriangle size={14} className="text-amber-500" />
                    Voice-over unavailable
                  </span>
                ) : null}
              </div>

              <div className="text-[1.05rem] leading-8 text-stone-800 [&_a]:text-violet-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-violet-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-stone-600 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-stone-900 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_strong]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {shownBody ?? ''}
                </ReactMarkdown>
                {writingStep === 'active' && (
                  <span className="ml-0.5 inline-block h-5 w-2 animate-pulse bg-violet-400 align-text-bottom" />
                )}
              </div>
            </div>
          </article>
        ) : isRunning ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center text-stone-400">
              <Loader2 size={40} className="animate-spin text-violet-500" />
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
      ? 'text-violet-700 font-medium'
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
