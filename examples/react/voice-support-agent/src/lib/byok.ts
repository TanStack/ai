import { defaultByokStorage, defineByok } from '@tanstack/ai-client/byok'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { createServerFn } from '@tanstack/react-start'

export const KEYED_PROVIDERS = [openaiByok, geminiByok, grokByok] as const

/** Keys stay in the browser and ride on the first socket frame of a call. */
export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: KEYED_PROVIDERS,
})

/** Booleans only: which providers have a key on the server. */
export const getEnvKeyStatus = createServerFn({ method: 'GET' }).handler(
  (): Record<string, boolean> => {
    const status: Record<string, boolean> = {}
    for (const provider of KEYED_PROVIDERS) {
      status[provider.id] = (provider.env ?? []).some((name) =>
        Boolean(process.env[name]),
      )
    }
    return status
  },
)
