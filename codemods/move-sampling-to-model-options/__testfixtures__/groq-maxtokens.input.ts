import { chat } from '@tanstack/ai'
import { groqText } from '@tanstack/ai-groq'

export function run(messages: Array<unknown>) {
  return chat({
    adapter: groqText('llama-3.1-70b'),
    messages,
    maxTokens: 256,
  })
}
