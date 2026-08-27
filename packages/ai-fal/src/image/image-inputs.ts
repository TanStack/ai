import { FAL_IMAGE_FIELD_OVERRIDES } from './generated/image-field-overrides'
import type {
  FalImageFieldName,
  FalImageFieldOverride,
} from './generated/image-field-overrides'
import type { ImagePart, MediaInputMetadata } from '@tanstack/ai'
import type { FalModel, FalModelInput } from '../model-meta'

export type FalImageInputFields<TModel extends string> = Partial<
  Pick<
    FalModelInput<TModel>,
    Extract<keyof FalModelInput<TModel>, FalImageFieldName>
  >
>

const DEFAULT_FIELDS = {
  single: 'image_url',
  multi: 'image_urls',
  mask: 'mask_url',
  control: 'control_image_url',
  reference: 'reference_image_urls',
  start: 'start_image_url',
  end: 'end_image_url',
} satisfies Required<FalImageFieldOverride>

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
    else if (role === 'reference') buckets.references.push(url)
    else if (role === 'character') buckets.references.push(url)
    else if (role === 'start_frame') buckets.starts.push(url)
    else if (role === 'end_frame') buckets.ends.push(url)
    else buckets.sources.push(url)
  }
  return buckets
}

export function mapImageInputsToFalFields<TModel extends FalModel>(
  model: TModel,
  imageInputs?: ReadonlyArray<ImagePart<MediaInputMetadata>>,
): FalImageInputFields<TModel> {
  if (!imageInputs) return {}
  if (imageInputs.length === 0) return {}

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

export function mapImageInputsToFalVideoFields<TModel extends FalModel>(
  model: TModel,
  imageInputs?: ReadonlyArray<ImagePart<MediaInputMetadata>>,
): FalImageInputFields<TModel> {
  if (!imageInputs) return {}
  if (imageInputs.length === 0) return {}

  const spec = fieldSpecFor(model)
  const { sources, masks, controls, references, starts, ends } =
    bucketByRole(imageInputs)
  const hasUnsupportedVideoRoles = masks.length > 0 || controls.length > 0
  if (hasUnsupportedVideoRoles) {
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
  assignField(fields, spec.start, starts, model, 'start frame')
  assignField(fields, spec.end, ends, model, 'end frame')

  return fields as FalImageInputFields<TModel>
}

function imagePartToUrl(part: ImagePart<MediaInputMetadata>): string {
  if (part.source.type === 'url') return part.source.value
  return `data:${part.source.mimeType};base64,${part.source.value}`
}
