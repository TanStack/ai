/**
 * Provider options and per-model capability tables for the BytePlus Seedance
 * video models.
 *
 * Every applicability claim below was probed live against
 * `https://ark.ap-southeast.bytepluses.com/api/v3` on 2026-07-31. The probe
 * sent an out-of-range `seed` alongside the field under test, so requests that
 * passed validation still failed before a task was created (nothing billed):
 * an error naming the field under test means "rejected", an error naming
 * `seed` means "accepted". Ark reports only one arbitrary invalid parameter
 * per request, so each cell was retried until a verdict repeated.
 *
 * Ark rejects an inapplicable field outright — "the specified parameter
 * `draft` is not supported for model seedance-1-0-pro in t2v, must be empty" —
 * so these tables are not cosmetic: sending a field to the wrong model is a
 * 400, not a no-op.
 *
 * **Where the adapter guards, and where it doesn't** (deliberate, not an
 * oversight). Scalar applicability — `service_tier`, `draft`, `priority`,
 * `frames`, `camera_fixed` — is left to Ark, whose 400 names the offending
 * field and the model precisely enough to act on, and whose per-model rules
 * shift as BytePlus ships models. Duplicating that here would mean a table
 * that silently goes stale and starts rejecting requests the API would have
 * accepted. The adapter guards locally only where the API's own error is
 * misleading or arrives too late to be actionable: prompt media shape (role
 * vocabulary, frame-vs-reference exclusivity, frame cardinality) and the
 * resolution tier, both of which are derived from a caller's `prompt` /
 * `size` rather than passed through verbatim.
 *
 * @experimental Video generation is an experimental feature and may change.
 */

import type {
  BytePlusVideoModel,
  BytePlusVideoRatio,
  BytePlusVideoResolution,
} from '../model-meta'

/**
 * Inference queue for the request.
 *
 * - `default` — online inference: lower RPM and concurrency quotas, lowest
 *   latency.
 * - `flex` — offline batch inference: higher daily token quotas at half the
 *   price, with no latency guarantee. Task ids come back with a `cgt-batch-`
 *   prefix (live-verified).
 *
 * Only the Seedance 1.x models accept this field. The Seedance 2.0 family
 * rejects it ("service_tier is not supported … must be empty").
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type BytePlusVideoServiceTier = 'default' | 'flex'

/**
 * Provider-specific options for Seedance video generation. These map one-to-one
 * onto the create-task request body and take precedence over the values the
 * adapter derives from the generic `size` / `duration` options.
 *
 * Fields are model-dependent; each one documents where it applies. Passing a
 * field to a model that does not accept it is a 400 from Ark, not a silent
 * ignore.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface BytePlusVideoProviderOptions {
  /**
   * Output aspect ratio. Overrides the ratio half of the generic `size`.
   *
   * `adaptive` (follow the input frame) is the default on Seedance 2.0 and
   * 1.5-pro but is rejected by Seedance 1.0-pro / 1.0-pro-fast for
   * text-to-video.
   */
  ratio?: BytePlusVideoRatio

  /**
   * Output resolution tier. Overrides the resolution half of the generic
   * `size`. Matched case-insensitively by the API; this package uses
   * lowercase throughout. `4k` exists only on `dreamina-seedance-2-0-260128`,
   * and there is no 2K tier on any model.
   */
  resolution?: BytePlusVideoResolution

  /**
   * Whole seconds of output. Overrides the generic `duration`, and unlike it
   * is sent verbatim rather than snapped into the model's range.
   *
   * `-1` asks the model to choose its own length; accepted by Seedance 2.0
   * and 1.5-pro only.
   */
  duration?: number

  /**
   * Frame count instead of `duration`, for fractional-second output. Takes
   * precedence over `duration` server-side. Valid values are the integers of
   * the form `25 + 4n` within `[29, 289]`, at 24 fps.
   *
   * Seedance 1.0-pro and 1.0-pro-fast only.
   */
  frames?: number

  /**
   * Randomness seed, an integer in `[-1, 2^32-1]`. `-1` (the default) leaves
   * generation unseeded. Accepted by every Seedance model.
   */
  seed?: number

  /**
   * Appends a "fix the camera" instruction to the prompt. Best-effort — the
   * model is not constrained to obey it.
   *
   * Seedance 1.5-pro, 1.0-pro and 1.0-pro-fast only; the 2.0 family rejects
   * it.
   */
  camera_fixed?: boolean

  /** Burn a watermark into the output. Defaults to `false`. */
  watermark?: boolean

  /**
   * Generate an audio track synchronized with the visuals — dialogue, effects
   * and score inferred from the prompt. Quote dialogue in the prompt for
   * better results.
   *
   * Accepted by every model at the API's validation layer, but only Seedance
   * 2.0 and 1.5-pro actually produce audio.
   */
  generate_audio?: boolean

  /**
   * Inference queue. Seedance 1.x only — the 2.0 family has no offline tier.
   */
  service_tier?: BytePlusVideoServiceTier

  /**
   * Also return the video's final frame as a watermark-free PNG, readable from
   * the finished task as `content.last_frame_url`. Chain it into the next
   * task's first frame to extend a shot. Accepted by every model.
   */
  return_last_frame?: boolean

  /**
   * Render a cheap, low-fidelity preview to sanity-check staging and camera
   * work before paying for the real thing.
   *
   * Seedance 1.5-pro only.
   */
  draft?: boolean

  /**
   * Queue priority, `[0, 9]`. Seedance 2.0 family only — 1.5-pro rejects it,
   * and the 1.0 models accept it without acting on it.
   */
  priority?: number

  /**
   * Seconds after `created_at` at which an unfinished task is abandoned and
   * marked `expired`. Documented range `[3600, 259200]`, default 172800
   * (48 hours). The floor is enforced on Seedance 1.x but not on the 2.0
   * family.
   */
  execution_expires_after?: number

  /**
   * URL that receives a POST with the full task payload on every status
   * change. BytePlus retries a failed delivery three times.
   */
  callback_url?: string

  /**
   * Stable opaque identifier for the end user driving the request, for abuse
   * attribution. Max 64 characters — hash the real identifier rather than
   * sending it.
   */
  safety_identifier?: string
}

/**
 * Type-only map from video model name to its provider options. Seedance takes
 * the same option surface across models; applicability is per-field and
 * documented on {@link BytePlusVideoProviderOptions}.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type BytePlusVideoModelProviderOptionsByName = {
  [K in BytePlusVideoModel]: BytePlusVideoProviderOptions
}

/**
 * Aspect ratios accepted by the create endpoint.
 *
 * `adaptive` is rejected by Seedance 1.0-pro / 1.0-pro-fast for text-to-video
 * but is the documented default for their image-to-video path, so it is not
 * filtered per model here.
 */
const BYTEPLUS_VIDEO_RATIOS: ReadonlyArray<string> = [
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '1:1',
  '21:9',
  'adaptive',
]

/**
 * Resolutions each model accepts, live-probed.
 *
 * Two findings here contradict the BytePlus prose docs and are worth calling
 * out: there is no 2K tier on any Seedance model (`2k`/`2K` is rejected
 * everywhere, including on the 2.0 flagship whose docs advertise "up to 4K"),
 * and `seedance-1-0-pro-fast-251015` does accept `1080p` despite being
 * documented as 480p/720p only.
 */
const BYTEPLUS_VIDEO_RESOLUTIONS: {
  readonly [K in BytePlusVideoModel]: ReadonlyArray<BytePlusVideoResolution>
} = {
  'dreamina-seedance-2-0-260128': ['480p', '720p', '1080p', '4k'],
  'dreamina-seedance-2-0-fast-260128': ['480p', '720p'],
  'dreamina-seedance-2-0-mini-260615': ['480p', '720p'],
  'seedance-1-5-pro-251215': ['480p', '720p', '1080p'],
  'seedance-1-0-pro-250528': ['480p', '720p', '1080p'],
  'seedance-1-0-pro-fast-251015': ['480p', '720p', '1080p'],
}

/**
 * Models accepting reference-media mode (`r2v`): reference images, video and
 * audio that the output draws on without pinning specific frames. The 1.x
 * models reject it with "the specified task_type r2v does not support model …".
 */
const BYTEPLUS_VIDEO_REFERENCE_MEDIA_MODELS: ReadonlySet<string> = new Set([
  'dreamina-seedance-2-0-260128',
  'dreamina-seedance-2-0-fast-260128',
  'dreamina-seedance-2-0-mini-260615',
])

/**
 * Models accepting a closing frame (`flf2v`, first-and-last-frame mode).
 * `seedance-1-0-pro-fast-251015` is the one Seedance model without it — it
 * does text-to-video and single-first-frame image-to-video only.
 */
const BYTEPLUS_VIDEO_LAST_FRAME_MODELS: ReadonlySet<string> = new Set([
  'dreamina-seedance-2-0-260128',
  'dreamina-seedance-2-0-fast-260128',
  'dreamina-seedance-2-0-mini-260615',
  'seedance-1-5-pro-251215',
  'seedance-1-0-pro-250528',
])

/**
 * True when the model supports reference-media mode (reference images, video
 * and audio).
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function supportsReferenceMedia(model: string): boolean {
  return BYTEPLUS_VIDEO_REFERENCE_MEDIA_MODELS.has(model)
}

/**
 * True when the model supports pinning the video's closing frame.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function supportsLastFrame(model: string): boolean {
  return BYTEPLUS_VIDEO_LAST_FRAME_MODELS.has(model)
}

/**
 * Splits a `size` template into its Seedance request fields.
 *
 * The template is either a bare aspect ratio (`'16:9'`) or
 * `ratio_resolution` (`'16:9_720p'`), mirroring the grok video adapter.
 * Returns `undefined` when the string doesn't match the template at all.
 *
 * The resolution half comes back lowercased. Ark itself matches the field
 * case-insensitively, but this package standardizes on lowercase so callers
 * can compare the result against {@link BytePlusVideoResolution} directly.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function parseBytePlusVideoSize(
  size: string,
): { ratio: string; resolution?: string } | undefined {
  const match = /^(\d+:\d+|adaptive)(?:_(.+))?$/.exec(size)
  const [, ratio, resolution] = match ?? []
  if (ratio === undefined) return undefined
  return {
    ratio,
    ...(resolution !== undefined && { resolution: resolution.toLowerCase() }),
  }
}

/**
 * Validates a resolution against a model's tiers, returning it lowercased.
 *
 * Used for both halves of the request: the resolution parsed out of the
 * generic `size`, and a `modelOptions.resolution` that overrides it.
 *
 * @throws Error when the model does not offer the tier.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function resolveBytePlusVideoResolution(
  model: BytePlusVideoModel,
  resolution: string,
): BytePlusVideoResolution {
  const normalized = resolution.toLowerCase() as BytePlusVideoResolution
  const allowed = BYTEPLUS_VIDEO_RESOLUTIONS[model]
  if (!allowed.includes(normalized)) {
    throw new Error(
      `byteplus: resolution "${resolution}" is not supported by model ` +
        `"${model}". Supported resolutions: ${allowed.join(', ')}.`,
    )
  }
  return normalized
}

/**
 * Validates a `size` template against a model and returns the request fields
 * it maps onto, with the resolution lowercased.
 *
 * @throws Error when the template is malformed, the ratio is unknown, or the
 * resolution is not offered by this model.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function resolveBytePlusVideoSize(
  model: BytePlusVideoModel,
  size: string,
): { ratio: string; resolution?: BytePlusVideoResolution } {
  const parsed = parseBytePlusVideoSize(size)
  if (!parsed || !BYTEPLUS_VIDEO_RATIOS.includes(parsed.ratio)) {
    throw new Error(
      `byteplus: size "${size}" is not supported by model "${model}". Expected ` +
        `"ratio" or "ratio_resolution" (e.g. "16:9_720p") with ratio one of: ` +
        `${BYTEPLUS_VIDEO_RATIOS.join(', ')}.`,
    )
  }

  return {
    ratio: parsed.ratio,
    ...(parsed.resolution !== undefined && {
      resolution: resolveBytePlusVideoResolution(model, parsed.resolution),
    }),
  }
}
