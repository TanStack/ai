import { chat } from '@tanstack/ai'
import { openRouterText } from '@tanstack/ai-openrouter'

export function run(messages: Array<unknown>) {
  return chat({
    adapter: openRouterText('anthropic/claude-3.5-sonnet'),
    messages,

    modelOptions: {
      maxCompletionTokens: 1024,
    },
  })
}
