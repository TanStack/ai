import { defineByokProvider } from '@tanstack/ai/byok'

export const claudeCodeByok = defineByokProvider({
  id: 'claude-code',
  label: 'Claude Code',
  env: 'ANTHROPIC_API_KEY',
})
