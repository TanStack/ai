import { chat } from '@tanstack/ai'
import { ollamaText } from '@tanstack/ai-ollama'

export function run(messages: Array<unknown>) {
  return chat({
    adapter: ollamaText('llama3'),
    messages,
    temperature: 0.7,
    maxTokens: 200,
  })
}
