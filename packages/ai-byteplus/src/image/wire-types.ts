/**
 * Wire types for the BytePlus Ark image endpoint (`POST /images/generations`).
 *
 * Hand-written minimal shapes covering only the fields this adapter sends and
 * reads. Provenance for every field is noted inline. Two sources:
 *
 * 1. The harvested OpenAPI 3.1 document for the `ark` service, action
 *    `ImageGenerations` (`x-updated-time: 2026-06-08`) — authoritative for
 *    field names, enum values, defaults and ranges.
 * 2. A live `seedream-4-0-250828` call against
 *    `https://ark.ap-southeast.bytepluses.com/api/v3` on 2026-07-31, which
 *    pinned the actual response shape.
 *
 * The endpoint deviates from OpenAI's `/images/generations` in three ways that
 * matter: there is no `n` parameter, `size` accepts a shorthand token as well
 * as `WxH`, and input images for editing ride along in a top-level `image`
 * field rather than a separate `/images/edits` endpoint.
 */

/** How generated images come back. `url` links expire 24 hours after generation. */
export type BytePlusImageResponseFormat = 'url' | 'b64_json'

/** File format of the generated image. Seedream 5.0 family only. */
export type BytePlusImageOutputFormat = 'png' | 'jpeg'

/**
 * Group-image ("sequential generation") switch.
 *
 * - `auto` — the model decides whether to return a set of related images and
 *   how many, bounded by `sequential_image_generation_options.max_images`.
 * - `disabled` — exactly one image.
 */
export type BytePlusSequentialImageGeneration = 'auto' | 'disabled'

/** Group-image bounds. Only read when `sequential_image_generation` is `auto`. */
export interface BytePlusSequentialImageGenerationOptions {
  /** Upper bound on images returned for this request. Range `[1, 15]`. */
  max_images?: number
}

/** Prompt-rewriting configuration. Seedream 5.0-lite / 4.5 / 4.0 only. */
export interface BytePlusOptimizePromptOptions {
  /**
   * `standard` produces higher-quality results but is slower; `fast` is
   * quicker with average quality (unsupported on Seedream 5.0-lite and 4.5).
   */
  mode: 'standard' | 'fast'
}

/**
 * Request body for `POST /images/generations`.
 *
 * `model` and `prompt` are the only required fields.
 */
export interface BytePlusImageGenerationRequest {
  /** Seedream model id (or a preconfigured endpoint id). */
  model: string

  /**
   * Instruction text. The BytePlus docs give the limit as 600 English words.
   * That ceiling is documentation-derived, not probe-confirmed.
   */
  prompt: string

  /**
   * Input images for image-conditioned generation (editing, reference-guided
   * generation, multi-reference composition). Each entry is either a publicly
   * reachable URL or a data URI of the form
   * `data:image/<format>;base64,<data>` — BytePlus requires `<format>` to be
   * **lowercase**. Typed as an array because that is the form the OpenAPI
   * schema documents.
   */
  image?: Array<string>

  /**
   * Output size, as either a shorthand token (`1K`, `2K`, `4K`) or explicit
   * pixel dimensions (`2048x2048`) — never a mix of the two. Defaults to
   * `2048x2048` server-side.
   */
  size?: string

  /** Defaults to `url` server-side. */
  response_format?: BytePlusImageResponseFormat

  /**
   * Generated file format. Only the Seedream 5.0 family accepts this; the
   * live 4.0 response carried no `output_format` at all. Defaults to `jpeg`.
   */
  output_format?: BytePlusImageOutputFormat

  /**
   * Whether to stamp an "AI generated" watermark in the bottom-right corner.
   *
   * **Defaults to `true`** — unlike most providers, BytePlus watermarks unless
   * you explicitly opt out with `watermark: false`.
   */
  watermark?: boolean

  /** Defaults to `disabled` server-side. */
  sequential_image_generation?: BytePlusSequentialImageGeneration

  /** Only effective when `sequential_image_generation` is `auto`. */
  sequential_image_generation_options?: BytePlusSequentialImageGenerationOptions

  /** Prompt-rewriting configuration. */
  optimize_prompt_options?: BytePlusOptimizePromptOptions

  /**
   * Server-sent-events mode, emitting each image as it finishes. Not used by
   * this adapter — `generateImage()` resolves a complete result, and the core
   * `stream: true` path chunks that result itself.
   */
  stream?: boolean
}

/**
 * One entry of the `data` array — either a generated image or, in group-image
 * mode, a per-image failure.
 *
 * `url` is present when `response_format` is `url`, `b64_json` when it is
 * `b64_json`. `size` is the *actual* pixel size the model produced (a `1K`
 * request came back as `1152x864` live), and is only returned by some models.
 * `error` is set instead of the image fields when that particular image of a
 * group failed (e.g. `OutputImageSensitiveContentDetected`) while others
 * succeeded.
 *
 * The OpenAPI document contradicts itself here, describing `data` items as a
 * nested `{error[], imagecontent[]}` wrapper; the live response is the flat
 * shape modeled below, so that is what this adapter reads.
 */
export interface BytePlusImageData {
  url?: string
  b64_json?: string
  size?: string
  error?: BytePlusImageErrorObject
}

/**
 * Usage block. BytePlus bills images, not input tokens: `total_tokens`
 * currently equals `output_tokens` because input tokens are not counted, and
 * `generated_images` counts only successful generations.
 */
export interface BytePlusImageUsage {
  generated_images?: number
  output_tokens?: number
  total_tokens?: number
}

/**
 * Ark error object. Codes are dotted strings for transport-level failures
 * (`InvalidEndpointOrModel.NotFound`) and bare identifiers for content
 * failures (`OutputImageSensitiveContentDetected`,
 * `InputTextSensitiveContentDetected`, `QuotaExceeded`).
 */
export interface BytePlusImageErrorObject {
  code?: string
  message?: string
}

/** Response body of `POST /images/generations`. */
export interface BytePlusImageGenerationResponse {
  model?: string
  /** Unix timestamp (seconds) of creation. */
  created?: number
  data?: Array<BytePlusImageData>
  usage?: BytePlusImageUsage
  /** Present when the request as a whole failed. */
  error?: BytePlusImageErrorObject
}
