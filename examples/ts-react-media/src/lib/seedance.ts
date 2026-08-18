import type {
  BytePlusVideoModel,
  BytePlusVideoModelOrString,
  BytePlusVideoRatio,
  BytePlusVideoResolution,
  BytePlusVideoServiceTier,
} from '@tanstack/ai-byteplus'

/**
 * Seedance Studio catalog — the client half of the per-model capability
 * surface.
 *
 * Everything the adapter can tell us at runtime (duration range, resolution
 * tiers, first/last-frame support, reference-media support) is read from
 * `@tanstack/ai-byteplus` on the server and shipped down as
 * {@link SeedanceCapability}; this file only carries what the package
 * documents in prose rather than in a runtime table: display copy, and the
 * per-field applicability policy for the provider options.
 */

/** Which optional provider-option fields a model accepts. */
export interface SeedanceExtras {
  /**
   * `generate_audio` — accepted by every model at the validation layer, but
   * only Seedance 2.5, the 2.0 family and 1.5-pro actually produce an audio
   * track.
   */
  generateAudio: boolean
  /** `camera_fixed` — Seedance 1.x only; the 2.x family rejects it. */
  cameraFixed: boolean
  /** `service_tier: 'flex'` — Seedance 1.x only (no offline tier on 2.x). */
  serviceTier: boolean
  /** `frames` — Seedance 1.0-pro and 1.0-pro-fast only. */
  frames: boolean
  /** `draft` — Seedance 1.5-pro only. */
  draft: boolean
  /** `priority` (0-9) — Seedance 2.5 and the 2.0 family. */
  priority: boolean
  /** `duration: -1` (model picks the length) — Seedance 2.5, 2.0 and 1.5-pro. */
  autoDuration: boolean
}

export interface SeedanceModelEntry {
  id: BytePlusVideoModelOrString
  name: string
  blurb: string
  extras: SeedanceExtras
}

/** Resolves only for `never`; anything else is a compile error naming it. */
type AssertNever<T extends never> = T

/**
 * The Seedance models, with option applicability from
 * `BytePlusVideoProviderOptions` (2.0/1.x live-probed; 2.5 from ModelArk
 * docs). Ark 400s on an inapplicable field rather than ignoring it, so these
 * flags decide what the studio is allowed to send — not just what it renders.
 */
export const SEEDANCE_MODELS = [
  {
    id: 'dreamina-seedance-2-5-260628',
    name: 'Seedance 2.5',
    blurb: 'Current multimodal flagship — up to 30s, audio-only references',
    extras: {
      generateAudio: true,
      cameraFixed: false,
      serviceTier: false,
      frames: false,
      draft: false,
      priority: true,
      autoDuration: true,
    },
  },
  {
    id: 'dreamina-seedance-2-0-260128',
    name: 'Seedance 2.0',
    blurb: '2.0 flagship — the only Seedance model with a 4k tier',
    extras: {
      generateAudio: true,
      cameraFixed: false,
      serviceTier: false,
      frames: false,
      draft: false,
      priority: true,
      autoDuration: true,
    },
  },
  {
    id: 'dreamina-seedance-2-0-fast-260128',
    name: 'Seedance 2.0 Fast',
    blurb: 'Faster 2.0 sibling, capped at 720p',
    extras: {
      generateAudio: true,
      cameraFixed: false,
      serviceTier: false,
      frames: false,
      draft: false,
      priority: true,
      autoDuration: true,
    },
  },
  {
    id: 'dreamina-seedance-2-0-mini-260615',
    name: 'Seedance 2.0 Mini',
    blurb: 'Smallest 2.0 model, still takes reference media',
    extras: {
      generateAudio: true,
      cameraFixed: false,
      serviceTier: false,
      frames: false,
      draft: false,
      priority: true,
      autoDuration: true,
    },
  },
  {
    id: 'seedance-1-5-pro-251215',
    name: 'Seedance 1.5 Pro',
    blurb: 'Audio-capable 1.x flagship with cheap draft renders',
    extras: {
      generateAudio: true,
      cameraFixed: true,
      serviceTier: true,
      frames: false,
      draft: true,
      priority: false,
      autoDuration: true,
    },
  },
  {
    id: 'seedance-1-0-pro-250528',
    name: 'Seedance 1.0 Pro',
    blurb: 'Frame-count output and first-and-last-frame mode',
    extras: {
      generateAudio: false,
      cameraFixed: true,
      serviceTier: true,
      frames: true,
      draft: false,
      priority: false,
      autoDuration: false,
    },
  },
  {
    id: 'seedance-1-0-pro-fast-251015',
    name: 'Seedance 1.0 Pro Fast',
    blurb: 'Cheapest run — text-to-video and opening-frame only',
    extras: {
      generateAudio: false,
      cameraFixed: true,
      serviceTier: true,
      frames: true,
      draft: false,
      priority: false,
      autoDuration: false,
    },
  },
] as const satisfies ReadonlyArray<SeedanceModelEntry>

/**
 * Compile-time link between this catalog and the package's model list: a new
 * model shipping in `@tanstack/ai-byteplus` fails the example's build here —
 * naming the id it is missing — instead of silently going absent from the
 * picker with no capability copy or option policy.
 */
export type SeedanceCatalogCoversEveryModel = AssertNever<
  Exclude<BytePlusVideoModel, (typeof SEEDANCE_MODELS)[number]['id']>
>

/**
 * Look up a catalog entry, or `undefined` for an id this file has no policy
 * for. There is deliberately no fallback entry: handing back some other
 * model's option policy would gate the studio on the wrong model's rules —
 * exactly the class of bug the per-model gating exists to prevent. A custom
 * id goes through the explicit unknown-model path instead.
 */
export function seedanceModel(
  id: BytePlusVideoModel,
): SeedanceModelEntry | undefined {
  return SEEDANCE_MODELS.find((entry) => entry.id === id)
}

/**
 * The runtime half of a model's capabilities, derived on the server from the
 * adapter's own metadata rather than restated here.
 */
export interface SeedanceCapability {
  model: BytePlusVideoModel
  /** Tiers this model accepts, in ascending order. */
  resolutions: Array<BytePlusVideoResolution>
  /** Whole-second range from the adapter's `availableDurations()`. */
  duration: { min: number; max: number; step: number }
  /** Whether an `end_frame` image is accepted (`flf2v`). */
  supportsLastFrame: boolean
  /** Whether reference images / video / audio are accepted (`r2v`). */
  supportsReferenceMedia: boolean
}

/**
 * Placeholder for the advanced custom-id field when trying an id this package
 * has not catalogued yet. Known models (including Seedance 2.5) live in the
 * picker above.
 */
export const SEEDANCE_CUSTOM_MODEL_PLACEHOLDER = 'dreamina-seedance-…-yymmdd'

/**
 * Option applicability for an id the package has no table for: everything on.
 *
 * This is not optimism. `@tanstack/ai-byteplus` deliberately leaves an unknown
 * id ungated — the adapter's per-model guards switch off and Ark judges the
 * request — because clamping a future model against today's tables would
 * reject requests the API would have accepted. The studio mirrors that: it
 * offers the full surface and lets the API be the authority.
 */
export const SEEDANCE_UNKNOWN_MODEL_EXTRAS: SeedanceExtras = {
  generateAudio: true,
  cameraFixed: true,
  serviceTier: true,
  frames: true,
  draft: true,
  priority: true,
  autoDuration: true,
}

/**
 * Every resolution tier Seedance has shipped so far. Which of them a known
 * model accepts is decided by the adapter (see `SeedanceCapability`); for an
 * unknown model these are offered as a starting point alongside a free-text
 * field, since a future model may bring a tier that does not exist today.
 */
export const SEEDANCE_RESOLUTION_TIERS: ReadonlyArray<BytePlusVideoResolution> =
  ['480p', '720p', '1080p', '4k']

/**
 * The studio's curated slice of `BytePlusVideoProviderOptions`, as sent from
 * the browser. The server maps it onto the provider's own (snake_case) field
 * names and drops anything the selected model does not accept.
 */
export interface SeedanceJobOptions {
  ratio?: BytePlusVideoRatio
  resolution?: BytePlusVideoResolution
  /**
   * Full `ratio_resolution` template, used instead of `ratio`/`resolution` for
   * a custom model id. Those two are typed against the tiers this package
   * knows; the generic `size` is the open path, and the adapter only checks an
   * unknown model's template shape before handing the values to Ark.
   */
  size?: string
  /** Whole seconds, or `-1` to let the model choose (2.5 / 2.0 / 1.5-pro). */
  duration?: number
  /** Frame count instead of seconds; wins over `duration` server-side. */
  frames?: number
  /** `[-1, 2^32-1]`; `-1` leaves generation unseeded. */
  seed?: number
  watermark?: boolean
  generateAudio?: boolean
  cameraFixed?: boolean
  serviceTier?: BytePlusVideoServiceTier
  draft?: boolean
  /** Queue priority `[0, 9]`. */
  priority?: number
}

/**
 * How the prompt's media parts are shaped. Seedance sorts them into mutually
 * exclusive task types, so the studio picks one mode rather than letting a
 * user mix frame roles with reference roles into a request the adapter would
 * reject.
 */
export type SeedanceInputMode =
  | 'text'
  | 'first-frame'
  | 'first-last-frame'
  | 'reference'

/**
 * Aspect ratios the create endpoint accepts. `adaptive` (follow the input
 * frame) only makes sense with an image attached — Seedance 1.0 rejects it
 * outright for text-to-video — so the studio offers it conditionally.
 */
export const SEEDANCE_RATIOS: ReadonlyArray<BytePlusVideoRatio> = [
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '1:1',
  '21:9',
]

/** Seedance renders at 24 fps, which is what makes `frames` a duration. */
export const SEEDANCE_FPS = 24

/**
 * Snap a frame count onto the grid Seedance accepts: the integers of the form
 * `25 + 4n` inside `[29, 289]`.
 */
export function snapSeedanceFrames(frames: number): number {
  const steps = Math.min(66, Math.max(1, Math.round((frames - 25) / 4)))
  return 25 + steps * 4
}

/** Smallest / largest frame counts on that grid. */
export const SEEDANCE_MIN_FRAMES = snapSeedanceFrames(0)
export const SEEDANCE_MAX_FRAMES = snapSeedanceFrames(Number.MAX_SAFE_INTEGER)

/** One-line capability summary shown under each model in the picker. */
export function describeSeedanceModel(
  entry: SeedanceModelEntry,
  capability: SeedanceCapability | undefined,
): string {
  if (!capability) return entry.blurb
  const parts = [
    `${capability.duration.min}-${capability.duration.max}s`,
    capability.resolutions.join(' / '),
  ]
  if (entry.extras.generateAudio) parts.push('audio')
  if (capability.supportsReferenceMedia) parts.push('references')
  if (capability.supportsLastFrame) parts.push('first+last frame')
  if (entry.extras.serviceTier) parts.push('flex tier')
  if (entry.extras.frames) parts.push('frame count')
  if (entry.extras.draft) parts.push('draft')
  if (entry.extras.priority) parts.push('priority')
  return parts.join(' · ')
}
