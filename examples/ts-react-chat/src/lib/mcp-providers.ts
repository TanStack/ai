/**
 * Providers the MCP demo can route a chat through. MCP tool discovery and
 * execution are provider-agnostic — the same `mcp: { clients }` config works no
 * matter which text adapter runs the agent loop. Switching providers here is how
 * you confirm that (e.g. that Anthropic tool-calling drives the MCP servers just
 * like OpenAI does).
 *
 * Each provider needs its own API key in the environment; the LLM key is
 * separate from the (keyless) MCP servers.
 *
 * CLIENT-SAFE metadata only — the pages that render the provider picker import
 * this module, so it must not pull in any provider SDK. Adapter resolution
 * (server-only) lives in `mcp-provider-adapters.ts`.
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
    model: 'gemini-3.5-flash',
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
