import { createFileRoute, Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertTriangle,
  Image as ImageIcon,
  Loader2,
  Newspaper,
  Sparkles,
  Square,
  Volume2,
  Wand2,
} from 'lucide-react'
import {
  forNarration,
  heroPromptFor,
  type BlogPost,
} from '../lib/blog-studio'
import {
  createBlogPostFn,
  regenerateBlogHeroFn,
  regenerateBlogNarrationFn,
} from '../lib/blog-studio-plain-server-fns'
import type { ImageGenerationResult, TTSResult } from '@tanstack/ai'
import type { FormEvent } from 'react'

export const Route = createFileRoute('/blog-studio-plain')({
  component: BlogStudioPlain,
})

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

function BlogStudioPlain() {
  const abortRef = useRef<AbortController | null>(null)

  const [topic, setTopic] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [post, setPost] = useState<BlogPost | null>(null)
  const [hero, setHero] = useState<ImageGenerationResult | null>(null)
  const [audio, setAudio] = useState<TTSResult | null>(null)

  const [heroBusy, setHeroBusy] = useState(false)
  const [narrationBusy, setNarrationBusy] = useState(false)
  const [heroFailed, setHeroFailed] = useState(false)
  const [narrationFailed, setNarrationFailed] = useState(false)

  const imageUrl = imageUrlOf(hero)
  const audioSrc = audioSrcOf(audio)

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setIsRunning(false)
    setHeroBusy(false)
    setNarrationBusy(false)
  }

  async function run(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const nextTopic = topic.trim()
    if (!nextTopic || isRunning) return

    stop()
    setError(null)
    setPost(null)
    setHero(null)
    setAudio(null)
    setHeroFailed(false)
    setNarrationFailed(false)
    setIsRunning(true)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const result = await createBlogPostFn({
        data: { topic: nextTopic },
        signal: abort.signal,
      })
      if (abort.signal.aborted) return
      setPost(result.post)
      setHero(result.hero)
      setAudio(result.audio)
    } catch (err) {
      if (abort.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Pipeline failed')
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
    setHeroFailed(false)
    setError(null)
    try {
      const result = await regenerateBlogHeroFn({
        data: { prompt: heroPromptFor(post) },
      })
      setHero(result)
    } catch (err) {
      setHeroFailed(true)
      setError(err instanceof Error ? err.message : 'Hero regenerate failed')
    } finally {
      setHeroBusy(false)
    }
  }

  async function regenerateNarration() {
    if (!post || isRunning || narrationBusy) return
    setNarrationBusy(true)
    setNarrationFailed(false)
    setError(null)
    try {
      const result = await regenerateBlogNarrationFn({
        data: { text: forNarration(post.body) },
      })
      setAudio(result)
    } catch (err) {
      setNarrationFailed(true)
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
          Server-composed, no transactions
        </h1>
        <p className="mb-3 text-stone-500">
          One{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">
            createServerFn
          </code>{' '}
          runs draft → (hero ∥ narration) on the server and returns the finished
          artifact. No{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">
            defineTransaction
          </code>
          , no custom event protocol — just activities and{' '}
          <code className="rounded bg-stone-100 px-1 text-xs">Promise.all</code>
          .
        </p>
        <p className="mb-5 text-xs text-stone-400">
          Compare with the{' '}
          <Link
            to="/blog-studio"
            className="font-medium text-sky-700 underline underline-offset-2"
          >
            transaction version
          </Link>
          : live sub-runs and a typed multi-verb client.
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
        {post ? (
          <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl shadow-stone-200/60">
            <div className="relative aspect-[3/2] w-full bg-stone-100">
              {imageUrl && !heroBusy ? (
                <img
                  src={imageUrl}
                  alt={post.title}
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
                {narrationBusy ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <Loader2 size={14} className="animate-spin" /> Recording
                    voice-over…
                  </span>
                ) : audioSrc ? (
                  <div className="ml-auto flex items-center gap-2">
                    <Volume2 size={16} className="text-sky-700" />
                    <audio src={audioSrc} controls className="h-8" />
                  </div>
                ) : narrationFailed ? (
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
                Writing, illustrating, and recording… this can take a minute.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center text-stone-400">
              <Newspaper size={48} className="text-stone-300" />
              <p className="max-w-xs text-sm">
                Your finished post — hero image, article, and voice-over — will
                appear here when the server function returns.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
