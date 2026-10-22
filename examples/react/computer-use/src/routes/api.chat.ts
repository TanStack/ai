import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'

// One computer for the whole server. Each chat thread gets its own page.
const computerUse = createComputerUse({
  driver: playwrightComputer({
    startUrl: 'https://tanstack.com',
    // Show the Chromium window, so you can watch the model work.
    launch: { headless: false },
  }),
  // tanstack.com renders in the browser. Give each page time to draw.
  screenshotDelay: 1000,
})

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    tools: computerUse.tools,
    middleware: [computerUse.middleware],
    interrupts: [computerUse.interrupt],
    // Each action is one step. A search takes more than the default 5.
    agentLoopStrategy: maxIterations(20),
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
