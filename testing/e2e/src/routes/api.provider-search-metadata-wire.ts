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
        const params = new URL(request.url).searchParams
        const provider = params.get('provider')

        if (provider === 'openai') {
          return runOpenAISearch(params.get('model'))
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

const OPENAI_SEARCH_BASE_URL = `${LLMOCK_DEFAULT_BASE}/provider-search-openai/v1`
const SEARCH_MESSAGES = [
  { role: 'user' as const, content: 'Find the latest release.' },
]

// Each call site names its model literally, so `webSearchTool` is checked
// against that model's `supports.tools` at compile time.
function openAISearchStream(model: string | null) {
  const tools = [webSearchTool({ type: 'web_search' })]
  switch (model) {
    case 'gpt-6-astra':
      return chat({
        adapter: createOpenaiChat('gpt-6-astra', DUMMY_KEY, {
          baseURL: OPENAI_SEARCH_BASE_URL,
        }),
        messages: SEARCH_MESSAGES,
        tools,
      })
    case 'gpt-6-sol':
      return chat({
        adapter: createOpenaiChat('gpt-6-sol', DUMMY_KEY, {
          baseURL: OPENAI_SEARCH_BASE_URL,
        }),
        messages: SEARCH_MESSAGES,
        tools,
      })
    case 'gpt-6-luna':
      return chat({
        adapter: createOpenaiChat('gpt-6-luna', DUMMY_KEY, {
          baseURL: OPENAI_SEARCH_BASE_URL,
        }),
        messages: SEARCH_MESSAGES,
        tools,
      })
    default:
      return chat({
        adapter: createOpenaiChat('gpt-4o', DUMMY_KEY, {
          baseURL: OPENAI_SEARCH_BASE_URL,
        }),
        messages: SEARCH_MESSAGES,
        tools,
      })
  }
}

async function runOpenAISearch(model: string | null) {
  let sources: unknown

  try {
    for await (const chunk of openAISearchStream(model)) {
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
