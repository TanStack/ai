import { BYTEPLUS_IMAGE_MAX_REFERENCE_IMAGES } from '../model-meta'
import type {
  BytePlusImageOutputFormat,
  BytePlusImageResponseFormat,
  BytePlusOptimizePromptOptions,
  BytePlusSequentialImageGeneration,
  BytePlusSequentialImageGenerationOptions,
} from './wire-types'
import type { BytePlusImageModel, BytePlusImageSize } from '../model-meta'

export const BYTEPLUS_IMAGE_MAX_PROMPT_WORDS = 600

export const BYTEPLUS_IMAGE_MAX_SEQUENTIAL_IMAGES = 15

export const BYTEPLUS_OUTPUT_FORMAT_IMAGE_MODELS: ReadonlyArray<BytePlusImageModel> =
  [
    'dola-seedream-5-0-pro-260628',
    'seedream-5-0-260128',
    'seedream-5-0-lite-260128',
  ]

export interface BytePlusImageBaseProviderOptions {
  response_format?: BytePlusImageResponseFormat

  watermark?: boolean

  sequential_image_generation?: BytePlusSequentialImageGeneration

  /** Bounds for group-image mode. Only read when the mode is `auto`. */
  sequential_image_generation_options?: BytePlusSequentialImageGenerationOptions

  optimize_prompt_options?: BytePlusOptimizePromptOptions
}

export interface BytePlusSeedream5ImageProviderOptions extends BytePlusImageBaseProviderOptions {
  output_format?: BytePlusImageOutputFormat
}

export type BytePlusImageProviderOptions = BytePlusSeedream5ImageProviderOptions

export type BytePlusImageModelProviderOptionsByName = {
  'dola-seedream-5-0-pro-260628': BytePlusSeedream5ImageProviderOptions
  'seedream-5-0-260128': BytePlusSeedream5ImageProviderOptions
  'seedream-5-0-lite-260128': BytePlusSeedream5ImageProviderOptions
  'seedream-4-5-251128': BytePlusImageBaseProviderOptions
  'seedream-4-0-250828': BytePlusImageBaseProviderOptions
}

export type BytePlusImageModelInputModalitiesByName = {
  [K in BytePlusImageModel]: readonly ['image']
}

export type ParsedBytePlusImageSize =
  | { kind: 'token'; value: '1K' | '2K' | '4K' }
  | { kind: 'pixels'; width: number; height: number }

const SIZE_TOKENS = ['1K', '2K', '4K'] as const

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
    const hasPositivePixels = width > 0 && height > 0
    if (hasPositivePixels) return { kind: 'pixels', width, height }
  }

  return undefined
}

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
