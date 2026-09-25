import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { geminiText, geminiVideoPart } from '@tanstack/ai-gemini'
import type {
  GeminiUploadedFile,
  GeminiVideoMetadata,
} from '@tanstack/ai-gemini'
import type { ContentPart, ModelMessage } from '@tanstack/ai'

// Agentic understanding routes through the Interactions API; single-pass
// understanding uses generateContent. Both run on the same GA flash model.
const AGENTIC_MODEL = 'gemini-3.7-flash'
const SINGLE_PASS_MODEL = 'gemini-3.7-flash'

const SYSTEM_PROMPT =
  'You are a helpful assistant that answers questions about the video the user ' +
  'has shared. Be concise and specific, and cite timestamps when relevant.'

/** Extract plain text from a wire message (string content or text parts). */
function messageText(msg: any): string {
  if (typeof msg?.content === 'string') return msg.content
  const parts = Array.isArray(msg?.content)
    ? msg.content
    : Array.isArray(msg?.parts)
      ? msg.parts
      : []
  return parts
    .filter((p: any) => p?.type === 'text' && p.content)
    .map((p: any) => p.content)
    .join('\n')
}

/**
 * Rebuild the conversation for the adapter, attaching the uploaded video to the
 * first user turn so it stays in context for every turn (the full history is
 * re-sent each request).
 */
function buildMessages(
  wireMessages: Array<any>,
  video: GeminiUploadedFile | undefined,
  videoMetadata: GeminiVideoMetadata,
): Array<ModelMessage> {
  let videoAttached = false
  return wireMessages.map((msg): ModelMessage => {
    const role: ModelMessage['role'] =
      msg.role === 'assistant' ? 'assistant' : 'user'
    const text = messageText(msg)

    if (role === 'user' && video && !videoAttached) {
      videoAttached = true
      const content: Array<ContentPart> = [
        geminiVideoPart(video, videoMetadata),
        { type: 'text', content: text },
      ]
      return { role, content }
    }
    return { role, content: text }
  })
}

export const Route = createFileRoute('/api/video-understanding')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.data || {}
        const mode: 'agentic' | 'single-pass' =
          data.mode === 'agentic' ? 'agentic' : 'single-pass'
        const video: GeminiUploadedFile | undefined = data.video

        try {
          const videoMetadata: GeminiVideoMetadata =
            mode === 'agentic' ? { processing: 'agentic' } : { fps: 1 }

          const messages = buildMessages(
            body.messages ?? [],
            video,
            videoMetadata,
          )

          const model = mode === 'agentic' ? AGENTIC_MODEL : SINGLE_PASS_MODEL
          console.log(
            `>> video-understanding chat mode=${mode} model=${model} hasVideo=${Boolean(video)}`,
          )

          const stream = chat({
            adapter: geminiText(model),
            systemPrompts: [SYSTEM_PROMPT],
            messages,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error(
            '[API Route] video-understanding error:',
            error?.message,
          )
          return new Response(
            JSON.stringify({ error: error?.message ?? 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
