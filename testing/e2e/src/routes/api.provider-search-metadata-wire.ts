import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { webSearchTool } from '@tanstack/ai-openai/tools'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { googleSearchTool } from '@tanstack/ai-gemini/tools'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

export const Route = createFileRoute('/api/provider-search-metadata-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provider = new URL(request.url).searchParams.get('provider')

        if (provider === 'openai') {
          return runOpenAISearch()
        }
        if (provider === 'gemini') {
          return runGeminiSearch()
        }
        return Response.json(
          { ok: false, error: 'Unsupported provider' },
          { status: 400 },
        )
      },
    },
  },
})

async function runOpenAISearch() {
  const adapter = createOpenaiChat('gpt-4o', DUMMY_KEY, {
    baseURL: `${LLMOCK_DEFAULT_BASE}/provider-search-openai/v1`,
  })
  let sources: unknown

  try {
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Find the latest release.' }],
      tools: [webSearchTool({ type: 'web_search' })],
    })) {
      if (chunk.type === 'TOOL_CALL_START') {
        sources = (chunk.metadata as { sources?: unknown } | undefined)?.sources
      }
    }
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return Response.json({ ok: true, sources })
}

async function runGeminiSearch() {
  const adapter = createGeminiChat('gemini-2.5-pro', DUMMY_KEY, {
    baseURL: `${LLMOCK_DEFAULT_BASE}/provider-search-gemini`,
  })
  let sources: unknown

  try {
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Find the latest release.' }],
      tools: [googleSearchTool()],
    })) {
      if (chunk.type === 'TOOL_CALL_START') {
        sources = (chunk.metadata as { sources?: unknown } | undefined)?.sources
      }
    }
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return Response.json({ ok: true, sources })
}
