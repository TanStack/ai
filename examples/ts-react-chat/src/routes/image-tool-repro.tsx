import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { REPRO_SECRET } from '@/lib/image-tool-repro'
import type { UIMessage } from '@tanstack/ai-react'

/**
 * Repro UI for https://github.com/TanStack/ai/issues/363
 *
 * One click sends a fixed prompt that makes the model call `getReproImage`
 * (a server tool returning a multimodal content-part array) and report the
 * secret number printed in the returned image. With multimodal tool results
 * supported, the image reaches the model and it reports the number; before the
 * fix the model only received JSON and could not read it.
 *
 * The verdict keys off whether the model reports the ACTUAL secret number — not
 * just a "VISIBLE" prefix — so a blind model cannot fake a pass by guessing.
 */
const REPRO_PROMPT =
  'Call the getReproImage tool and tell me the number printed in the image.'

function assistantText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { content: string }).content)
    .join('')
    .trim()
}

function ReproPage() {
  const { messages, sendMessage, isLoading, error } = useChat({
    connection: fetchServerSentEvents('/api/image-tool-repro'),
  })

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && assistantText(m).length > 0)
  const answer = lastAssistant ? assistantText(lastAssistant) : ''
  // Truly visible only if the model reports the real secret number.
  const sawImage = answer.includes(REPRO_SECRET)
  const hasAnswer = answer.length > 0

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-900 text-gray-100 px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">
            Issue #363 — Multimodal tool result repro
          </h1>
          <p className="text-sm text-gray-400">
            The <code className="text-orange-400">getReproImage</code> server
            tool returns an image as a multimodal content-part array. If tool
            results are stringified, the model never sees the image and cannot
            read the secret number it contains. When the image actually reaches
            the model it reports the number correctly.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-300">
              What the tool actually returns:
            </p>
            <img
              src="/repro-secret.png"
              alt="Secret number the model must read"
              className="w-48 rounded-lg border border-gray-700 bg-white [image-rendering:pixelated]"
            />
            <p className="text-xs text-gray-500">
              Secret number:{' '}
              <span className="text-gray-300">{REPRO_SECRET}</span> (never sent
              as text)
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => sendMessage(REPRO_PROMPT)}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {isLoading ? 'Running…' : 'Run repro'}
            </button>

            {hasAnswer && (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  sawImage
                    ? 'border-green-500/40 bg-green-500/10 text-green-300'
                    : 'border-red-500/40 bg-red-500/10 text-red-300'
                }`}
              >
                {sawImage
                  ? `✅ Model read the secret number (${REPRO_SECRET}) — image reached the model`
                  : '❌ Model could NOT read the number — image was stringified (issue reproduced)'}
              </div>
            )}

            {answer && (
              <pre className="whitespace-pre-wrap rounded-lg border border-gray-700 bg-gray-800/60 p-3 text-sm text-gray-200">
                {answer}
              </pre>
            )}

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/image-tool-repro')({
  component: ReproPage,
})
