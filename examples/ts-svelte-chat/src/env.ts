import { defineEnvVars } from '@sveltejs/kit/env'

// Each key is optional. Set the ones for the providers you want to use.
const optional = (value: string | undefined) => value

export const variables = defineEnvVars({
  OPENAI_API_KEY: { schema: optional },
  ANTHROPIC_API_KEY: { schema: optional },
  GEMINI_API_KEY: { schema: optional },
})
