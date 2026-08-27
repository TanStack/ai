/** How generated images come back. `url` links expire 24 hours after generation. */
export type BytePlusImageResponseFormat = 'url' | 'b64_json'

/** File format of the generated image. Seedream 5.0 family only. */
export type BytePlusImageOutputFormat = 'png' | 'jpeg'

export type BytePlusSequentialImageGeneration = 'auto' | 'disabled'

/** Group-image bounds. Only read when `sequential_image_generation` is `auto`. */
export interface BytePlusSequentialImageGenerationOptions {
  /** Upper bound on images returned for this request. Range `[1, 15]`. */
  max_images?: number
}

/** Prompt-rewriting configuration. Seedream 5.0-lite / 4.5 / 4.0 only. */
export interface BytePlusOptimizePromptOptions {
  mode: 'standard' | 'fast'
}

export interface BytePlusImageGenerationRequest {
  /** Seedream model id (or a preconfigured endpoint id). */
  model: string

  prompt: string

  image?: Array<string>

  size?: string

  /** Defaults to `url` server-side. */
  response_format?: BytePlusImageResponseFormat

  output_format?: BytePlusImageOutputFormat

  watermark?: boolean

  /** Defaults to `disabled` server-side. */
  sequential_image_generation?: BytePlusSequentialImageGeneration

  /** Only effective when `sequential_image_generation` is `auto`. */
  sequential_image_generation_options?: BytePlusSequentialImageGenerationOptions

  /** Prompt-rewriting configuration. */
  optimize_prompt_options?: BytePlusOptimizePromptOptions

  stream?: boolean
}

export interface BytePlusImageData {
  url?: string
  b64_json?: string
  size?: string
  error?: BytePlusImageErrorObject
}

export interface BytePlusImageUsage {
  generated_images?: number
  output_tokens?: number
  total_tokens?: number
}

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
