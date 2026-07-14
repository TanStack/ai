import type { FormEvent, ReactNode } from 'react'
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

type StepState = 'pending' | 'active' | 'done' | 'failed'

// The one-shot generation status maps directly onto a step state.
function statusToStep(
  status: 'idle' | 'generating' | 'success' | 'error',
): StepState {
  return status === 'generating'
    ? 'active'
    : status === 'success'
      ? 'done'
      : status === 'error'
        ? 'failed'
        : 'pending'
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
    // Transform the raw TTS result into a ready-to-play data URL at the hook.
    // `result` is typed as the raw `TTSResult`; `assistant.speech.result`
    // becomes `{ src: string } | null` — no component state, no cleanup.
    speech: {
      onResult: (result) => ({
        src: `data:${result.contentType ?? 'audio/mpeg'};base64,${result.audio}`,
      }),
    },
  })

  // Everything below is derived from the assistant's reactive state — no
  // useState / useEffect. The chat carries loading/partial/final; each one-shot
  // carries result/status/error.
  const { chat: post, image, speech } = assistant
  const draft = post.partial
  const finished = post.final
  const title = finished?.title ?? draft.title
  const subtitle = finished?.subtitle ?? draft.subtitle
  const body = finished?.body ?? draft.body ?? ''

  const heroImage = image.result?.images[0]
  const imageUrl =
    heroImage?.url ??
    (heroImage?.b64Json ? `data:image/png;base64,${heroImage.b64Json}` : null)
  // `speech.result` is the `onResult` transform's output — `{ src } | null`.
  const audioSrc = speech.result?.src ?? null

  const isRunning = post.isLoading || image.isLoading || speech.isLoading
  const hasRun = post.messages.length > 0 || isRunning
  const writingStep: StepState = post.error
    ? 'failed'
    : post.isLoading
      ? 'active'
      : hasRun
        ? 'done'
        : 'pending'
  const showArticle = Boolean(finished) || Boolean(title) || Boolean(body)

  async function run(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const topic = String(
      new FormData(e.currentTarget).get('topic') ?? '',
    ).trim()
    if (!topic || isRunning) return

    // Reset the surfaces so a re-run starts clean (clears prior draft/results).
    post.clear()
    image.reset()
    speech.reset()

    // 1. Draft the post. `sendMessage` resolves to the schema-validated result;
    //    re-validate before chaining so a failed run doesn't proceed with a
    //    half-finished draft.
    const parsed = BlogPostSchema.safeParse(
      await post.sendMessage(`Write a blog post about: ${topic}`),
    )
    if (!parsed.success) return
    const draftedPost = parsed.data

    // 2. Illustrate and narrate in parallel — fire and forget; the surfaces'
    //    reactive result/status/error drive the UI. `generate()` never rejects.
    void image.generate({
      prompt:
        `A striking editorial hero image for a blog post titled ` +
        `"${draftedPost.title}". ${draftedPost.subtitle}. Modern, clean, ` +
        `cinematic, high quality, no text.`,
    })
    void speech.generate({ text: forNarration(draftedPost.body) })
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
          One assistant writes the article, then illustrates it and records a
          voice-over in parallel — chained from a single prompt over one
          endpoint.
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
          <button
            type="submit"
            disabled={isRunning}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-5 py-3 font-medium text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Wand2 size={18} />
            )}
            {isRunning ? 'Working…' : 'Write the post'}
          </button>
        </form>

        {hasRun && (
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <StepRow
              label="Writing the post"
              icon={<PenLine size={16} />}
              state={writingStep}
            />
            <StepRow
              label="Illustrating"
              icon={<ImageIcon size={16} />}
              state={statusToStep(image.status)}
            />
            <StepRow
              label="Recording voice-over"
              icon={<Volume2 size={16} />}
              state={statusToStep(speech.status)}
            />
          </div>
        )}

        {post.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {post.error.message}
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
                  {image.status === 'generating' ? (
                    <div className="flex flex-col items-center gap-2 text-stone-400">
                      <Loader2 size={28} className="animate-spin" />
                      <span className="text-sm">Illustrating…</span>
                    </div>
                  ) : image.status === 'error' ? (
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
                {audioSrc ? (
                  <div className="ml-auto flex items-center gap-2">
                    <Volume2 size={16} className="text-amber-700" />
                    <audio src={audioSrc} controls className="h-8" />
                  </div>
                ) : speech.status === 'generating' ? (
                  <span className="ml-auto flex items-center gap-2 text-stone-400">
                    <Loader2 size={14} className="animate-spin" /> Recording
                    voice-over…
                  </span>
                ) : speech.status === 'error' ? (
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
