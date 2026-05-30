import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

export function run(messages: Array<unknown>) {
  const temperature = 0.5
  return chat({
    adapter: anthropicText('claude-3-5-sonnet-latest'),
    messages,

    modelOptions: {
      top_k: 40,
      temperature: temperature
    }
  });
}
