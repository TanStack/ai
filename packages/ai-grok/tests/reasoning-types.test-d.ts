import { chat } from '@tanstack/ai'
import { createGrokText } from '../src/adapters/text'

const messages = [{ role: 'user' as const, content: 'hi' }]

// A model's own levels.
chat({ adapter: createGrokText('grok-4.7', 'k'), messages, reasoning: 'xhigh' })
chat({ adapter: createGrokText('grok-4.3', 'k'), messages, reasoning: 'off' })

// @ts-expect-error grok-4.7 has no off level
chat({ adapter: createGrokText('grok-4.7', 'k'), messages, reasoning: 'off' })

chat({
  adapter: createGrokText('grok-build-0.1', 'k'),
  messages,
  // @ts-expect-error the xAI API refuses reasoning for grok-build-0.1
  reasoning: 'high',
})

chat({
  adapter: createGrokText('grok-4.3', 'k'),
  messages,
  // @ts-expect-error reasoning lives on chat({ reasoning }), not modelOptions
  modelOptions: { reasoning: { effort: 'high' } },
})
