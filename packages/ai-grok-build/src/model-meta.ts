export const GROK_BUILD_MODELS = [
  'grok-build',
  'grok-build-0.1',
  'composer-2.5',
] as const

export type KnownGrokBuildModel = (typeof GROK_BUILD_MODELS)[number]

/** Any model id accepted by Grok Build; known ids get autocomplete. */
export type GrokBuildModel = KnownGrokBuildModel | (string & {})

const CLI_MODEL_ALIASES: Record<string, string> = {
  'grok-build': 'grok-build-0.1',
}

export function resolveGrokCliModel(model: string): string {
  return CLI_MODEL_ALIASES[model] ?? model
}
