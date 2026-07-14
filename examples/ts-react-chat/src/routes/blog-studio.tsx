import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useAssistant } from '@tanstack/ai-react/assistant'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
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
  Volume2,
  Wand2,
} from 'lucide-react'
import { BlogPostSchema } from './api.blog-studio'

// Client-side assistant definition. `defineAssistant` is INERT in the browser
// — these callbacks never run; `useAssistant` only reads the declared
// capability names and their return types off this value to build the fully
// typed client. Every request is sent to the `/api/blog-studio` route, which
// owns the real callbacks. Mirroring the three capabilities (and the chat
// `outputSchema`) here keeps the client types in sync with the server.
//
// Single-provider openai adapters are used directly (not the multi-provider
// factories) so the browser bundle doesn't pull in every provider SDK.
const blogAssistant = defineAssistant({
  chat: (req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      outputSchema: BlogPostSchema,
      stream: true,
    }),
  image: (req) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: typeof req.prompt === 'string' ? req.prompt : '',
    }),
  speech: (req) =>
    generateSpeech({ adapter: openaiSpeech('tts-1'), text: req.text }),
})

export const Route = createFileRoute('/blog-studio')({
  component: BlogStudio,
})

// The chat step runs first; once the draft is ready, the image and voice-over
// are produced in parallel. Each one-shot step tracks its own outcome because
// `generate()` resolves to `null` on failure rather than rejecting.
type Phase = 'idle' | 'writing' | 'producing' | 'done'
type StepOutcome = 'pending' | 'active' | 'ok' | 'failed'
type StepState = 'pending' | 'active' | 'done' | 'failed'

function outcomeToState(outcome: StepOutcome): StepState {
  return outcome === 'ok'
    ? 'done'
    : outcome === 'active'
      ? 'active'
      : outcome === 'failed'
        ? 'failed'
        : 'pending'
}

function base64ToObjectUrl(base64: string, contentType: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: contentType }))
}

// Prepare the post body for narration: strip Markdown so TTS doesn't read the
// syntax aloud, and cap the length at a sentence boundary (OpenAI TTS rejects
// input over 4096 characters, and long posts easily exceed it).
function forNarration(markdown: string, max = 4000): string {
  const plain = markdown
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^\s*[-*+]\s+/gm, '') // list bullets
    .replace(/^\s*>\s?/gm, '') // blockquotes
    .replace(/\*\*(.*?)\*\*/g, '$1') // bold
    .replace(/\*(.*?)\*/g, '$1') // italic
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → link text
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (plain.length <= max) return plain
  const clipped = plain.slice(0, max)
  const boundary = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('\n'),
  )
  return (boundary > max / 2 ? clipped.slice(0, boundary + 1) : clipped).trim()
}

function BlogStudio() {
  const assistant = useAssistant(blogAssistant, {
    connection: fetchServerSentEvents('/api/blog-studio'),
  })

  const [topic, setTopic] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [imageOutcome, setImageOutcome] = useState<StepOutcome>('pending')
  const [audioOutcome, setAudioOutcome] = useState<StepOutcome>('pending')
  const [error, setError] = useState<string | null>(null)
  const audioObjectUrl = useRef<string | null>(null)

  // Revoke the last audio object URL when the component unmounts.
  useEffect(
    () => () => {
      if (audioObjectUrl.current) URL.revokeObjectURL(audioObjectUrl.current)
    },
    [],
  )

  const isRunning = phase === 'writing' || phase === 'producing'

  async function run() {
    const t = topic.trim()
    if (!t || isRunning) return
    setError(null)
    setImageUrl(null)
    setAudioUrl(null)
    // Revoke the previous run's audio URL now, so it's freed regardless of
    // whether this run's narration succeeds.
    if (audioObjectUrl.current) {
      URL.revokeObjectURL(audioObjectUrl.current)
      audioObjectUrl.current = null
    }
    setImageOutcome('pending')
    setAudioOutcome('pending')
    setPhase('writing')

    try {
      // 1. Draft the post. `sendMessage` resolves to the structured result
      //    because the chat callback declared an `outputSchema`. We re-validate
      //    it with the same schema before chaining: if the run errored (e.g. a
      //    missing server API key) there's no completed structured output, so
      //    guarding on the shape — not just a null check — keeps the pipeline
      //    from proceeding with a half-finished draft.
      const drafted = await assistant.chat.sendMessage(
        `Write a blog post about: ${t}`,
      )
      const parsed = BlogPostSchema.safeParse(drafted)
      if (!parsed.success) {
        setError(
          'Could not draft the post. Make sure OPENAI_API_KEY is set on the ' +
            'server, then try again.',
        )
        setPhase('idle')
        return
      }
      const post = parsed.data

      // 2. Illustrate and narrate in parallel — both derive only from the
      //    finished draft, so there's no reason to wait for one before the
      //    other. Each resolves to `null` on failure (generate never rejects),
      //    so each records its own outcome and the article ships best-effort.
      setPhase('producing')
      setImageOutcome('active')
      setAudioOutcome('active')

      const illustrate = (async () => {
        const image = await assistant.image.generate({
          prompt:
            `A striking editorial hero image for a blog post titled ` +
            `"${post.title}". ${post.subtitle}. Modern, clean, cinematic, ` +
            `high quality, no text.`,
        })
        const shot = image?.images[0]
        const url =
          shot?.url ??
          (shot?.b64Json ? `data:image/png;base64,${shot.b64Json}` : null)
        setImageUrl(url)
        setImageOutcome(url ? 'ok' : 'failed')
      })()

      const narrate = (async () => {
        const speech = await assistant.speech.generate({
          text: forNarration(post.body),
        })
        if (speech?.audio) {
          const audio = base64ToObjectUrl(
            speech.audio,
            speech.contentType ?? 'audio/mpeg',
          )
          audioObjectUrl.current = audio
          setAudioUrl(audio)
          setAudioOutcome('ok')
        } else {
          setAudioOutcome('failed')
        }
      })()

      await Promise.all([illustrate, narrate])
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setPhase('idle')
    }
  }

  const draft = assistant.chat.partial
  const post = assistant.chat.final
  const title = post?.title ?? draft.title
  const subtitle = post?.subtitle ?? draft.subtitle
  const body = post?.body ?? draft.body ?? ''
  const showArticle = Boolean(post) || (phase === 'writing' && (title || body))

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
          One assistant writes the article, then illustrates it and records a
          voice-over in parallel — chained from a single prompt over one
          endpoint.
        </p>

        <label
          htmlFor="blog-topic"
          className="mb-1 block text-sm font-medium text-stone-600"
        >
          Topic
        </label>
        <input
          id="blog-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run()
          }}
          placeholder="e.g. The quiet comeback of urban foxes"
          disabled={isRunning}
          className="mb-3 w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={isRunning || !topic.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-5 py-3 font-medium text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Wand2 size={18} />
          )}
          {isRunning ? 'Working…' : 'Write the post'}
        </button>

        {phase !== 'idle' && (
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <StepRow
              label="Writing the post"
              icon={<PenLine size={16} />}
              // The stepper only renders once phase !== 'idle', so writing is
              // either in progress or already finished.
              state={phase === 'writing' ? 'active' : 'done'}
            />
            <StepRow
              label="Illustrating"
              icon={<ImageIcon size={16} />}
              state={outcomeToState(imageOutcome)}
            />
            <StepRow
              label="Recording voice-over"
              icon={<Volume2 size={16} />}
              state={outcomeToState(audioOutcome)}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </aside>

      {/* Right: the post */}
      <main className="flex-1 overflow-y-auto p-6">
        {showArticle ? (
          <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl shadow-stone-200/60">
            {/* Hero image */}
            <div className="relative aspect-[3/2] w-full bg-stone-100">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title ?? ''}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  {imageOutcome === 'active' ? (
                    <div className="flex flex-col items-center gap-2 text-stone-400">
                      <Loader2 size={28} className="animate-spin" />
                      <span className="text-sm">Illustrating…</span>
                    </div>
                  ) : imageOutcome === 'failed' ? (
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
                {title ?? 'Untitled'}
              </h1>
              {subtitle && (
                <p className="mb-6 text-xl text-stone-500">{subtitle}</p>
              )}

              {/* Byline + voice-over */}
              <div className="mb-6 flex items-center gap-3 border-y border-stone-100 py-3 text-sm text-stone-500">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Sparkles size={16} />
                </div>
                <span>Written &amp; narrated by TanStack AI</span>
                {audioUrl ? (
                  <div className="ml-auto flex items-center gap-2">
                    <Volume2 size={16} className="text-amber-700" />
                    <audio src={audioUrl} controls className="h-8" />
                  </div>
                ) : audioOutcome === 'active' ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <Loader2 size={14} className="animate-spin" /> Recording
                    voice-over…
                  </span>
                ) : audioOutcome === 'failed' ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <AlertTriangle size={14} className="text-amber-500" />
                    Voice-over unavailable
                  </span>
                ) : null}
              </div>

              {/* Body */}
              <div className="text-[1.05rem] leading-8 text-stone-800 [&_a]:text-amber-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-amber-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-stone-600 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-stone-900 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_strong]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {body}
                </ReactMarkdown>
              </div>
            </div>
          </article>
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
}: {
  label: string
  icon: ReactNode
  state: StepState
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
    </span>
  )
}
