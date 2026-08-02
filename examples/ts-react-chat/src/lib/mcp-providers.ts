import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { groqText } from '@tanstack/ai-groq'
import { openRouterText } from '@tanstack/ai-openrouter'

/**
 * Providers the MCP demo can route a chat through. MCP tool discovery and
 * execution are provider-agnostic — the same `mcp: { clients }` config works no
 * matter which text adapter runs the agent loop. Switching providers here is how
 * you confirm that (e.g. that Anthropic tool-calling drives the MCP servers just
 * like OpenAI does).
 *
 * Each provider needs its own API key in the environment; the LLM key is
 * separate from the (keyless) MCP servers.
 */
export const MCP_PROVIDERS = [
  {
    value: 'openrouter',
    label: 'OpenRouter',
    model: 'openai/gpt-5.5',
    envKey: 'OPENROUTER_API_KEY',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    model: 'gpt-5.5',
    envKey: 'OPENAI_API_KEY',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    model: 'claude-sonnet-4-6',
    envKey: 'ANTHROPIC_API_KEY',
  },
  {
    value: 'gemini',
    label: 'Gemini',
    model: 'gemini-2.5-flash',
    envKey: 'GOOGLE_API_KEY',
  },
  {
    value: 'groq',
    label: 'Groq',
    model: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
  },
] as const

export type McpProvider = (typeof MCP_PROVIDERS)[number]['value']

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
      return geminiText('gemini-2.5-flash')
    case 'groq':
      return groqText('llama-3.3-70b-versatile')
    case 'openai':
    default:
      return openaiText('gpt-5.5')
  }
}
