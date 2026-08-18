import { createServerFn } from '@tanstack/react-start'
import { falImage, falVideo } from '@tanstack/ai-fal'
import { geminiImage, geminiVideo } from '@tanstack/ai-gemini'
import { grokImage, grokVideo } from '@tanstack/ai-grok'
import { openRouterVideo } from '@tanstack/ai-openrouter'
import {
  BYTEPLUS_VIDEO_MODELS,
  byteplusImage,
  byteplusVideo,
  getBytePlusVideoDurationOptions,
  resolveBytePlusVideoResolution,
  supportsLastFrame,
  supportsReferenceMedia,
} from '@tanstack/ai-byteplus'
import {
  generateImage,
  generateVideo,
  toServerSentEventsResponse,
} from '@tanstack/ai'

import type { StreamChunk } from '@tanstack/ai'
import type {
  BytePlusVideoModel,
  BytePlusVideoModelOrString,
  BytePlusVideoProviderOptions,
  BytePlusVideoResolution,
} from '@tanstack/ai-byteplus'
import type {
  ImagePart,
  MediaInputMetadata,
  MediaPrompt,
  TextPart,
  VideoPart,
} from '@tanstack/ai/client'
import type { OmniTaskMode } from './models'
import type { SeedanceCapability, SeedanceJobOptions } from './seedance'
import { SEEDANCE_RESOLUTION_TIERS } from './seedance'

/** A prompt restricted to text — accepted by every (incl. text-only) model. */
type TextPrompt = string | Array<TextPart>
/** A prompt of text + image parts — accepted by image-conditioned models. */
type ImagePrompt = string | Array<TextPart | ImagePart<MediaInputMetadata>>
/** A prompt of text + image + video parts — Gemini Omni Flash accepts all three. */
type OmniPrompt =
  | string
  | Array<
      TextPart | ImagePart<MediaInputMetadata> | VideoPart<MediaInputMetadata>
    >

/** True when the prompt carries text — a non-empty string or any prompt part. */
function hasPromptContent(prompt: MediaPrompt): boolean {
  return typeof prompt === 'string'
    ? prompt.trim().length > 0
    : prompt.length > 0
}

/**
 * Narrows a wire `MediaPrompt` to a text + image prompt for image-conditioned
 * models, throwing on any other part kind (video/audio) so unsupported inputs
 * fail fast rather than being silently dropped.
 */
function asImagePrompt(prompt: MediaPrompt): ImagePrompt {
  if (typeof prompt === 'string') return prompt
  return prompt.map((part) => {
    if (part.type === 'text' || part.type === 'image') return part
    throw new Error(`Unsupported prompt part for image model: ${part.type}`)
  })
}

/**
 * Narrows a wire `MediaPrompt` to a text-only prompt, throwing if any image /
 * video / audio part is present (text-to-image models can't accept inputs).
 */
function asTextPrompt(prompt: MediaPrompt): TextPrompt {
  if (typeof prompt === 'string') return prompt
  return prompt.map((part) => {
    if (part.type === 'text') return part
    throw new Error(
      `Model does not support image inputs (received ${part.type} part)`,
    )
  })
}

/**
 * Narrows a wire `MediaPrompt` for Gemini Omni Flash, which accepts text,
 * image, and video prompt parts (audio would be the only rejected kind).
 */
function asOmniPrompt(prompt: MediaPrompt): OmniPrompt {
  if (typeof prompt === 'string') return prompt
  return prompt.map((part) => {
    if (part.type === 'text' || part.type === 'image' || part.type === 'video')
      return part
    throw new Error(`Unsupported prompt part for Omni Flash: ${part.type}`)
  })
}

/**
 * Like `asImagePrompt`, but additionally requires at least one image part —
 * image-to-video endpoints need a start frame.
 */
function asImageToVideoPrompt(
  prompt: MediaPrompt,
): Array<TextPart | ImagePart<MediaInputMetadata>> {
  const narrowed = asImagePrompt(prompt)
  if (
    typeof narrowed === 'string' ||
    !narrowed.some((part) => part.type === 'image')
  ) {
    throw new Error('Start image is required for image-to-video')
  }
  return narrowed
}

/**
 * Poll cadence for the streamed video lifecycle. The server holds the request
 * open and polls the provider itself, so this is the rate at which
 * `video:status` events reach the browser's `useGenerateVideo`.
 */
const VIDEO_POLL_INTERVAL_MS = 4000

export const generateImageFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: MediaPrompt; model: string }) => {
    if (!hasPromptContent(data.prompt)) throw new Error('Prompt is required')
    if (!data.model) throw new Error('Model is required')
    return data
  })
  .handler(async ({ data }) => {
    // NOTE: Use string literals when instantiating adapters to preserve type safety
    // The Fal adapater also accepts any string for very latest models which is why new models appear to accept any paramater
    // Pass size information in modelOptions for the Fal adapter instead of size to be sure you are using the correct resolution

    switch (data.model) {
      case 'fal-ai/nano-banana-pro': {
        return generateImage({
          adapter: falImage('fal-ai/nano-banana-pro'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9_4K',
          modelOptions: {
            output_format: 'jpeg',
          },
        })
      }
      case 'xai/grok-imagine-image': {
        // NOTE: fal's generated `size` type for this model only offers
        // `16:9_1K` / `16:9_4K`, but the live API rejects those resolutions
        // ("Input should be '1k' or '2k'") — fal's published enum is out of
        // sync with its API, so `'16:9_4K'` type-checks yet 422s at runtime.
        // Pass aspect_ratio via modelOptions and let the endpoint pick its
        // default resolution, which both type-checks and works at runtime.
        return generateImage({
          adapter: falImage('xai/grok-imagine-image'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          modelOptions: { aspect_ratio: '16:9' },
        })
      }
      case 'grok-imagine-image': {
        // Direct xAI Imagine API (XAI_API_KEY) via the native grokImage
        // adapter — no fal in between. The grok-imagine models accept image
        // prompt parts for image-conditioned generation, so we narrow with
        // asImagePrompt. Sizing uses the aspect-ratio template.
        return generateImage({
          adapter: grokImage('grok-imagine-image'),
          prompt: asImagePrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9',
        })
      }
      case 'grok-imagine-image-2.0': {
        // xAI's recommended Imagine model; `quality` is a 2.0-only option
        // ('low' | 'medium', default 'medium').
        return generateImage({
          adapter: grokImage('grok-imagine-image-2.0'),
          prompt: asImagePrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9',
          modelOptions: { quality: 'medium' },
        })
      }
      case 'grok-imagine-image-quality': {
        return generateImage({
          adapter: grokImage('grok-imagine-image-quality'),
          prompt: asImagePrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9',
        })
      }
      case 'fal-ai/flux-2/klein/9b': {
        // NOTE: Newer models are untyped (at the moment)
        return generateImage({
          adapter: falImage('fal-ai/flux-2/klein/9b'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: 'landscape_16_9',
        })
      }
      case 'fal-ai/z-image/turbo': {
        return generateImage({
          adapter: falImage('fal-ai/z-image/turbo'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: 'landscape_16_9',
          modelOptions: {
            acceleration: 'high',
            enable_prompt_expansion: true,
          },
        })
      }
      case 'gemini-3.1-flash-image-preview': {
        return generateImage({
          adapter: geminiImage('gemini-3.1-flash-image-preview'),
          prompt: asImagePrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9_4K',
        })
      }
      case 'gemini-3-pro-image-preview': {
        return generateImage({
          adapter: geminiImage('gemini-3-pro-image-preview'),
          prompt: asImagePrompt(data.prompt),
          numberOfImages: 1,
          size: '16:9_4K',
        })
      }
      case 'imagen-4.0-ultra-generate-001': {
        return generateImage({
          adapter: geminiImage('imagen-4.0-ultra-generate-001'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: '1024x1024',
        })
      }
      case 'imagen-4.0-generate-001': {
        return generateImage({
          adapter: geminiImage('imagen-4.0-generate-001'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: '1024x1024',
        })
      }
      case 'imagen-4.0-fast-generate-001': {
        return generateImage({
          adapter: geminiImage('imagen-4.0-fast-generate-001'),
          prompt: asTextPrompt(data.prompt),
          numberOfImages: 1,
          size: '1024x1024',
        })
      }
      case 'dola-seedream-5-0-pro-260628': {
        // BytePlus Seedream via ModelArk (ARK_API_KEY). `size` is either a
        // 1K/2K/4K token or an explicit WIDTHxHEIGHT string — never both.
        // Seedream models accept reference images, so image prompt parts are
        // passed straight through.
        return generateImage({
          adapter: byteplusImage('dola-seedream-5-0-pro-260628'),
          prompt: asImagePrompt(data.prompt),
          numberOfImages: 1,
          size: '2K',
        })
      }
      default:
        throw new Error(`Unknown model: ${data.model}`)
    }
  })

/** What the browser sends for one video generation. */
interface VideoRequest {
  prompt: MediaPrompt
  model: string
  /**
   * Gemini Omni Flash conversational editing: the jobId (interaction id)
   * of a prior Omni generation to refine. Ignored by other models.
   */
  previousInteractionId?: string
  /**
   * Gemini Omni Flash generation controls (ignored by other models):
   * clip duration in seconds (3-10, fractional OK, default 10), output
   * aspect ratio, and an optional task-mode pin — omit `task` to let
   * the model infer the mode from the prompt and attachments.
   */
  omniOptions?: {
    duration?: number
    aspectRatio?: '16:9' | '9:16'
    task?: OmniTaskMode
  }
}

/**
 * The full create → poll → complete lifecycle for one model, as a chunk
 * stream. `stream: true` is what moves the polling loop to the server: the
 * browser's `useGenerateVideo` reads job id, status and result off these
 * chunks instead of running its own timer.
 */
function videoStreamForModel(data: VideoRequest): AsyncIterable<StreamChunk> {
  // Image-to-video models receive the start frame as a prompt part
  // (role: 'start_frame') — the fal adapter routes it to the endpoint's
  // start-image field. Text-to-video models take the text prompt only.
  switch (data.model) {
    // Text-to-video models
    case 'fal-ai/kling-video/v3/pro/text-to-video': {
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: falVideo('fal-ai/kling-video/v3/pro/text-to-video'),
        prompt: asTextPrompt(data.prompt),
        size: '16:9',
        modelOptions: {
          duration: '5',
        },
      })
    }
    case 'fal-ai/veo3.1': {
      // NOTE pass aspect ratio, resolution, and duration in model options
      // This makes use of existing types and avoids type errors
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: falVideo('fal-ai/veo3.1'),
        prompt: asTextPrompt(data.prompt),
        size: '16:9_1080p',
        modelOptions: {
          duration: '4s',
        },
      })
    }
    case 'xai/grok-imagine-video/text-to-video': {
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: falVideo('xai/grok-imagine-video/text-to-video'),
        prompt: asTextPrompt(data.prompt),
        size: '16:9_720p',
        modelOptions: {
          duration: 5,
        },
      })
    }
    case 'grok-imagine-video': {
      // Direct xAI Imagine API (XAI_API_KEY) — no fal in between. The base
      // grok-imagine-video (v1.0) supports text-to-video; durations are
      // 1-15 integer seconds. Completed jobs report usage.unitsBilled
      // (billed seconds) and usage.cost (exact USD).
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: grokVideo('grok-imagine-video'),
        prompt: asTextPrompt(data.prompt),
        size: '16:9_720p',
        duration: 5,
      })
    }
    case 'grok-imagine-video-1.5': {
      // Direct xAI Imagine API — grok-imagine-video-1.5 is xAI's recommended
      // default and supports text-to-video with native 1080p.
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: grokVideo('grok-imagine-video-1.5'),
        prompt: asTextPrompt(data.prompt),
        size: '16:9_720p',
        duration: 5,
      })
    }
    case 'dreamina-seedance-2-0-260128': {
      // BytePlus Seedance via ModelArk (ARK_API_KEY). `size` is a "ratio" or
      // "ratio_resolution" template; durations are 4-15 integer seconds.
      // Seedance option applicability is per model and Ark 400s on an
      // inapplicable field, so no service_tier/frames/camera_fixed here —
      // the 2.0 family rejects all three.
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: byteplusVideo('dreamina-seedance-2-0-260128'),
        prompt: asTextPrompt(data.prompt),
        size: '16:9_720p',
        duration: 5,
      })
    }
    case 'fal-ai/ltx-2.3/text-to-video/fast': {
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: falVideo('fal-ai/ltx-2.3/text-to-video/fast'),
        prompt: asTextPrompt(data.prompt),
        size: '16:9_2160p',
      })
    }
    // Image-to-video models
    case 'fal-ai/kling-video/v3/pro/image-to-video': {
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: falVideo('fal-ai/kling-video/v3/pro/image-to-video'),
        prompt: asImageToVideoPrompt(data.prompt),
        modelOptions: {
          generate_audio: true,
          duration: '5',
        },
      })
    }
    case 'fal-ai/veo3.1/image-to-video': {
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: falVideo('fal-ai/veo3.1/image-to-video'),
        prompt: asImageToVideoPrompt(data.prompt),
        size: '16:9_1080p',
        modelOptions: {
          duration: '4s',
        },
      })
    }
    case 'xai/grok-imagine-video/image-to-video': {
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: falVideo('xai/grok-imagine-video/image-to-video'),
        prompt: asImageToVideoPrompt(data.prompt),
        size: '16:9_720p',
        modelOptions: {
          duration: 5,
        },
      })
    }
    case 'grok-imagine-video-1.5/image-to-video': {
      // Direct xAI Imagine API. The starting frame is supplied as an image
      // prompt part (asImageToVideoPrompt requires one); the grokVideo
      // adapter forwards it to the Imagine endpoint as the start frame.
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: grokVideo('grok-imagine-video-1.5'),
        prompt: asImageToVideoPrompt(data.prompt),
        size: '16:9_720p',
        duration: 5,
      })
    }
    case 'fal-ai/ltx-2.3/image-to-video/fast': {
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: falVideo('fal-ai/ltx-2.3/image-to-video/fast'),
        prompt: asImageToVideoPrompt(data.prompt),
        size: '16:9_2160p',
      })
    }
    // Gemini Omni Flash (Interactions API, GEMINI_API_KEY). One model
    // serves both UI entries; it accepts text, image, AND video prompt
    // parts (sent as interaction content blocks: images, then videos,
    // then text). Clips are 3–10s at 720p (default 10s when `duration`
    // is omitted); `size` is the output aspect ratio. Passing
    // `previous_interaction_id` chains a prompt onto a prior generation
    // for conversational editing.
    case 'gemini-omni-flash-preview':
    case 'gemini-omni-flash-preview/image-to-video': {
      const prompt = asOmniPrompt(data.prompt)
      if (
        data.model.endsWith('/image-to-video') &&
        !data.previousInteractionId &&
        (typeof prompt === 'string' ||
          !prompt.some((part) => part.type === 'image'))
      ) {
        throw new Error('Start image is required for image-to-video')
      }
      const { duration, aspectRatio, task } = data.omniOptions ?? {}
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter: geminiVideo('gemini-omni-flash-preview'),
        prompt,
        size: aspectRatio ?? '16:9',
        ...(duration !== undefined ? { duration } : {}),
        ...(data.previousInteractionId || task
          ? {
              modelOptions: {
                ...(data.previousInteractionId
                  ? { previous_interaction_id: data.previousInteractionId }
                  : {}),
                ...(task
                  ? { generation_config: { video_config: { task } } }
                  : {}),
              },
            }
          : {}),
      })
    }
    // OpenRouter's dedicated async video API (`POST /api/v1/videos`). Unlike
    // fal (which takes duration in `modelOptions`), OpenRouter types the
    // top-level `duration` per model from its published metadata, and the
    // adapter exposes `snapDuration()` to coerce a raw UI seconds value to
    // the model's nearest supported duration.
    case 'bytedance/seedance-2.0': {
      const adapter = openRouterVideo('bytedance/seedance-2.0')
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter,
        prompt: asTextPrompt(data.prompt),
        size: '1280x720',
        duration: adapter.snapDuration(7),
        modelOptions: { aspectRatio: '16:9' },
      })
    }
    case 'google/veo-3.1': {
      const adapter = openRouterVideo('google/veo-3.1')
      return generateVideo({
        stream: true,
        pollingInterval: VIDEO_POLL_INTERVAL_MS,
        adapter,
        prompt: asImageToVideoPrompt(data.prompt),
        size: '1280x720',
        duration: adapter.snapDuration(7),
      })
    }
    default:
      throw new Error(`Unknown video model: ${data.model}`)
  }
}

/**
 * Streams one video generation as Server-Sent Events. `useGenerateVideo`
 * takes this straight as its `fetcher`: the client parses the SSE body it
 * returns, so the job id, every status update and the final url all arrive on
 * the one request — no client-side polling loop and no job ids to thread
 * through the UI.
 */
export const generateVideoFn = createServerFn({ method: 'POST' })
  .inputValidator((data: VideoRequest) => {
    if (!hasPromptContent(data.prompt)) throw new Error('Prompt is required')
    if (!data.model) throw new Error('Model is required')
    return data
  })
  // A rejected model / missing start frame throws out of `videoStreamForModel`
  // before any stream exists, which surfaces as a plain server-function error
  // (the hook reports it through `error`) rather than a stream that opens only
  // to fail.
  .handler(({ data }) => toServerSentEventsResponse(videoStreamForModel(data)))

// ============================================================================
// Seedance Studio — BytePlus ModelArk direct (ARK_API_KEY, server-side only)
// ============================================================================

/**
 * The tiers a model accepts. `resolveBytePlusVideoResolution` is the package's
 * exported gate for exactly this decision — it throws on a tier the model does
 * not offer — so probing it keeps one source of truth for a matrix that is
 * neither uniform nor guessable (there is no 2K tier anywhere, and 4k exists
 * only on `dreamina-seedance-2-0-260128`).
 */
function acceptedResolutions(
  model: BytePlusVideoModel,
): Array<BytePlusVideoResolution> {
  const accepted = SEEDANCE_RESOLUTION_TIERS.filter((tier) => {
    try {
      resolveBytePlusVideoResolution(model, tier)
      return true
    } catch {
      return false
    }
  })

  // Using a throw as the predicate means *any* change to that function's
  // contract reads as "no tier is supported". Every Seedance model offers at
  // least 480p and 720p, so an empty list is drift, not a real answer —
  // without this the Studio would silently fall back to a hardcoded '720p'
  // and build requests on a guess. The route has an errorComponent for
  // exactly this.
  if (accepted.length === 0) {
    throw new Error(
      `Seedance capability probe returned no resolution tiers for "${model}". ` +
        `resolveBytePlusVideoResolution's contract has probably changed — the ` +
        `Studio's controls cannot be built from this.`,
    )
  }
  return accepted
}

/**
 * Per-model capability table for the Seedance Studio, read out of the adapter
 * package on the server. No API key is involved: these are static metadata
 * lookups, not calls to Ark.
 */
export const getSeedanceCapabilitiesFn = createServerFn({
  method: 'GET',
}).handler(
  (): Array<SeedanceCapability> =>
    BYTEPLUS_VIDEO_MODELS.map((model) => {
      const durations = getBytePlusVideoDurationOptions(model)
      if (durations.kind !== 'range') {
        throw new Error(
          `Expected a duration range for ${model}, got "${durations.kind}"`,
        )
      }
      return {
        model,
        resolutions: acceptedResolutions(model),
        duration: {
          min: durations.min,
          max: durations.max,
          step: durations.step ?? 1,
        },
        supportsLastFrame: supportsLastFrame(model),
        supportsReferenceMedia: supportsReferenceMedia(model),
      }
    }),
)

/** What the studio sends for one Seedance generation. */
interface SeedanceRequest {
  prompt: MediaPrompt
  // Open by design: the studio's advanced field takes an id this package
  // has no metadata for, which the adapter forwards ungated for Ark to judge.
  model: BytePlusVideoModelOrString
  options?: SeedanceJobOptions
}

/**
 * Ceiling on how long the server will sit on a Seedance task. Generous
 * because the flex tier is an offline batch queue where a task routinely
 * waits many minutes before it even starts.
 */
const SEEDANCE_MAX_DURATION_MS = 30 * 60_000
/** Seedance tasks are slow; polling faster only burns Ark quota. */
const SEEDANCE_POLL_INTERVAL_MS = 5000

/** The create → poll → complete lifecycle for one Seedance task. */
function seedanceStream(data: SeedanceRequest): AsyncIterable<StreamChunk> {
  const options = data.options ?? {}

  // The studio's camelCase controls map one-to-one onto the provider's own
  // request fields. Applicability is per model and Ark 400s on a field the
  // model doesn't take (it does not ignore it), so the client only sends
  // what the selected model accepts — see `SEEDANCE_MODELS` in lib/seedance.
  //
  // `ratio` / `resolution` are typed against the tiers this package knows,
  // so a custom model id sends its sizing through the generic `size`
  // template instead (see `SeedanceJobOptions.size`).
  const modelOptions: BytePlusVideoProviderOptions = {
    ...(options.size === undefined &&
      options.ratio !== undefined && { ratio: options.ratio }),
    ...(options.size === undefined &&
      options.resolution !== undefined && {
        resolution: options.resolution,
      }),
    // `-1` (let the model choose the length) is only reachable through
    // provider options: the generic `duration` gets snapped into range.
    ...(options.duration === -1 && { duration: -1 }),
    ...(options.frames !== undefined && { frames: options.frames }),
    ...(options.seed !== undefined && { seed: options.seed }),
    ...(options.watermark !== undefined && { watermark: options.watermark }),
    ...(options.generateAudio !== undefined && {
      generate_audio: options.generateAudio,
    }),
    ...(options.cameraFixed !== undefined && {
      camera_fixed: options.cameraFixed,
    }),
    ...(options.serviceTier !== undefined && {
      service_tier: options.serviceTier,
    }),
    ...(options.draft !== undefined && { draft: options.draft }),
    ...(options.priority !== undefined && { priority: options.priority }),
  }

  // `frames` takes precedence over `duration` server-side, so never send
  // both; `-1` already went through modelOptions above.
  const duration =
    options.frames === undefined &&
    options.duration !== undefined &&
    options.duration > 0
      ? options.duration
      : undefined

  return generateVideo({
    // For a model this package knows, the adapter snaps `duration` into its
    // range and validates the resolution tier, prompt roles and
    // frame/reference exclusivity before anything reaches Ark. For a custom
    // id every one of those guards is off by design: the duration goes
    // through verbatim and Ark is the authority.
    adapter: byteplusVideo(data.model),
    // Passed through un-narrowed, unlike the other generators: Seedance's
    // reference mode takes video and audio parts as well as images (the
    // template presets send both), and which of them a given model allows is
    // the adapter's call — its error names the model and the part.
    prompt: data.prompt,
    ...(options.size !== undefined && { size: options.size }),
    ...(duration !== undefined && { duration }),
    modelOptions,
    stream: true,
    pollingInterval: SEEDANCE_POLL_INTERVAL_MS,
    maxDuration: SEEDANCE_MAX_DURATION_MS,
  })
}

/**
 * Streams one Seedance task as Server-Sent Events, for the studio's
 * `useGenerateVideo`. The browser never sees ARK_API_KEY or a job id it has
 * to poll with — the server does the waiting and reports status on the wire.
 */
export const generateSeedanceVideoFn = createServerFn({ method: 'POST' })
  .inputValidator((data: SeedanceRequest) => {
    if (!hasPromptContent(data.prompt)) throw new Error('Prompt is required')
    if (!data.model) throw new Error('Model is required')
    return data
  })
  .handler(({ data }) => toServerSentEventsResponse(seedanceStream(data)))
