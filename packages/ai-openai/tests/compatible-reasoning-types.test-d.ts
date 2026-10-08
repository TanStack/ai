import { chat } from '@tanstack/ai'
import { openaiCompatible } from '../src/compatible'

const deepseek = openaiCompatible({
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com',
  apiKey: 'test',
  compat: { thinkingFormat: 'deepseek' },
  models: [
    {
      name: 'deepseek-v4-flash',
      reasoning: {
        off: 'none',
        minimal: null,
        medium: null,
        high: 'high',
        max: 'max',
      },
    },
    { name: 'deepseek-chat', reasoning: false },
    'deepseek-other',
  ],
})
const messages = [{ role: 'user' as const, content: 'hi' }]

// A level map allows only its levels.
chat({ adapter: deepseek('deepseek-v4-flash'), messages, reasoning: 'max' })
chat({ adapter: deepseek('deepseek-v4-flash'), messages, reasoning: 'off' })
// @ts-expect-error `medium` is null in the map
chat({ adapter: deepseek('deepseek-v4-flash'), messages, reasoning: 'medium' })

// @ts-expect-error a model with `reasoning: false` takes no reasoning option
chat({ adapter: deepseek('deepseek-chat'), messages, reasoning: 'low' })

// A bare string follows pi's rule: every level up to `high`.
chat({ adapter: deepseek('deepseek-other'), messages, reasoning: 'high' })
// @ts-expect-error `max` needs a level map
chat({ adapter: deepseek('deepseek-other'), messages, reasoning: 'max' })
