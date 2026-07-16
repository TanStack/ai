import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertTriangle,
  Check,
  Image as ImageIcon,
  Link2,
  Loader2,
  Newspaper,
  PenLine,
  Square,
  Volume2,
  Wand2,
} from 'lucide-react'
import { EventType } from '@tanstack/ai'
import { useChain } from '@tanstack/ai-react'
import { forNarration, heroPromptFor } from '../lib/blog-studio'
import { createBlogPostChainFn } from '../lib/blog-studio-chain-server-fns'
import {
  regenerateBlogHeroFn,
  regenerateBlogNarrationFn,
} from '../lib/blog-studio-server-fns'
import type { ImageGenerationResult, TTSResult } from '@tanstack/ai'
import type { ChainStepStatus } from '@tanstack/ai-client'
import type { BlogPost } from '../lib/blog-studio'
import type { BlogStudioChainResult } from '../lib/blog-studio-chain-server-fns'
import type { FormEvent, ReactNode } from 'react'

export const Route = createFileRoute('/blog-studio-chain')({
  component: BlogStudioChain,
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

function toUiStep(status: ChainStepStatus | undefined): StepState {
  if (status === 'active') return 'active'
  if (status === 'done') return 'done'
  if (status === 'error') return 'failed'
  return 'pending'
}

function BlogStudioChain() {
  const [topic, setTopic] = useState('')
  const [hasRun, setHasRun] = useState(false)
  const [draftChars, setDraftChars] = useState(0)

  // Local overrides after "Regenerate hero" / "Re-narrate" (one-shot server fns).
  const [heroOverride, setHeroOverride] =
    useState<ImageGenerationResult | null>(null)
  const [audioOverride, setAudioOverride] = useState<TTSResult | null>(null)
  const [heroBusy, setHeroBusy] = useState(false)
  const [narrationBusy, setNarrationBusy] = useState(false)
  const [touchUpError, setTouchUpError] = useState<string | null>(null)

  const chain = useChain<{ topic: string }, BlogStudioChainResult>({
    fetcher: (input, options) =>
      createBlogPostChainFn({ data: input, signal: options?.signal }),
    onChunk: (chunk) => {
      if (chunk.type !== EventType.TEXT_MESSAGE_CONTENT) return
      const delta = chunk.delta
      if (typeof delta === 'string') {
        setDraftChars((n) => n + delta.length)
      }
    },
  })

  const draftStep = chain.getStep('draft')
  const heroStepMeta = chain.getStep('media', 'hero')
  const narrationStepMeta = chain.getStep('media', 'narration')

  const draftResult = draftStep ? draftStep.result : undefined
  const post: BlogPost | null = isBlogPost(draftResult)
    ? draftResult
    : chain.result && isBlogPost(chain.result.post)
      ? chain.result.post
      : null

  const heroFromStep = heroStepMeta ? heroStepMeta.result : undefined
  const heroFromResult = chain.result ? chain.result.hero : undefined
  const hero: ImageGenerationResult | null =
    heroOverride ??
    (isImageResult(heroFromStep)
      ? heroFromStep
      : isImageResult(heroFromResult)
        ? heroFromResult
        : null)

  const audioFromStep = narrationStepMeta ? narrationStepMeta.result : undefined
  const audioFromResult = chain.result ? chain.result.narration : undefined
  const audio: TTSResult | null =
    audioOverride ??
    (isTtsResult(audioFromStep)
      ? audioFromStep
      : isTtsResult(audioFromResult)
        ? audioFromResult
        : null)

  const writingStep = toUiStep(draftStep ? draftStep.status : undefined)
  const heroStep: StepState = heroBusy
    ? 'active'
    : heroOverride
      ? 'done'
      : toUiStep(heroStepMeta ? heroStepMeta.status : undefined)
  const narrationStep: StepState = narrationBusy
    ? 'active'
    : audioOverride
      ? 'done'
      : toUiStep(narrationStepMeta ? narrationStepMeta.status : undefined)

  const isRunning = chain.isLoading
  const error = touchUpError ?? (chain.error ? chain.error.message : null)
  const imageUrl = imageUrlOf(hero)
  const audioSrc = audioSrcOf(audio)
  const showArticle = Boolean(post)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const nextTopic = topic.trim()
    if (!nextTopic || isRunning) return

    setHasRun(true)
    setDraftChars(0)
    setHeroOverride(null)
    setAudioOverride(null)
    setTouchUpError(null)
    chain.reset()
    await chain.run({ topic: nextTopic })
  }

  async function regenerateHero() {
    if (!post || isRunning || heroBusy) return
    setHeroBusy(true)
    setTouchUpError(null)
    try {
      const result = await regenerateBlogHeroFn({
        data: { prompt: heroPromptFor(post) },
      })
      setHeroOverride(result)
    } catch (err) {
      setTouchUpError(
        err instanceof Error ? err.message : 'Hero regenerate failed',
      )
    } finally {
      setHeroBusy(false)
    }
  }

  async function regenerateNarration() {
    if (!post || isRunning || narrationBusy) return
    setNarrationBusy(true)
    setTouchUpError(null)
    try {
      const result = await regenerateBlogNarrationFn({
        data: { text: forNarration(post.body) },
      })
      setAudioOverride(result)
    } catch (err) {
      setTouchUpError(
        err instanceof Error ? err.message : 'Narration regenerate failed',
      )
    } finally {
      setNarrationBusy(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gradient-to-b from-stone-50 to-emerald-50 text-stone-800 md:flex-row">
      <aside className="w-full shrink-0 border-b border-stone-200 bg-white/70 p-6 md:w-96 md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="mb-2 flex items-center gap-2 text-emerald-700">
          <Link2 size={20} />
          <span className="text-sm font-semibold uppercase tracking-wider">
            Blog Studio (chain)
          </span>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-stone-900">
          One chain, one stream
        </h1>
        <p className="mb-3 text-stone-500">
          Server{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">chain()</code>{' '}
          streams into{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">useChain</code>:{' '}
          live{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">chain:step</code>{' '}
          progress, draft deltas via{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">onChunk</code>,
          then{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">
            generation:result
          </code>
          .
        </p>
        <p className="mb-5 text-xs text-stone-400">
          Compare with the{' '}
          <Link
            to="/blog-studio-server"
            className="font-medium text-emerald-700 underline underline-offset-2"
          >
            server version
          </Link>{' '}
          (hand-rolled SSE), the{' '}
          <Link
            to="/blog-studio"
            className="font-medium text-emerald-700 underline underline-offset-2"
          >
            assistant version
          </Link>{' '}
          (client chains) or the{' '}
          <Link
            to="/blog-studio-hooks"
            className="font-medium text-emerald-700 underline underline-offset-2"
          >
            hooks version
          </Link>
          .
        </p>

        <form onSubmit={(e) => void onSubmit(e)}>
          <label
            htmlFor="blog-topic-chain"
            className="mb-1 block text-sm font-medium text-stone-600"
          >
            Topic
          </label>
          <input
            id="blog-topic-chain"
            name="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. The quiet comeback of urban foxes"
            disabled={isRunning}
            className="mb-3 w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isRunning}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                onClick={() => chain.stop()}
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
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Link2 size={16} />
                </div>
                <span>Written &amp; narrated by TanStack AI</span>
                {narrationBusy || narrationStep === 'active' ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <Loader2 size={14} className="animate-spin" /> Recording
                    voice-over…
                  </span>
                ) : audioSrc ? (
                  <div className="ml-auto flex items-center gap-2">
                    <Volume2 size={16} className="text-emerald-700" />
                    <audio src={audioSrc} controls className="h-8" />
                  </div>
                ) : narrationStep === 'failed' ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <AlertTriangle size={14} className="text-amber-500" />
                    Voice-over unavailable
                  </span>
                ) : null}
              </div>

              <div className="text-[1.05rem] leading-8 text-stone-800 [&_a]:text-emerald-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-stone-600 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-stone-900 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_strong]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {post.body}
                </ReactMarkdown>
              </div>
            </div>
          </article>
        ) : isRunning ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center text-stone-400">
              <Loader2 size={40} className="animate-spin text-emerald-500" />
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
                Your finished post streams in step-by-step via{' '}
                <code className="rounded bg-stone-100 px-1 text-xs">
                  useChain
                </code>
                .
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
      ? 'text-emerald-700 font-medium'
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
