import { REACTOR_WORLD_MODELS, isReactorWorldModel } from '@tanstack/ai-reactor'
import type { ReactorWorldModel } from '@tanstack/ai-reactor'

export const WORLD_MODELS = REACTOR_WORLD_MODELS

export const WORLD_MODEL_LABELS: Record<ReactorWorldModel, string> = {
  'visko-orbis-stable': 'Orbis Stable',
  'visko-orbis-dynamic': 'Orbis Dynamic',
  'happy-oyster-adventure': 'Happy Oyster (adventure)',
  'happy-oyster-director': 'Happy Oyster (director)',
  'lingbot-world-2': 'LingBot World 2',
  lingbot: 'LingBot',
  helios: 'Helios',
}

export const EXAMPLE_PROMPTS = [
  'A dramatic coastline of black volcanic cliffs at golden hour, a single unbroken take.',
  'A neon cyberpunk city at night, slow aerial drift between rain-soaked towers.',
  'A quiet cedar forest at dawn, mist in the trees, camera gliding forward.',
] as const

export const RESOLUTIONS = ['1080p', '2k', '4k'] as const

export type WorldResolution = (typeof RESOLUTIONS)[number]

export { isReactorWorldModel }
export type { ReactorWorldModel }
