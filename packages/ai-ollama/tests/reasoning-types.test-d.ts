import { chat } from '@tanstack/ai'
import { createOllamaChat } from '../src/adapters/text'

const messages = [{ role: 'user' as const, content: 'hi' }]

chat({ adapter: createOllamaChat('gpt-oss:20b'), messages, reasoning: 'low' })
chat({ adapter: createOllamaChat('qwen3:8b'), messages, reasoning: 'off' })
// A model name this package does not list gets the on/off toggle.
chat({ adapter: createOllamaChat('my-model'), messages, reasoning: 'high' })

// @ts-expect-error qwen3 only turns thinking on or off
chat({ adapter: createOllamaChat('qwen3:8b'), messages, reasoning: 'low' })

chat({
  adapter: createOllamaChat('athene-v2:latest'),
  messages,
  // @ts-expect-error a listed model that does not reason takes no reasoning
  reasoning: 'high',
})

chat({
  adapter: createOllamaChat('qwen3:8b'),
  messages,
  // @ts-expect-error think is set with chat({ reasoning })
  modelOptions: { think: true },
})
