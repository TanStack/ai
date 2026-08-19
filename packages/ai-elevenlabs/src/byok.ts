import { defineByokProvider } from '@tanstack/ai/byok'

export const elevenlabsByok = defineByokProvider({
  id: 'elevenlabs',
  label: 'ElevenLabs',
  validate: {
    url: 'https://api.elevenlabs.io/v1/user',
    headers: (key) => ({ 'xi-api-key': key }),
  },
})
