import { defineByokProvider } from '@tanstack/ai/byok'

export const perplexityByok = defineByokProvider({
  id: 'perplexity',
  label: 'Perplexity',
  env: ['PERPLEXITY_API_KEY', 'PPLX_API_KEY'],
})
