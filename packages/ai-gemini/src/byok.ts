import { defineByokProvider } from '@tanstack/ai/byok'

export const geminiByok = defineByokProvider({
  id: 'gemini',
  label: 'Google Gemini',
  validate: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    headers: (key) => ({ 'x-goog-api-key': key }),
  },
})
