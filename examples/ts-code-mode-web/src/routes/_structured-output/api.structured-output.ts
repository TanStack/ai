import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { createCodeModeToolAndPrompt } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import type { AnyTextAdapter } from '@tanstack/ai'
import { cityTools } from '@/lib/tools/city-tools'

type Provider = 'anthropic' | 'openai' | 'gemini'

const JSON_SCHEMA_DESCRIPTION = `{
  "title": "string — short title for the report",
  "summary": "string — one paragraph summary",
  "keyFindings": ["string — each a key finding"],
  "recommendedCities": [
    { "name": "string", "country": "string", "reason": "string" }
  ],
  "comparison": {
    "firstCity": "string",
    "secondCity": "string",
    "populationDifferenceMillions": number,
    "highlights": ["string"]
  },
  "nextSteps": ["string — practical follow-up actions"]
}`

const STRUCTURED_OUTPUT_SYSTEM_PROMPT = `You are a travel research assistant.

RULES — follow these exactly:
1. Do NOT produce any conversational text at any point. No greetings, no "let me", no narration, no status updates, no commentary. SILENCE except for tool calls and the final JSON.
2. Immediately call execute_typescript to use the city data tools. Chain multiple tool calls if needed.
3. After all tool calls are done, output ONLY a single raw JSON object (no code fences, no markdown, no prose before or after).
4. The JSON must match this schema exactly:

${JSON_SCHEMA_DESCRIPTION}

5. Every field is required. Arrays must have at least one element.`

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText(
        (model || 'claude-sonnet-4-5') as 'claude-sonnet-4-5',
      )
  }
}

let codeModeCache: {
  tool: ReturnType<typeof createCodeModeToolAndPrompt>['tool']
  systemPrompt: string
} | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
    const driver = await createIsolateDriver('node')
    const { tool, systemPrompt } = createCodeModeToolAndPrompt({
      driver,
      tools: cityTools,
      timeout: 30000,
      memoryLimit: 128,
    })
    codeModeCache = { tool, systemPrompt }
  }
  return codeModeCache
}

export const Route = createFileRoute(
  '/_structured-output/api/structured-output',
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'anthropic'
        const model: string | undefined = data?.model

        const adapter = getAdapter(provider, model)

        try {
          const { tool, systemPrompt } = await getCodeModeTools()

          const stream = chat({
            adapter,
            messages,
            tools: [tool],
            systemPrompts: [STRUCTURED_OUTPUT_SYSTEM_PROMPT, systemPrompt],
            agentLoopStrategy: maxIterations(10),
            abortController,
            maxTokens: 8192,
          })

          const wrappedStream = extractJsonFromStream(stream, adapter)

          const sseStream = toServerSentEventsStream(
            wrappedStream,
            abortController,
          )

          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error: unknown) {
          console.error('[Structured Output API] Error:', error)

          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }

          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})

async function* extractJsonFromStream(
  stream: AsyncIterable<StreamChunk>,
  adapter: AnyTextAdapter,
): AsyncIterable<StreamChunk> {
  let lastAssistantText = ''
  let currentText = ''

  for await (const chunk of stream) {
    yield chunk

    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      currentText += chunk.delta
    }

    if (chunk.type === 'RUN_FINISHED') {
      if (currentText.trim()) {
        lastAssistantText = currentText
      }
      currentText = ''
    }
  }

  let jsonText = lastAssistantText.trim()
  if (!jsonText) return

  // Strip markdown code fences if the model wrapped the JSON
  jsonText = jsonText
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(jsonText)

    yield {
      type: 'CUSTOM',
      model: adapter.model,
      timestamp: Date.now(),
      name: 'structured_output:result',
      value: { result: parsed },
    }
  } catch {
    yield {
      type: 'CUSTOM',
      model: adapter.model,
      timestamp: Date.now(),
      name: 'structured_output:error',
      value: {
        error: 'Model did not return valid JSON as its final message.',
        raw: jsonText.slice(0, 500),
      },
    }
  }
}
