import type { SimulatorScript } from '@tanstack/tests-adapters'

export const MIDDLEWARE_SCENARIOS: Record<string, SimulatorScript> = {
  'basic-text': {
    iterations: [{ content: 'Hello from the assistant.' }],
  },
  'with-tool': {
    iterations: [
      {
        toolCalls: [{ name: 'get_weather', arguments: { city: 'NYC' } }],
      },
      { content: 'The weather is sunny.' },
    ],
  },
}

export const MIDDLEWARE_MODES = [
  { id: 'none', label: 'No Middleware' },
  { id: 'chunk-transform', label: 'Chunk Transform (prefix text)' },
  { id: 'tool-skip', label: 'Tool Skip (skip with custom result)' },
] as const
