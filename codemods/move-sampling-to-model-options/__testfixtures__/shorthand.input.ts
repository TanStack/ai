// Shorthand-key edge case: `temperature` is a local variable passed via
// shorthand. After the move, modelOptions must still reference the
// `temperature` identifier, not a literal.

import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export function run(messages: Array<unknown>) {
  const temperature = 0.5
  return chat({
    adapter: openaiText('gpt-4o'),
    messages,
    temperature,
  })
}
