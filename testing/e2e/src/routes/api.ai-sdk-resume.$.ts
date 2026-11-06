import { createFileRoute } from '@tanstack/react-router'
import { chat, memoryStream } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import {
  chatParamsFromAISDKRequest,
  resumeUIMessageStreamResponse,
  toResumableUIMessageStreamResponse,
} from '@tanstack/ai-ui-message-stream'

const RESUME_REPLY =
  'River stones rest under clear cold water while the slow current carries leaves toward the quiet village mill.'

// The active run of each chat. The e2e app is one process.
const activeRuns = new Map<string, string>()

// A resumable TanStack `chat()` route for AI SDK `useChat({ resume: true })`.
// - `POST /api/ai-sdk-resume/chat`: a slow `fakeText` reply, written to a
//   `memoryStream` log, so a page reload lands mid-reply.
// - `GET /api/ai-sdk-resume/chat/<chatId>/stream`: replays the chat's run.
export const Route = createFileRoute('/api/ai-sdk-resume/$')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromAISDKRequest(request)
        const runId = crypto.randomUUID()
        activeRuns.set(params.threadId, runId)

        const fake = fakeText({ tokensPerSecond: 10 })
        fake.setResponses([{ text: RESUME_REPLY }])

        return toResumableUIMessageStreamResponse(
          chat({ adapter: fake, runId, ...params }),
          memoryStream({ runId }),
        )
      },
      GET: ({ request }) => {
        const chatId = new URL(request.url).pathname.split('/').at(-2) ?? ''
        const runId = activeRuns.get(chatId)
        return resumeUIMessageStreamResponse(
          runId === undefined ? null : memoryStream({ runId }),
        )
      },
    },
  },
})
