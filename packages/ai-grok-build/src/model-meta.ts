/**
 * Models known to work with Grok Build. The harness accepts any xAI model id
 * its backend supports (grok-build and aliases), so this list exists for
 * autocomplete — any string is accepted via the `(string & {})` escape hatch
 * in {@link GrokBuildModel}.
 */
export const GROK_BUILD_MODELS = [
  'grok-build',
  'grok-build-0.1',
  'composer-2.5',
] as const

export type KnownGrokBuildModel = (typeof GROK_BUILD_MODELS)[number]

/** Any model id accepted by Grok Build; known ids get autocomplete. */
export type GrokBuildModel = KnownGrokBuildModel | (string & {})

/**
 * Resolve a TanStack model id to the name the in-sandbox `grok` CLI accepts.
 *
 * With `XAI_API_KEY` (headless / sandbox), `grok models` lists `grok-build-0.1`.
 * With a grok.com browser login (local dev), it lists `grok-build` instead.
 * Map the short alias so either auth mode works.
 */
const CLI_MODEL_ALIASES: Record<string, string> = {
  'grok-build': 'grok-build-0.1',
}

export function resolveGrokCliModel(model: string): string {
  return CLI_MODEL_ALIASES[model] ?? model
}
