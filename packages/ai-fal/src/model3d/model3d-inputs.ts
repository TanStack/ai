import { resolveMediaPrompt } from '@tanstack/ai'
import {
  contentSourceToFalUrl,
  mapImageInputsToFalFields,
} from '../image/image-inputs'
import { FAL_MESH_FIELD_MAP } from './generated/mesh-field-overrides'
import type { FalImageFieldName } from '../image/generated/image-field-overrides'
import type {
  ImagePart,
  MediaInputMetadata,
  MediaPrompt,
  Model3dPart,
} from '@tanstack/ai'
import type { EndpointTypeMap } from '@fal-ai/client/endpoints'
import type { FalMeshFieldName } from './generated/mesh-field-overrides'
import type {
  Fal3dKnownModel,
  Fal3dModel,
  Fal3dTextFieldName,
} from '../model-meta'

/**
 * How a known 3D endpoint takes the text and image parts of a prompt.
 *
 * - `text`: the input field for the prompt text, or `null` when the endpoint
 *   takes no text.
 * - `image`: the image fields of the endpoint. The generated image field map
 *   routes the image parts, and a part that lands on another field throws.
 *   `'image_style_url'` for Meshy retexture (one style image), or `null`
 *   when the endpoint takes no image parts (for example multi-view
 *   endpoints, which take their views through `modelOptions`).
 */
type Fal3dPromptFields<TInput> = {
  text: Extract<keyof TInput, Fal3dTextFieldName> extends never
    ? null
    : Extract<keyof TInput, Fal3dTextFieldName>
  image: Extract<keyof TInput, FalImageFieldName> extends never
    ? Extract<keyof TInput, 'image_style_url'> extends never
      ? null
      : 'image_style_url'
    : ReadonlyArray<Extract<keyof TInput, FalImageFieldName>>
}

type Fal3dImageRouting =
  | ReadonlyArray<FalImageFieldName>
  | 'image_style_url'
  | null

/**
 * The prompt fields of every known 3D endpoint. The `satisfies` clause checks
 * each entry against the endpoint input type of the installed SDK, so a wrong
 * or missing entry is a compile error.
 */
const FAL_3D_PROMPT_FIELDS = {
  'fal-ai/hunyuan3d/v2': { text: null, image: ['input_image_url'] },
  'fal-ai/hunyuan3d/v2/turbo': { text: null, image: ['input_image_url'] },
  'fal-ai/hunyuan3d/v2/mini': { text: null, image: ['input_image_url'] },
  'fal-ai/hunyuan3d/v2/mini/turbo': { text: null, image: ['input_image_url'] },
  'fal-ai/hunyuan3d/v2/multi-view': { text: null, image: null },
  'fal-ai/hunyuan3d/v2/multi-view/turbo': { text: null, image: null },
  'fal-ai/hunyuan3d-v3/image-to-3d': { text: null, image: ['input_image_url'] },
  'fal-ai/hunyuan3d-v3/text-to-3d': { text: 'prompt', image: null },
  'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d': {
    text: null,
    image: ['input_image_url'],
  },
  'fal-ai/hunyuan-3d/v3.1/pro/text-to-3d': { text: 'prompt', image: null },
  'fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d': {
    text: null,
    image: ['input_image_url'],
  },
  'fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d': { text: 'prompt', image: null },
  'fal-ai/hyper3d/rodin': { text: 'prompt', image: ['input_image_urls'] },
  'fal-ai/hyper3d/rodin/v2': { text: 'prompt', image: ['input_image_urls'] },
  'fal-ai/meshy/v6/image-to-3d': { text: null, image: ['image_url'] },
  'fal-ai/meshy/v6/text-to-3d': { text: 'prompt', image: null },
  'fal-ai/meshy/v6-preview/text-to-3d': { text: 'prompt', image: null },
  'meshy/v7.1/image-to-3d': { text: null, image: ['image_url'] },
  'meshy/v7.1/multi-image-to-3d': { text: null, image: ['image_urls'] },
  'meshy/v7.1/text-to-3d': { text: 'prompt', image: null },
  'meshy/v7/retexture': {
    text: 'text_style_prompt',
    image: 'image_style_url',
  },
  'fal-ai/trellis': { text: null, image: ['image_url'] },
  'fal-ai/trellis/multi': { text: null, image: ['image_urls'] },
  'fal-ai/trellis-2': { text: null, image: ['image_url'] },
  'fal-ai/trellis-2/retexture': { text: null, image: ['image_url'] },
  'tripo3d/tripo/v2.5/image-to-3d': { text: null, image: ['image_url'] },
  'tripo3d/tripo/v2.5/multiview-to-3d': { text: null, image: null },
  'tripo3d/tripo/remesh': { text: null, image: null },
  'fal-ai/sam-3/3d-objects': { text: 'prompt', image: ['image_url'] },
  'fal-ai/sam-3/3d-body': { text: null, image: ['image_url', 'mask_url'] },
} as const satisfies {
  [K in Fal3dKnownModel]: Fal3dPromptFields<EndpointTypeMap[K]['input']>
}

/** The same tables, readable with any endpoint id. */
const PROMPT_FIELDS_BY_ENDPOINT: Partial<
  Record<
    string,
    {
      text: Fal3dTextFieldName | null
      image: Fal3dImageRouting
    }
  >
> = FAL_3D_PROMPT_FIELDS
const MESH_FIELD_BY_ENDPOINT: Partial<Record<string, FalMeshFieldName>> =
  FAL_MESH_FIELD_MAP

/**
 * The shared image mapper sends each part to the field of its role (for
 * example a second source image to `image_urls`, and a `reference` image to
 * `reference_image_urls`). A known endpoint ignores a field that it does not
 * have, so reject that case before submit.
 */
function rejectUnknownImageFields(
  model: string,
  fields: Record<string, unknown>,
  allowed: ReadonlyArray<string>,
) {
  const unknown = Object.keys(fields).filter(
    (field) => !allowed.includes(field),
  )
  if (unknown.length === 0) return
  const list = (names: ReadonlyArray<string>) =>
    names.map((name) => `'${name}'`).join(', ')
  throw new Error(
    `fal: model ${model} takes images only in ${list(allowed)}, not in ${list(unknown)}. Send one source image, or check the metadata.role of each image.`,
  )
}

function mapTextToFalField(model: string, text: string) {
  if (!text) return {}
  const known = PROMPT_FIELDS_BY_ENDPOINT[model]
  // An endpoint that the table does not know gets the common `prompt` field.
  if (!known) return { prompt: text }
  if (known.text === null) {
    throw new Error(
      `fal: model ${model} takes no text prompt. Remove the text from the prompt, or use an endpoint that takes text.`,
    )
  }
  return { [known.text]: text }
}

function mapImagesToFalFields(
  model: string,
  images: ReadonlyArray<ImagePart<MediaInputMetadata>>,
) {
  if (images.length === 0) return {}
  const known = PROMPT_FIELDS_BY_ENDPOINT[model]
  // An endpoint that the table does not know uses the generated image map.
  if (!known) return mapImageInputsToFalFields(model, images)
  const imageRouting = known.image
  if (imageRouting === null) {
    throw new Error(
      `fal: model ${model} takes no image prompt parts. Pass its image fields through modelOptions.`,
    )
  }
  if (imageRouting === 'image_style_url') {
    const [image, ...rest] = images
    if (!image || rest.length > 0) {
      throw new Error(
        `fal: model ${model} takes one style image (received ${images.length}).`,
      )
    }
    return { image_style_url: contentSourceToFalUrl(image.source) }
  }
  const fields = mapImageInputsToFalFields(model, images)
  rejectUnknownImageFields(model, fields, imageRouting)
  return fields
}

function mapMeshToFalField(model: string, meshes: ReadonlyArray<Model3dPart>) {
  if (meshes.length === 0) return {}
  const [mesh, ...rest] = meshes
  if (!mesh || rest.length > 0) {
    throw new Error(
      `fal: model ${model} takes one model3d prompt part (received ${meshes.length}).`,
    )
  }
  const meshField = MESH_FIELD_BY_ENDPOINT[model]
  if (!meshField) {
    throw new Error(
      `fal: model ${model} takes no model3d prompt part. Use an endpoint that takes a mesh, or pass the mesh field through modelOptions.`,
    )
  }
  return { [meshField]: contentSourceToFalUrl(mesh.source) }
}

/**
 * Map a 3D prompt onto the input fields of a fal 3D endpoint.
 *
 * - Text goes to the `prompt` field (`text_style_prompt` for Meshy
 *   retexture). It throws when the endpoint is known and takes no
 *   text, so the text is never dropped without a warning. An endpoint that
 *   is not known gets `prompt`.
 * - Image parts go through the generated image field map (for example
 *   `input_image_url` for Hunyuan3D v3, `image_urls` for TRELLIS multi).
 *   Meshy retexture takes one image in `image_style_url`. It throws when the endpoint is known and takes no image parts.
 * - One `model3d` part goes to the mesh field from the generated mesh field
 *   map (`model_url`, `mesh_url`, or `input_file_url`). It throws for a second
 *   mesh, and for an endpoint that has no mesh field.
 * - Video and audio parts throw, because no fal 3D endpoint takes them.
 *
 * Every image and mesh source goes through `contentSourceToFalUrl`, so URL,
 * `data:`, and fal file sources all work.
 *
 * @example
 * mapModel3dPromptToFalFields('fal-ai/trellis-2/retexture', [
 *   { type: 'model3d', source: { type: 'url', value: 'https://x/chair.glb' } },
 * ])
 * // { mesh_url: 'https://x/chair.glb' }
 */
export function mapModel3dPromptToFalFields(
  model: Fal3dModel,
  prompt: MediaPrompt,
) {
  const resolved = resolveMediaPrompt(prompt)
  const hasUnsupportedParts =
    resolved.videos.length > 0 || resolved.audios.length > 0
  if (hasUnsupportedParts) {
    throw new Error(
      `fal: model ${model} takes text, image, and model3d prompt parts only. Remove the video and audio parts.`,
    )
  }
  return {
    ...mapTextToFalField(model, resolved.text),
    ...mapImagesToFalFields(model, resolved.images),
    ...mapMeshToFalField(model, resolved.models3d),
  }
}
