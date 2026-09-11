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
 * Browser session commands for Reactor world models (`set_resolution`,
 * `set_seed`, `set_audio_enabled`, `set_audio_prompt`). `createWorld` does
 * not send these. Keep them in client state and apply after connect.
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

/**
 * Reactor video-model ids and connect slugs.
 *
 * Ids are the short names passed to `reactorVideo('helios')`.
 * `REACTOR_VIDEO_SLUGS` maps each id to the `modelName` the Reactor SDK
 * connects with.
 *
 * These models stream live video over WebRTC. Use them with `generateLiveVideo()`.
 * They do not return a download URL. X2 and SANA-Streaming need a live source
 * track, so they are not in this list.
 */

export const REACTOR_VIDEO_MODELS = [
  'helios',
  'fast-h3',
  'longlive-v2',
  'ltx2',
] as const

export type ReactorVideoModel = (typeof REACTOR_VIDEO_MODELS)[number]

export function isReactorVideoModel(model: string): model is ReactorVideoModel {
  return (REACTOR_VIDEO_MODELS as ReadonlyArray<string>).includes(model)
}

export const REACTOR_VIDEO_SLUGS = {
  helios: 'reactor/helios',
  'fast-h3': 'reactor/fast-h3',
  'longlive-v2': 'reactor/longlive-v2',
  ltx2: 'reactor/ltx2',
} as const satisfies Record<ReactorVideoModel, string>

export type ReactorVideoSlug = (typeof REACTOR_VIDEO_SLUGS)[ReactorVideoModel]

/**
 * Browser session commands for Reactor video models. Same fields as world.
 * `createLiveVideo` does not send these. Keep them in client state and apply after
 * connect.
 */
export type ReactorVideoProviderOptions = ReactorWorldProviderOptions

export type ReactorVideoModelProviderOptionsByName = {
  [M in ReactorVideoModel]: ReactorVideoProviderOptions
}
