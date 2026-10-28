import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  defineAgent,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { researcher as researcherDeclaration } from '../lib/researcher-agent'

/**
 * The parent model writes the researcher's brief. The researcher's only
 * message is that brief, not the parent conversation.
 */
const researcher = defineAgent({
  ...researcherDeclaration,
  run: (ctx) => {
    console.log(
      '[subagent-brief] child input:',
      JSON.stringify(ctx.input),
      '| parent messages available:',
      ctx.messages.length,
    )
    return chat({
      adapter: openaiText('gpt-6.1-sol'),
      messages: [{ role: 'user', content: ctx.input.task }],
      threadId: ctx.threadId,
      runId: ctx.runId,
      parentRunId: ctx.parentRunId,
      subagentRunId: ctx.subagentRunId,
      resume: ctx.resume,
    })
  },
})

export const Route = createFileRoute('/api/subagent-brief')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const params = await chatParamsFromRequestBody(await request.json())
        const stream = chat({
          adapter: openaiText('gpt-6.1-sol'),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
          ...(params.resume ? { resume: params.resume } : {}),
          systemPrompts: [
            'For any research question, call the researcher tool. Then answer the user from its result.',
          ],
          subagents: { agents: [researcher] },
          abortController,
        })
        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
