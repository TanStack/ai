import { assertOwnFileSource, isFileSource } from '@tanstack/ai'
import { FAL_IMAGE_FIELD_OVERRIDES } from './generated/image-field-overrides'
import type {
  FalImageFieldName,
  FalImageFieldOverride,
} from './generated/image-field-overrides'
import type {
  ContentPartSource,
  ImagePart,
  MediaInputMetadata,
} from '@tanstack/ai'
import type { FalModel, FalModelInput } from '../model-meta'

/**
 * Convert a content source into a URL string for fal's URL-based input fields.
 * URL sources pass through; fal storage handles (a storage URL) pass through
 * after a provider check; base64 data becomes a `data:<mime>;base64,<value>`
 * URI which fal endpoints accept on the wire.
 */
export function contentSourceToFalUrl(source: ContentPartSource): string {
  if (isFileSource(source)) {
    assertOwnFileSource(source, 'fal')
    return source.value
  }
  if (source.type === 'url') return source.value
  return `data:${source.mimeType};base64,${source.value}`
}

/**
 * The image-conditioning fields the mappers may set, narrowed to the ones
 * that actually exist on the given endpoint's input type. For endpoints
 * unknown to the installed `@fal-ai/client` this widens to all known field
 * names.
 */
export type FalImageInputFields<TModel extends string> = Partial<
  Pick<
    FalModelInput<TModel>,
    Extract<keyof FalModelInput<TModel>, FalImageFieldName>
  >
>

/**
 * Default field per routing role. Endpoint-specific deviations live in the
 * generated `FAL_IMAGE_FIELD_OVERRIDES` map (regenerate with
 * `pnpm generate:fal-image-fields`); these defaults must stay in sync with
 * `DEFAULTS` in scripts/generate-fal-image-field-map.ts.
 */
const DEFAULT_FIELDS = {
  single: 'image_url',
  multi: 'image_urls',
  mask: 'mask_url',
  control: 'control_image_url',
  reference: 'reference_image_urls',
  start: 'start_image_url',
  end: 'end_image_url',
} satisfies Required<FalImageFieldOverride>

/**
 * Field names that accept an array of images. The generator asserts the
 * SDK types agree with this set, so wrap-vs-scalar decisions stay correct.
 */
const LIST_FIELDS = new Set<string>([
  'image_urls',
  'input_image_urls',
  'ref_image_urls',
  'reference_image_urls',
])

/** Resolve the per-role field names for a model: defaults + generated overrides. */
function fieldSpecFor(model: string): Required<FalImageFieldOverride> {
  const overrides = (
    FAL_IMAGE_FIELD_OVERRIDES as Record<string, FalImageFieldOverride>
  )[model]
  return { ...DEFAULT_FIELDS, ...overrides }
}

/**
 * Assign URLs to a field, wrapping or unwrapping based on whether the field
 * takes an array. When two roles resolve to the same list field (e.g.
 * sources and references both land on `image_urls` for nano-banana edit)
 * the values are merged in assignment order; two roles resolving to the
 * same scalar field is ambiguous and throws. Throws when multiple images
 * target a scalar field.
 */
function assignField(
  fields: Record<string, unknown>,
  field: string,
  urls: Array<string>,
  model: string,
  what: string,
): void {
  if (urls.length === 0) return
  const existing = fields[field]
  if (LIST_FIELDS.has(field)) {
    fields[field] = Array.isArray(existing) ? [...existing, ...urls] : urls
  } else if (existing !== undefined) {
    throw new Error(
      `fal: multiple inputs map to '${field}' on model ${model}. Drop one of the conflicting inputs or pass the field explicitly via modelOptions.`,
    )
  } else if (urls.length === 1) {
    fields[field] = urls[0]
  } else {
    throw new Error(
      `fal: model ${model} accepts a single ${what} image via '${field}' (received ${urls.length}).`,
    )
  }
}

interface RoleBuckets {
  sources: Array<string>
  masks: Array<string>
  controls: Array<string>
  references: Array<string>
  starts: Array<string>
  ends: Array<string>
}

function bucketByRole(
  imageInputs: ReadonlyArray<ImagePart<MediaInputMetadata>>,
): RoleBuckets {
  const buckets: RoleBuckets = {
    sources: [],
    masks: [],
    controls: [],
    references: [],
    starts: [],
    ends: [],
  }
  for (const part of imageInputs) {
    const url = imagePartToUrl(part)
    const role = part.metadata?.role
    if (role === 'mask') buckets.masks.push(url)
    else if (role === 'control') buckets.controls.push(url)
    else if (role === 'reference' || role === 'character')
      buckets.references.push(url)
    else if (role === 'start_frame') buckets.starts.push(url)
    else if (role === 'end_frame') buckets.ends.push(url)
    else buckets.sources.push(url)
  }
  return buckets
}

/**
 * Map the prompt's image parts onto fal.ai image-endpoint fields.
 *
 * fal endpoints use different field names for image-conditioned generation
 * (~80% use `image_url` for single; the rest use `image_urls`,
 * `reference_image_urls`, `mask_url`, `control_image_url`, etc.). Field
 * names are resolved per endpoint from the generated
 * `FAL_IMAGE_FIELD_OVERRIDES` map (derived from the fal SDK's endpoint
 * types), falling back to the defaults above for endpoints the installed
 * SDK doesn't know:
 *
 * - parts with `metadata.role === 'mask'`      → spec.mask      (single)
 * - parts with `metadata.role === 'control'`   → spec.control   (single)
 * - `role === 'reference' | 'character'`       → spec.reference
 * - `role === 'start_frame' | 'end_frame'`     → treated as sources (frame
 *   roles only apply to video generation)
 * - remaining parts                            → spec.single / spec.multi
 *
 * Users can always override the resulting field shape via `modelOptions`
 * (spread before these fields), or pass everything through `modelOptions`
 * directly when the mapping doesn't match an obscure endpoint.
 */
export function mapImageInputsToFalFields<TModel extends FalModel>(
  model: TModel,
  imageInputs?: ReadonlyArray<ImagePart<MediaInputMetadata>>,
): FalImageInputFields<TModel> {
  if (!imageInputs || imageInputs.length === 0) return {}

  const spec = fieldSpecFor(model)
  const { sources, masks, controls, references, starts, ends } =
    bucketByRole(imageInputs)
  // Frame roles aren't meaningful for image generation; treat as the
  // primary source. The video mapper handles start/end framing.
  const allSources = [...sources, ...starts, ...ends]

  if (masks.length > 1) {
    throw new Error(
      `fal: only one input with metadata.role === 'mask' is supported per request (received ${masks.length}).`,
    )
  }
  if (controls.length > 1) {
    throw new Error(
      `fal: only one input with metadata.role === 'control' is supported per request (received ${controls.length}).`,
    )
  }

  const fields: Record<string, unknown> = {}
  const sourceField = allSources.length > 1 ? spec.multi : spec.single
  assignField(fields, sourceField, allSources, model, 'source')
  assignField(fields, spec.reference, references, model, 'reference')
  assignField(fields, spec.mask, masks, model, 'mask')
  assignField(fields, spec.control, controls, model, 'control')

  return fields as FalImageInputFields<TModel>
}

/**
 * Map the prompt's image parts onto fal.ai video-endpoint fields.
 *
 * Video endpoints often expose a start frame as `image_url` (76% of i2v
 * models) plus an optional `end_image_url`. Multi-reference video models
 * (Kling O3, Seedance reference-to-video) use `reference_image_urls` or
 * `image_urls`. Field names resolve through the same generated override
 * map as the image mapper — e.g. `role: 'start_frame'` lands on `image_url`
 * for Kling/Veo image-to-video and `first_frame_url` for Pixverse. Mapping:
 *
 * - `metadata.role === 'start_frame'`              → spec.start
 * - `metadata.role === 'end_frame'`                → spec.end
 * - `metadata.role === 'reference' | 'character'`  → spec.reference
 * - `metadata.role === 'mask' | 'control'`         → throws (no video routing)
 * - remaining parts (no role)                      → spec.single / spec.multi
 */
export function mapImageInputsToFalVideoFields<TModel extends FalModel>(
  model: TModel,
  imageInputs?: ReadonlyArray<ImagePart<MediaInputMetadata>>,
): FalImageInputFields<TModel> {
  if (!imageInputs || imageInputs.length === 0) return {}

  const spec = fieldSpecFor(model)
  const { sources, masks, controls, references, starts, ends } =
    bucketByRole(imageInputs)
  // Mask / control roles have no video-specific routing; silently repurposing
  // them as source frames would hide the problem, so reject them instead.
  if (masks.length > 0 || controls.length > 0) {
    const role = masks.length > 0 ? 'mask' : 'control'
    throw new Error(
      `fal: metadata.role === '${role}' is not supported for video generation on model ${model}. ` +
        `Remove the role or pass the field explicitly via modelOptions.`,
    )
  }

  if (starts.length > 1) {
    throw new Error(
      `fal: only one input with metadata.role === 'start_frame' is supported (received ${starts.length}).`,
    )
  }
  if (ends.length > 1) {
    throw new Error(
      `fal: only one input with metadata.role === 'end_frame' is supported (received ${ends.length}).`,
    )
  }

  const fields: Record<string, unknown> = {}
  const sourceField = sources.length > 1 ? spec.multi : spec.single
  assignField(fields, sourceField, sources, model, 'source')
  assignField(fields, spec.reference, references, model, 'reference')
  // Frame roles assign last: when an endpoint routes the start frame to its
  // generic source field (e.g. Kling image-to-video) and an unroled source
  // was also provided, assignField rejects the ambiguous combination.
  assignField(fields, spec.start, starts, model, 'start frame')
  assignField(fields, spec.end, ends, model, 'end frame')

  return fields as FalImageInputFields<TModel>
}

/**
 * Convert a TanStack ImagePart into a string suitable for fal's URL-based
 * input fields.
 */
function imagePartToUrl(part: ImagePart<MediaInputMetadata>): string {
  return contentSourceToFalUrl(part.source)
}
