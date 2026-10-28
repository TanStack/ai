import { chat } from '@tanstack/ai'
import { geminiText } from '@tanstack/ai-gemini'

export function run(messages: Array<unknown>) {
  return chat({
    adapter: geminiText('gemini-1.5-pro'),
    messages,
    topP: 0.9,
    maxTokens: 512,
  })
}
