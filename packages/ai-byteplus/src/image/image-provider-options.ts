/**
 * Provider options and request validation for Seedream image generation.
 *
 * Field names, enums, defaults and ranges come from the harvested Ark
 * OpenAPI document for the `ImageGenerations` action; the Seedream 4.0
 * behaviour noted below was confirmed live on 2026-07-31.
 */
import { BYTEPLUS_IMAGE_MAX_REFERENCE_IMAGES } from '../model-meta'
import type {
  BytePlusImageOutputFormat,
  BytePlusImageResponseFormat,
  BytePlusOptimizePromptOptions,
  BytePlusSequentialImageGeneration,
  BytePlusSequentialImageGenerationOptions,
} from './wire-types'
import type { BytePlusImageModel, BytePlusImageSize } from '../model-meta'

/**
 * BytePlus documents a 600-word ceiling on the image prompt. Word-based, so
 * it is only meaningful for space-separated scripts — the check below never
 * fires for Chinese or Japanese text, which is the intended behaviour.
 */
export const BYTEPLUS_IMAGE_MAX_PROMPT_WORDS = 600

/**
 * Upper bound of `sequential_image_generation_options.max_images`, i.e. the
 * most images one request can return.
 */
export const BYTEPLUS_IMAGE_MAX_SEQUENTIAL_IMAGES = 15

/**
 * Models that accept `output_format`.
 *
 * The Ark OpenAPI document's field note claims 5.0-lite only, but its own
 * request demo sends `output_format` on `seedream-5-0-260128`, so the whole
 * 5.0 family is treated as supporting it. The Seedream 4.x snapshots are
 * documented as not reading it, so `output_format` is omitted from their
 * provider-options type — but, as with `sequential_image_generation`, it is
 * not gated at runtime: a value that reaches a model which does not read it
 * comes back as an Ark error rather than a local rejection.
 */
export const BYTEPLUS_OUTPUT_FORMAT_IMAGE_MODELS: ReadonlyArray<BytePlusImageModel> =
  [
    'dola-seedream-5-0-pro-260628',
    'seedream-5-0-260128',
    'seedream-5-0-lite-260128',
  ]

/**
 * Base provider options shared by every Seedream model.
 */
export interface BytePlusImageBaseProviderOptions {
  /**
   * Return images as expiring links (`url`, valid 24 hours) or inline base64
   * (`b64_json`).
   *
   * @default 'url'
   */
  response_format?: BytePlusImageResponseFormat

  /**
   * Whether to stamp an "AI generated" watermark in the bottom-right corner.
   *
   * **BytePlus defaults this to `true`.** Pass `false` for a clean image.
   */
  watermark?: boolean

  /**
   * Group-image mode. Set to `auto` to let the model return a set of related
   * images (bounded by {@link BytePlusImageBaseProviderOptions.sequential_image_generation_options}).
   * `generateImage()`'s `numberOfImages` sets this for you; an explicit value
   * here wins.
   *
   * Documented on Seedream 5.0-lite, 4.5 and 4.0. It is sent as given on
   * every model rather than gated locally — the shipped 5.0 ids post-date the
   * published parameter table, and an unsupported combination comes back as a
   * clear Ark error.
   *
   * @default 'disabled'
   */
  sequential_image_generation?: BytePlusSequentialImageGeneration

  /** Bounds for group-image mode. Only read when the mode is `auto`. */
  sequential_image_generation_options?: BytePlusSequentialImageGenerationOptions

  /**
   * Prompt-rewriting configuration. Documented on Seedream 5.0-lite, 4.5 and
   * 4.0; `mode: 'fast'` is unsupported on 5.0-lite and 4.5.
   */
  optimize_prompt_options?: BytePlusOptimizePromptOptions
}

/**
 * Provider options for the Seedream 5.0 family, which additionally chooses the
 * generated file format.
 */
export interface BytePlusSeedream5ImageProviderOptions extends BytePlusImageBaseProviderOptions {
  /**
   * File format of the generated image.
   *
   * @default 'jpeg'
   */
  output_format?: BytePlusImageOutputFormat
}

/**
 * Every Seedream provider option, used as the adapter's base option type.
 * Call sites are narrowed per model by
 * {@link BytePlusImageModelProviderOptionsByName}.
 */
export type BytePlusImageProviderOptions = BytePlusSeedream5ImageProviderOptions

/**
 * Type-only map from image model name to its provider options.
 */
export type BytePlusImageModelProviderOptionsByName = {
  'dola-seedream-5-0-pro-260628': BytePlusSeedream5ImageProviderOptions
  'seedream-5-0-260128': BytePlusSeedream5ImageProviderOptions
  'seedream-5-0-lite-260128': BytePlusSeedream5ImageProviderOptions
  'seedream-4-5-251128': BytePlusImageBaseProviderOptions
  'seedream-4-0-250828': BytePlusImageBaseProviderOptions
}

/**
 * Type-only map from image model name to the non-text prompt modalities it
 * accepts. Every shipped Seedream model takes reference images for
 * image-conditioned generation.
 */
export type BytePlusImageModelInputModalitiesByName = {
  [K in BytePlusImageModel]: readonly ['image']
}

/**
 * A parsed `size` value: either the shorthand token form or explicit pixels.
 */
export type ParsedBytePlusImageSize =
  | { kind: 'token'; value: '1K' | '2K' | '4K' }
  | { kind: 'pixels'; width: number; height: number }

const SIZE_TOKENS = ['1K', '2K', '4K'] as const

/**
 * Parses a Seedream `size` string. Accepts a shorthand token (case-insensitive
 * — `2k` normalizes to `2K`) or explicit `WIDTHxHEIGHT` pixels, and returns
 * `undefined` for anything else, including mixtures such as `2K x 1024`.
 */
export function parseBytePlusImageSize(
  size: string,
): ParsedBytePlusImageSize | undefined {
  const trimmed = size.trim()

  const token = SIZE_TOKENS.find(
    (candidate) => candidate.toLowerCase() === trimmed.toLowerCase(),
  )
  if (token) return { kind: 'token', value: token }

  // ASCII "x" only: the docs render the separator as U+00D7 (`2048×2048`),
  // which the API does not accept, so it must not slip through here either.
  const pixels = /^(\d+)[xX](\d+)$/.exec(trimmed)
  if (pixels) {
    const width = Number(pixels[1])
    const height = Number(pixels[2])
    if (width > 0 && height > 0) return { kind: 'pixels', width, height }
  }

  return undefined
}

/**
 * Validates the generic `size` option and returns the string to put on the
 * wire (`2K`, `2048x2048`), or `undefined` when no size was requested.
 *
 * This checks the *form* only. Which pixel dimensions a given model actually
 * accepts is not encoded here, so the message deliberately makes no per-model
 * claim; an out-of-range size is left to the API to reject.
 *
 * @throws Error when the value is neither a size token nor `WIDTHxHEIGHT`.
 */
export function resolveBytePlusImageSize(
  size: BytePlusImageSize | string | undefined,
): string | undefined {
  if (size === undefined) return undefined

  const parsed = parseBytePlusImageSize(size)
  if (!parsed) {
    throw new Error(
      `byteplus: size "${size}" is not a Seedream size. Use a size token ` +
        `(${SIZE_TOKENS.join(', ')}) or explicit pixels with an ASCII "x" ` +
        `("2048x2048") — never a mix of the two.`,
    )
  }

  return parsed.kind === 'token'
    ? parsed.value
    : `${parsed.width}x${parsed.height}`
}

/**
 * Validates the prompt text against BytePlus's documented limits.
 *
 * @throws Error when the prompt is empty or exceeds
 * {@link BYTEPLUS_IMAGE_MAX_PROMPT_WORDS} words.
 */
export function validateBytePlusImagePrompt(
  model: string,
  prompt: string,
): void {
  if (prompt.trim().length === 0) {
    throw new Error(
      `byteplus: model "${model}" requires prompt text. Seedream takes an ` +
        `instruction even when editing reference images.`,
    )
  }

  const words = prompt.trim().split(/\s+/).length
  if (words > BYTEPLUS_IMAGE_MAX_PROMPT_WORDS) {
    throw new Error(
      `byteplus: prompt is ${words} words; model "${model}" accepts at most ` +
        `${BYTEPLUS_IMAGE_MAX_PROMPT_WORDS}.`,
    )
  }
}

/**
 * Validates the reference-image count against the model's editing limit.
 *
 * A model this package has no limit for is left to Ark, deliberately and
 * explicitly. `model` is typed closed, but `wire-types.ts` documents that the
 * endpoint also accepts preconfigured endpoint ids (`ep-…`), so a JS caller
 * can reach an id that is not in the table. Reading `undefined` out of it and
 * comparing `count > undefined` — always false — would disable the guard by
 * accident and look identical to passing; the explicit early return says the
 * skip is intended.
 *
 * @throws Error when more references are supplied than a *known* model accepts.
 */
export function validateBytePlusReferenceImages(
  model: BytePlusImageModel,
  count: number,
): void {
  const max = BYTEPLUS_IMAGE_MAX_REFERENCE_IMAGES[model] as number | undefined
  if (max === undefined) return
  if (count > max) {
    throw new Error(
      `byteplus: model "${model}" accepts at most ${max} reference images; received ${count}.`,
    )
  }
}

/**
 * Maps the generic `numberOfImages` option onto Seedream's group-image
 * parameters.
 *
 * The endpoint has no `n`: more than one image per request is only reachable
 * through `sequential_image_generation: 'auto'`, where `max_images` is an
 * upper bound and the model decides how many images the prompt actually
 * warrants. A request for N images can therefore come back with fewer — the
 * one place BytePlus cannot honour `numberOfImages` exactly.
 *
 * @throws Error when the count is not an integer in `[1, 15]`.
 */
export function resolveBytePlusSequentialImages(
  model: string,
  numberOfImages: number | undefined,
): {
  sequential_image_generation?: BytePlusSequentialImageGeneration
  sequential_image_generation_options?: BytePlusSequentialImageGenerationOptions
} {
  if (numberOfImages === undefined) return {}

  if (
    !Number.isInteger(numberOfImages) ||
    numberOfImages < 1 ||
    numberOfImages > BYTEPLUS_IMAGE_MAX_SEQUENTIAL_IMAGES
  ) {
    throw new Error(
      `byteplus: numberOfImages must be a whole number between 1 and ` +
        `${BYTEPLUS_IMAGE_MAX_SEQUENTIAL_IMAGES} on model "${model}"; received ${numberOfImages}.`,
    )
  }

  if (numberOfImages === 1) return {}

  return {
    sequential_image_generation: 'auto',
    sequential_image_generation_options: { max_images: numberOfImages },
  }
}
