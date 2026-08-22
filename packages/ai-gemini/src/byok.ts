import { defineByokProvider } from '@tanstack/ai/byok'

export const geminiByok = defineByokProvider({
  id: 'gemini',
  label: 'Google Gemini',
  env: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
})
