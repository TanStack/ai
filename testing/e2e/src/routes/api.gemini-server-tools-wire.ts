import { createFileRoute } from '@tanstack/react-router'
import { chat, toolDefinition } from '@tanstack/ai'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { googleSearchTool } from '@tanstack/ai-gemini/tools'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

const lookupCaucus = toolDefinition({
  name: 'lookup_caucus',
  description: 'Look up a caucus location by county',
  inputSchema: {
    type: 'object',
    properties: { county: { type: 'string' } },
    required: ['county'],
  },
}).server(async () => ({ location: 'Library' }))

export const Route = createFileRoute('/api/gemini-server-tools-wire')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createGeminiChat('gemini-3.6-flash', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/gemini-server-tools`,
        })
        let text = ''
        let error: string | undefined
        const tools: Array<string> = []
        try {
          for await (const chunk of chat({
            threadId: 'gemini-server-tools-wire',
            adapter,
            messages: [{ role: 'user', content: 'Search and look up.' }],
            tools: [googleSearchTool(), lookupCaucus],
          })) {
            if (chunk.type === 'TOOL_CALL_START') tools.push(chunk.toolCallName)
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
            if (chunk.type === 'RUN_ERROR') error = chunk.message
          }
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught)
        }
        return Response.json({ ok: error === undefined, error, text, tools })
      },
    },
  },
})
