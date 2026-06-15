import { anthropicProvider } from './anthropic.js'
import { elevenlabsProvider } from './elevenlabs.js'
import { falProvider } from './fal.js'
import { geminiProvider } from './gemini.js'
import { grokProvider } from './grok.js'
import { openaiProvider } from './openai.js'
import { openrouterProvider } from './openrouter.js'
import type { ProviderConfig } from '../providers.js'

export const ALL_PROVIDERS: ReadonlyArray<ProviderConfig> = [
  openaiProvider,
  anthropicProvider,
  geminiProvider,
  grokProvider,
  elevenlabsProvider,
  falProvider,
  openrouterProvider,
]
