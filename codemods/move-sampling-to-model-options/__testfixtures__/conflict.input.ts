// Conflict case: root `temperature` AND `modelOptions.temperature` are
// both present. The codemod must leave the whole call alone and report.

import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export function run(messages: Array<unknown>) {
  return chat({
    adapter: openaiText('gpt-4o'),
    messages,
    modelOptions: { temperature: 0.9 },
    temperature: 0.3,
  })
}
