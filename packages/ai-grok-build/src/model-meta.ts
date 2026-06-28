/**
 * Models known to work with Grok Build. The harness accepts any xAI model id
 * its backend supports (grok-build-0.1 and aliases), so this list exists for
 * autocomplete — any string is accepted via the `(string & {})` escape hatch
 * in {@link GrokBuildModel}.
 */
export const GROK_BUILD_MODELS = ['grok-build-0.1', 'grok-build'] as const

export type KnownGrokBuildModel = (typeof GROK_BUILD_MODELS)[number]

/** Any model id accepted by Grok Build; known ids get autocomplete. */
export type GrokBuildModel = KnownGrokBuildModel | (string & {})
