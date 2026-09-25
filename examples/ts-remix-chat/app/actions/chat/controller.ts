import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  mergeAgentTools,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createController } from 'remix/router'
import { serverTools } from '../../lib/guitar-tools.ts'
import { routes } from '../../routes.ts'

const SYSTEM_PROMPT = `You are a helpful assistant for a guitar store.

When a user asks for a guitar recommendation:
1. FIRST: Use the getGuitars tool (no parameters needed)
2. SECOND: Use the recommendGuitar tool with the ID of the guitar you want to recommend
3. NEVER write a recommendation directly - ALWAYS use the recommendGuitar tool

ONLY recommend guitars from our inventory (use getGuitars first).
`

export default createController(routes.chat, {
  actions: {
    async stream({ request }) {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return new Response('Bad request', { status: 400 })
      }

      let params
      try {
        params = await chatParamsFromRequestBody(body)
      } catch (error) {
        return new Response(
          error instanceof Error ? error.message : 'Bad request',
          { status: 400 },
        )
      }

      const abortController = new AbortController()
      const mergedTools = mergeAgentTools(serverTools, params.tools)

      try {
        const stream = chat({
          adapter: openaiText('gpt-5.6'),
          tools: mergedTools,
          systemPrompts: [SYSTEM_PROMPT],
          agentLoopStrategy: maxIterations(20),
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          abortController,
        })

        return toServerSentEventsResponse(stream, { abortController })
      } catch (error) {
        return new Response(
          error instanceof Error ? error.message : 'An error occurred',
          { status: 500 },
        )
      }
    },
  },
})
