import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'
import type { StreamChunk } from '@tanstack/ai'

// Schema shared by every turn in this conversation. The point of this example
// is to demonstrate that *every* assistant message carries its own typed
// structured-output part — old turns don't get blown away by new ones.
export const RecipeSchema = z.object({
  title: z.string().describe('A short title for the recipe'),
  cuisine: z.string().describe('Cuisine label, e.g. "Italian", "Mexican"'),
  servings: z.number().int().min(1).describe('Number of servings'),
  estimatedCostUsd: z
    .number()
    .min(0)
    .describe('Rough total grocery cost in USD'),
  ingredients: z
    .array(
      z.object({
        item: z.string(),
        amount: z.string().describe('Quantity with unit, e.g. "200 g"'),
      }),
    )
    .min(1),
  steps: z.array(z.string()).min(1).describe('Numbered cooking steps'),
  tips: z.array(z.string()).default([]),
})

export type Recipe = z.infer<typeof RecipeSchema>

const SYSTEM_PROMPT = `You are a chef assistant that always responds with a single recipe matching the provided JSON schema. When the user asks for modifications, produce a new recipe in the same shape that reflects the change. Stay terse — short titles, short steps.`

export const Route = createFileRoute('/api/structured-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort())

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        try {
          // Cast to AsyncIterable<StreamChunk> for the SSE serializer; the
          // structured-output stream variant carries the extra `start` /
          // `complete` custom events that don't appear in the AGUIEvent
          // union but are valid StreamChunks at runtime.
          const stream = chat({
            adapter: openaiText('gpt-4o'),
            messages: params.messages,
            systemPrompts: [SYSTEM_PROMPT],
            outputSchema: RecipeSchema,
            stream: true,
            threadId: params.threadId,
            runId: params.runId,
            abortController,
          }) as AsyncIterable<StreamChunk>
          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          console.error('[api/structured-chat] Error:', error)
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
