import { defineByokProvider } from '@tanstack/ai/byok'

export const anthropicByok = defineByokProvider({
  id: 'anthropic',
  label: 'Anthropic',
  env: 'ANTHROPIC_API_KEY',
  validate: {
    url: 'https://api.anthropic.com/v1/models',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
  },
})
