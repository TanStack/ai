import { ai, generate } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

export function viaAi(messages: Array<unknown>) {
  return ai({
    adapter: anthropicText('claude-3-5-sonnet-latest'),
    messages,

    modelOptions: {
      max_tokens: 64,
    },
  })
}

export function viaGenerate(messages: Array<unknown>) {
  return generate({
    adapter: anthropicText('claude-3-5-sonnet-latest'),
    messages,

    modelOptions: {
      top_p: 0.95,
    },
  })
}
