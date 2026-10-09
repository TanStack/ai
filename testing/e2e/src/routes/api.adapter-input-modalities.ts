import { createFileRoute } from '@tanstack/react-router'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { createOpenaiChat } from '@tanstack/ai-openai'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/** Reports the runtime `inputModalities` of real provider text adapters. */
export const Route = createFileRoute('/api/adapter-input-modalities')({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          openai: createOpenaiChat('gpt-5.2', DUMMY_KEY).inputModalities,
          openaiAudio: createOpenaiChat('gpt-audio', DUMMY_KEY).inputModalities,
          anthropic: createAnthropicChat('claude-opus-4-6', DUMMY_KEY)
            .inputModalities,
          gemini: createGeminiChat('gemini-2.5-flash', DUMMY_KEY)
            .inputModalities,
        }),
    },
  },
})
