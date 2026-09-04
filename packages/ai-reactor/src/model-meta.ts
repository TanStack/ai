/**
 * Reactor world-model ids and connect slugs.
 *
 * Ids are the short names passed to `reactorWorld('visko-orbis-stable')`.
 * `REACTOR_WORLD_SLUGS` maps each id to the `modelName` the Reactor SDK
 * connects with.
 */

export const REACTOR_WORLD_MODELS = [
  'visko-orbis-stable',
  'visko-orbis-dynamic',
  'happy-oyster-adventure',
  'happy-oyster-director',
  'lingbot-world-2',
  'lingbot',
  'helios',
] as const

export type ReactorWorldModel = (typeof REACTOR_WORLD_MODELS)[number]

export function isReactorWorldModel(model: string): model is ReactorWorldModel {
  return (REACTOR_WORLD_MODELS as ReadonlyArray<string>).includes(model)
}

export const REACTOR_WORLD_SLUGS = {
  'visko-orbis-stable': 'reactor/visko-orbis-stable',
  'visko-orbis-dynamic': 'reactor/visko-orbis-dynamic',
  'happy-oyster-adventure': 'reactor/happy-oyster-adventure',
  'happy-oyster-director': 'reactor/happy-oyster-director',
  'lingbot-world-2': 'reactor/lingbot-world-2',
  lingbot: 'reactor/lingbot',
  helios: 'reactor/helios',
} as const satisfies Record<ReactorWorldModel, string>

export type ReactorWorldSlug = (typeof REACTOR_WORLD_SLUGS)[ReactorWorldModel]

export type ReactorWorldResolution = '1080p' | '2k' | '4k'

/**
 * Provider options for Reactor world models. The browser applies these when
 * it opens the session (`set_resolution`, `set_seed`, `set_audio_enabled`,
 * `set_audio_prompt`).
 */
export interface ReactorWorldProviderOptions {
  /** Delivery resolution for Orbis. Ignored by models that do not expose it. */
  resolution?: ReactorWorldResolution
  /** RNG seed for the next run. */
  seed?: number
  /** When false, skip audio compute on the next start. */
  audioEnabled?: boolean
  /** Sound description. Empty string generates audio from the picture alone. */
  audioPrompt?: string
}

export type ReactorWorldModelProviderOptionsByName = {
  [M in ReactorWorldModel]: ReactorWorldProviderOptions
}
