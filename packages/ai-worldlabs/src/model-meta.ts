/**
 * World Labs Marble model ids for `worldlabsWorld('marble-1.1')`.
 */

export const WORLDLABS_WORLD_MODELS = [
  'marble-1.1-plus',
  'marble-1.1',
  'marble-1.0',
  'marble-1.0-draft',
] as const

export type WorldLabsWorldModel = (typeof WORLDLABS_WORLD_MODELS)[number]

export function isWorldLabsWorldModel(
  model: string,
): model is WorldLabsWorldModel {
  return (WORLDLABS_WORLD_MODELS as ReadonlyArray<string>).includes(model)
}

export interface WorldLabsMediaRef {
  /** Public URL for the media. */
  uri?: string
  /** Id from a previous media-asset upload. */
  mediaAssetId?: string
  /** Base64-encoded file bytes. */
  dataBase64?: string
  /** File extension without a dot, used with `dataBase64`. */
  extension?: string
}

export interface WorldLabsLocatedImageRef extends WorldLabsMediaRef {
  /** Horizontal angle in degrees. 0 is front, 90 is right, 180 is back. */
  azimuth?: number
}

/**
 * Provider options for World Labs world generation.
 *
 * `createWorld` sends these on the generate request. Image, multi-image, and
 * video inputs select the matching World Labs prompt type. Text-only calls
 * use `generateWorld({ prompt })`.
 */
export interface WorldLabsWorldProviderOptions {
  /** Optional title stored on the world. Max 64 characters. */
  displayName?: string
  /** Random seed for generation. */
  seed?: number
  /** Optional tags. Max 10 tags, each up to 32 characters. */
  tags?: Array<string>
  /** If true, use the text prompt as-is without recaptioning. */
  disableRecaption?: boolean
  /**
   * How to treat a single image as a panorama. `auto` detects equirectangular
   * panos. `true` always treats the image as a pano. `false` treats it as a
   * standard image.
   */
  isPano?: 'auto' | true | false
  /** Single image input. Do not combine with `images` or `video`. */
  image?: WorldLabsMediaRef
  /** Multiple images of the same scene. Do not combine with `image` or `video`. */
  images?: Array<WorldLabsLocatedImageRef>
  /** Video input. Do not combine with `image` or `images`. */
  video?: WorldLabsMediaRef
  /** World visibility. Default is private. */
  permission?: {
    public?: boolean
  }
  /**
   * When false, return after the generate call with `status: 'waiting'` and
   * `operationId`. Default is true: poll until the world is ready.
   */
  wait?: boolean
  /** Poll interval in milliseconds when `wait` is true. Default 2000. */
  pollIntervalMs?: number
}

export type WorldLabsWorldModelProviderOptionsByName = {
  [M in WorldLabsWorldModel]: WorldLabsWorldProviderOptions
}
