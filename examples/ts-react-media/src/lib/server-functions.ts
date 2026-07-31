import { createServerFn } from '@tanstack/react-start'
import { falImage, falVideo } from '@tanstack/ai-fal'
import { geminiImage, geminiVideo } from '@tanstack/ai-gemini'
import { grokImage, grokVideo } from '@tanstack/ai-grok'
import {
  BYTEPLUS_VIDEO_MODELS,
  byteplusImage,
  byteplusVideo,
  getBytePlusVideoDurationOptions,
  resolveBytePlusVideoResolution,
  supportsLastFrame,
  supportsReferenceMedia,
} from '@tanstack/ai-byteplus'
import { generateImage, generateVideo, getVideoJobStatus } from '@tanstack/ai'

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
 * Resolves the video adapter for a UI model id. The native grok-imagine
 * entries hit xAI's Imagine API directly via the `grokVideo` adapter
 * (XAI_API_KEY); everything else is a fal-hosted model.
 */
function videoAdapterForModel(model: string) {
  if (model === 'grok-imagine-video') {
    return grokVideo('grok-imagine-video')
  }
  if (model === 'grok-imagine-video-1.5/image-to-video') {
    return grokVideo('grok-imagine-video-1.5')
  }
  if (model === 'dreamina-seedance-2-0-260128') {
    // BytePlus ModelArk Seedance task API (ARK_API_KEY).
    return byteplusVideo('dreamina-seedance-2-0-260128')
  }
  if (model.startsWith('gemini-omni-flash-preview')) {
    // Both UI entries (text-to-video and image-to-video) run on the one
    // Omni model over the Interactions API (GEMINI_API_KEY).
    return geminiVideo('gemini-omni-flash-preview')
  }
  return falVideo(model)
}

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

export const createVideoJobFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
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
    }) => {
      if (!hasPromptContent(data.prompt)) throw new Error('Prompt is required')
      if (!data.model) throw new Error('Model is required')
      return data
    },
  )
  .handler(async ({ data }) => {
    // Image-to-video models receive the start frame as a prompt part
    // (role: 'start_frame') — the fal adapter routes it to the endpoint's
    // start-image field. Text-to-video models take the text prompt only.
    switch (data.model) {
      // Text-to-video models
      case 'fal-ai/kling-video/v3/pro/text-to-video': {
        return generateVideo({
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
          adapter: grokVideo('grok-imagine-video'),
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
          adapter: byteplusVideo('dreamina-seedance-2-0-260128'),
          prompt: asTextPrompt(data.prompt),
          size: '16:9_720p',
          duration: 5,
        })
      }
      case 'fal-ai/ltx-2.3/text-to-video/fast': {
        return generateVideo({
          adapter: falVideo('fal-ai/ltx-2.3/text-to-video/fast'),
          prompt: asTextPrompt(data.prompt),
          size: '16:9_2160p',
        })
      }
      // Image-to-video models
      case 'fal-ai/kling-video/v3/pro/image-to-video': {
        return generateVideo({
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
          adapter: grokVideo('grok-imagine-video-1.5'),
          prompt: asImageToVideoPrompt(data.prompt),
          size: '16:9_720p',
          duration: 5,
        })
      }
      case 'fal-ai/ltx-2.3/image-to-video/fast': {
        return generateVideo({
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
      default:
        throw new Error(`Unknown video model: ${data.model}`)
    }
  })

export const getVideoStatusFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobId: string; model: string }) => data)
  .handler(async ({ data }) => {
    const adapter = videoAdapterForModel(data.model)
    return await getVideoJobStatus({
      adapter,
      jobId: data.jobId,
    })
  })

export const getVideoUrlFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobId: string; model: string }) => data)
  .handler(async ({ data }) => {
    const adapter = videoAdapterForModel(data.model)
    return await getVideoJobStatus({
      adapter,
      jobId: data.jobId,
    })
  })

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
  return SEEDANCE_RESOLUTION_TIERS.filter((tier) => {
    try {
      resolveBytePlusVideoResolution(model, tier)
      return true
    } catch {
      return false
    }
  })
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

export const createSeedanceJobFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      prompt: MediaPrompt
      // Open by design: the studio's advanced field takes an id this package
      // has no metadata for (Seedance 2.5 today), which the adapter forwards
      // ungated for Ark to judge.
      model: BytePlusVideoModelOrString
      options?: SeedanceJobOptions
    }) => {
      if (!hasPromptContent(data.prompt)) throw new Error('Prompt is required')
      if (!data.model) throw new Error('Model is required')
      return data
    },
  )
  .handler(async ({ data }) => {
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

    return await generateVideo({
      // For a model this package knows, the adapter snaps `duration` into its
      // range and validates the resolution tier, prompt roles and
      // frame/reference exclusivity before anything reaches Ark. For a custom
      // id every one of those guards is off by design: the duration goes
      // through verbatim and Ark is the authority.
      adapter: byteplusVideo(data.model),
      prompt: asImagePrompt(data.prompt),
      ...(options.size !== undefined && { size: options.size }),
      ...(duration !== undefined && { duration }),
      modelOptions,
    })
  })

export const getSeedanceJobFn = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { jobId: string; model: BytePlusVideoModelOrString }) => {
      if (!data.jobId) throw new Error('Job id is required')
      return data
    },
  )
  .handler(async ({ data }) => {
    const result = await getVideoJobStatus({
      adapter: byteplusVideo(data.model),
      jobId: data.jobId,
    })
    // `expiresAt` is a Date on the result; hand the browser an ISO string so
    // the shape crossing the server-function boundary is unambiguous.
    return {
      jobId: result.jobId,
      status: result.status,
      ...(result.url !== undefined && { url: result.url }),
      ...(result.error !== undefined && { error: result.error }),
      ...(result.expiresAt && { expiresAt: result.expiresAt.toISOString() }),
      ...(result.usage && { usage: result.usage }),
    }
  })
