import { defaultByokStorage, defineByok } from '@tanstack/ai-client/byok'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { openaiByok } from '@tanstack/ai-openai/byok'

export const KEYED_PROVIDERS = [openaiByok, geminiByok, grokByok] as const

/** Keys stay in the browser and ride on the first socket frame of a call. */
export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: KEYED_PROVIDERS,
})
