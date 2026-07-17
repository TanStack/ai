import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { groqText } from '@tanstack/ai-groq'
import { openRouterText } from '@tanstack/ai-openrouter'

/**
 * SERVER-ONLY adapter resolution for the MCP demo routes. Kept separate from
 * `mcp-providers.ts` (the client-safe provider metadata) so pages that render
 * the provider picker never pull the provider SDKs into the browser bundle —
 * `@anthropic-ai/sdk` is in vite's `optimizeDeps.exclude`, and serving its
 * CJS dep `standardwebhooks` un-prebundled crashes the page in dev.
 */

/**
 * Resolve a request's `provider` (sent from the client via the chat body /
 * AG-UI forwardedProps) to a configured text adapter. Defaults to OpenAI.
 */
export function resolveTextAdapter(provider: unknown) {
  switch (provider) {
    case 'openrouter':
      return openRouterText('openai/gpt-5.5')
    case 'anthropic':
      return anthropicText('claude-sonnet-4-6')
    case 'gemini':
      return geminiText('gemini-3.5-flash')
    case 'groq':
      return groqText('llama-3.3-70b-versatile')
    case 'openai':
    default:
      return openaiText('gpt-5.5')
  }
}
