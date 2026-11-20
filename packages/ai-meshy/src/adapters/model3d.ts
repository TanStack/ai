import { BaseModel3DAdapter } from '@tanstack/ai/adapters'
import {
  fileReferenceFor,
  isFileSource,
  resolveMediaPrompt,
} from '@tanstack/ai'
import { MeshyApiError, createMeshyClient, mapMeshyStatus } from '../client'
import { MESHY_ENDPOINT_PATHS, MESHY_PROMPT_ROUTES } from '../model-meta'
import type {
  ContentPartSource,
  ImagePart,
  MediaInputMetadata,
  MediaPrompt,
  Model3DFile,
  Model3DFileRole,
  Model3DFormat,
  Model3DGenerationOptions,
  Model3DPart,
} from '@tanstack/ai'
import type { MeshyClient, MeshyClientConfig, MeshyTask } from '../client'
import type {
  MeshyAiModelFor,
  MeshyMeshFileField,
  MeshyModel3DEndpoint,
  MeshyModel3DInputModalities,
  MeshyModel3DProviderOptions,
} from '../model-meta'

/**
 * Maps a mesh source to Meshy request fields.
 *
 * - A `url` source goes to `model_url`.
 * - A `data` source goes to `model_url` as
 *   `data:application/octet-stream;base64,<value>`. Meshy wants this MIME type
 *   for every mesh, so the source `mimeType` is not used.
 * - A `file` source is a Meshy task id and goes to `fileField`. A handle from
 *   another provider throws.
 *
 * @param source - The source of a `model3d` part.
 * @param fileField - The field for a Meshy task id, for example
 *   `'input_task_id'`.
 *
 * @example
 * meshyMeshSourceFields(
 *   { type: 'file', value: 'task-1', provider: 'meshy' },
 *   'input_task_id',
 * )
 * // { input_task_id: 'task-1' }
 *
 * @experimental Meshy support is experimental and may change.
 */
export function meshyMeshSourceFields(
  source: ContentPartSource,
  fileField: MeshyMeshFileField,
) {
  if (isFileSource(source)) {
    return { [fileField]: fileReferenceFor(source, 'meshy') }
  }
  if (source.type === 'url') return { model_url: source.value }
  return { model_url: `data:application/octet-stream;base64,${source.value}` }
}

// An image as a URL or a data URI. Meshy has no file handles for images.
function imageSourceUrl(
  endpoint: MeshyModel3DEndpoint,
  source: ContentPartSource,
) {
  if (isFileSource(source)) {
    throw new Error(
      `meshy: ${endpoint} takes images as a url or data source, not a file source.`,
    )
  }
  if (source.type === 'url') return source.value
  return `data:${source.mimeType};base64,${source.value}`
}

function mapText(endpoint: MeshyModel3DEndpoint, text: string) {
  if (!text) return {}
  const field = MESHY_PROMPT_ROUTES[endpoint].text
  if (field === null) {
    throw new Error(
      `meshy: ${endpoint} takes no text prompt. Remove the text from the prompt.`,
    )
  }
  return { [field]: text }
}

function mapImages(
  endpoint: MeshyModel3DEndpoint,
  images: ReadonlyArray<ImagePart<MediaInputMetadata>>,
) {
  if (images.length === 0) return {}
  const route = MESHY_PROMPT_ROUTES[endpoint].image
  if (route === null) {
    throw new Error(`meshy: ${endpoint} takes no image prompt parts.`)
  }
  const urls = images.map((image) => imageSourceUrl(endpoint, image.source))
  const [first] = urls
  const isOneImage = urls.length === 1 && first !== undefined
  const isUpToFourImages = urls.length <= 4
  switch (route) {
    case 'image_url':
    case 'texture_image_url':
      if (!isOneImage) {
        throw new Error(
          `meshy: ${endpoint} takes one image (received ${urls.length}).`,
        )
      }
      return { [route]: first }
    case 'image_urls':
      if (!isUpToFourImages) {
        throw new Error(
          `meshy: ${endpoint} takes 1 to 4 images (received ${urls.length}).`,
        )
      }
      return { image_urls: urls }
    case 'style':
      if (isOneImage) return { image_style_url: first }
      if (!isUpToFourImages) {
        throw new Error(
          `meshy: ${endpoint} takes 1 style image or 2 to 4 views (received ${urls.length}).`,
        )
      }
      return { multiview_image_urls: urls }
    default: {
      const unknownRoute: never = route
      throw new Error(`meshy: unknown image route ${String(unknownRoute)}`)
    }
  }
}

function mapMesh(
  endpoint: MeshyModel3DEndpoint,
  meshes: ReadonlyArray<Model3DPart>,
) {
  if (meshes.length === 0) return {}
  const route = MESHY_PROMPT_ROUTES[endpoint].mesh
  if (route === null) {
    throw new Error(`meshy: ${endpoint} takes no model3d prompt part.`)
  }
  const [mesh, ...rest] = meshes
  if (!mesh || rest.length > 0) {
    throw new Error(
      `meshy: ${endpoint} takes one model3d prompt part (received ${meshes.length}).`,
    )
  }
  const needsTaskId = route.fileOnly && !isFileSource(mesh.source)
  if (needsTaskId) {
    throw new Error(
      `meshy: ${endpoint} takes the mesh only as a Meshy task id. Pass { type: 'file', value: '<task id>', provider: 'meshy' }.`,
    )
  }
  return meshyMeshSourceFields(mesh.source, route.fileField)
}

// Maps a prompt to the request fields of an endpoint. It throws for a part
// that the endpoint cannot use, so no part is dropped without a warning.
function mapPromptToMeshyFields(
  endpoint: MeshyModel3DEndpoint,
  prompt: MediaPrompt,
) {
  const resolved = resolveMediaPrompt(prompt)
  const hasUnsupportedParts =
    resolved.videos.length > 0 || resolved.audios.length > 0
  if (hasUnsupportedParts) {
    throw new Error(
      `meshy: ${endpoint} takes text, image, and model3d prompt parts only. Remove the video and audio parts.`,
    )
  }
  return {
    ...mapText(endpoint, resolved.text),
    ...mapImages(endpoint, resolved.images),
    ...mapMesh(endpoint, resolved.models3d),
  }
}

const TEXT_TO_3D_MODES: Partial<
  Record<MeshyModel3DEndpoint, 'preview' | 'refine'>
> = {
  'text-to-3d-preview': 'preview',
  'text-to-3d-refine': 'refine',
}

type MeshyModelUrlKey =
  | Model3DFormat
  | 'mtl'
  | 'vox'
  | 'blend'
  | 'pre_remeshed_glb'

/** The fields of a Meshy 3D task that the result mapper reads. */
interface MeshyModel3DTask extends MeshyTask {
  model_urls?: Partial<Record<MeshyModelUrlKey, string>>
  texture_urls?: Array<Partial<Record<string, string>>>
  thumbnail_url?: string
  enable_pbr?: boolean
  result?: {
    rigged_character_glb_url?: string
    rigged_character_fbx_url?: string
    basic_animations?: Partial<Record<string, string>> | null
    animation_glb_url?: string
    animation_fbx_url?: string
    processed_usdz_url?: string
    processed_armature_fbx_url?: string
    processed_animation_fps_fbx_url?: string
  }
}

/**
 * The `model_urls` keys in the order the result lists them. `pre_remeshed_glb`
 * is a GLB mesh, so it gets the format `glb`. `mtl`, `vox`, and `blend` are not
 * a `Model3DFormat`, so their files have no format.
 */
const MODEL_URL_KEYS: ReadonlyArray<
  [key: MeshyModelUrlKey, format: Model3DFormat | undefined]
> = [
  ['glb', 'glb'],
  ['gltf', 'gltf'],
  ['fbx', 'fbx'],
  ['usdz', 'usdz'],
  ['obj', 'obj'],
  ['stl', 'stl'],
  ['3mf', '3mf'],
  ['pre_remeshed_glb', 'glb'],
  ['blend', undefined],
  ['vox', undefined],
  ['mtl', undefined],
]

// The format of a rigging or animation URL, from its `_glb_` or `_fbx_` part.
function formatOfResultUrlKey(key: string) {
  if (key.endsWith('glb_url')) return 'glb'
  if (key.endsWith('fbx_url')) return 'fbx'
  if (key.endsWith('usdz_url')) return 'usdz'
  return undefined
}

// Every non-empty file URL of a task. Meshy sends '' for a file it did not
// make (for example the walk clip of a quadruped rig), so empty URLs are
// skipped.
function collectFiles(task: MeshyModel3DTask) {
  const files: Array<Model3DFile> = []
  const add = (
    url: string | undefined,
    role: Model3DFileRole,
    format: Model3DFormat | undefined,
  ) => {
    if (!url) return
    files.push({ url, role, ...(format ? { format } : {}) })
  }

  const modelRole = task.enable_pbr === true ? 'pbr' : 'base'
  const modelUrls = task.model_urls ?? {}
  for (const [key, format] of MODEL_URL_KEYS) {
    add(modelUrls[key], modelRole, format)
  }

  const result = task.result ?? {}
  add(result.rigged_character_glb_url, 'rigged', 'glb')
  add(result.rigged_character_fbx_url, 'rigged', 'fbx')
  const animationUrls = Object.entries({
    ...result.basic_animations,
    animation_glb_url: result.animation_glb_url,
    animation_fbx_url: result.animation_fbx_url,
    processed_usdz_url: result.processed_usdz_url,
    processed_armature_fbx_url: result.processed_armature_fbx_url,
    processed_animation_fps_fbx_url: result.processed_animation_fps_fbx_url,
  })
  for (const [key, url] of animationUrls) {
    add(url, 'animation', formatOfResultUrlKey(key))
  }

  const textureSets = task.texture_urls ?? []
  for (const textureSet of textureSets) {
    const textureUrls = Object.values(textureSet)
    for (const url of textureUrls) add(url, 'texture', undefined)
  }
  return files
}

/** A file with a format, so it can be the main model file. */
function isMeshFile(
  file: Model3DFile,
): file is Model3DFile & { format: Model3DFormat } {
  return file.format !== undefined
}

/**
 * Maps a finished Meshy task to a `Model3DResult`. `url` is the first GLB,
 * else the first mesh file. Throws when the task has no mesh file.
 */
function mapMeshyTaskToModel3DResult(jobId: string, task: MeshyModel3DTask) {
  const files = collectFiles(task)
  const meshFiles = files.filter(isMeshFile)
  const main = meshFiles.find((file) => file.format === 'glb') ?? meshFiles[0]
  if (!main) {
    throw new Error(`meshy: task ${jobId} returned no 3D model file.`)
  }
  return {
    jobId,
    url: main.url,
    format: main.format,
    files,
    ...(task.thumbnail_url ? { previewImageUrl: task.thumbnail_url } : {}),
  }
}

/**
 * Meshy 3D model adapter. One class runs every Meshy 3D endpoint as a task:
 * text to 3D (preview and refine), image to 3D, multi-image to 3D,
 * retexture, remesh, convert, resize, UV unwrap, rigging, animation, and the
 * 3D print endpoints.
 *
 * The endpoint is the adapter model. Text, image, and `model3d` prompt parts
 * go to the request fields of the endpoint. A `model3d` part with a `file`
 * source is a Meshy task id, so one result can feed the next step.
 *
 * @experimental Meshy support is experimental and may change.
 */
export class MeshyModel3DAdapter<
  E extends MeshyModel3DEndpoint,
> extends BaseModel3DAdapter<
  E,
  MeshyModel3DProviderOptions<E>,
  Record<E, MeshyModel3DProviderOptions<E>>,
  Record<E, MeshyModel3DInputModalities<E>>
> {
  readonly name = 'meshy' as const
  // A `file` source is a Meshy task id.
  override readonly supportsFileSources = true
  private readonly client: MeshyClient
  private readonly aiModel: MeshyAiModelFor<E> | undefined

  constructor(
    endpoint: E,
    aiModel: MeshyAiModelFor<E> | undefined,
    config?: MeshyClientConfig,
  ) {
    super({}, endpoint)
    this.aiModel = aiModel
    this.client = createMeshyClient(config)
  }

  private taskPath(jobId: string) {
    return `${MESHY_ENDPOINT_PATHS[this.model]}/${encodeURIComponent(jobId)}`
  }

  async create3DModelJob(
    options: Model3DGenerationOptions<MeshyModel3DProviderOptions<E>>,
  ) {
    const { modelOptions, logger } = options

    logger.request(
      `activity=generate3DModel provider=meshy model=${this.model}`,
      { provider: 'meshy', model: this.model },
    )

    try {
      const mode = TEXT_TO_3D_MODES[this.model]
      const body = {
        ...modelOptions,
        ...mapPromptToMeshyFields(this.model, options.prompt),
        ...(this.aiModel ? { ai_model: this.aiModel } : {}),
        ...(mode ? { mode } : {}),
      }
      const { result } = await this.client.post<{ result: string }>(
        MESHY_ENDPOINT_PATHS[this.model],
        body,
        options.abortSignal,
      )
      return { jobId: result, model: this.model }
    } catch (error) {
      logger.errors('meshy.create3DModelJob fatal', {
        error,
        source: 'meshy.create3DModelJob',
      })
      throw error
    }
  }

  async get3DModelStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) {
    const task = await this.client.get<MeshyTask>(this.taskPath(jobId), {
      signal: options?.abortSignal,
    })
    return { jobId, ...mapMeshyStatus(task) }
  }

  /**
   * Reads the finished task. A `FAILED` or `CANCELED` task throws with the
   * Meshy error message.
   */
  async get3DModel(jobId: string, options?: { abortSignal?: AbortSignal }) {
    const task = await this.client.get<MeshyModel3DTask>(this.taskPath(jobId), {
      signal: options?.abortSignal,
    })
    const { status, error } = mapMeshyStatus(task)
    if (status === 'failed') {
      throw new Error(`meshy: ${this.model} task ${jobId} failed: ${error}`)
    }
    return mapMeshyTaskToModel3DResult(jobId, task)
  }

  /**
   * Cancels a task. Meshy cancels only a `PENDING` task. A running task
   * answers 409, and then this throws an `Error` that says so.
   */
  async cancel3DModelJob(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) {
    try {
      await this.client.delete(this.taskPath(jobId), options?.abortSignal)
    } catch (error) {
      const isRunning = error instanceof MeshyApiError && error.status === 409
      if (!isRunning) throw error
      throw new Error(
        `Meshy task ${jobId} is already running and cannot be canceled`,
        { cause: error },
      )
    }
  }
}

type MeshyModel3DArgs<E extends MeshyModel3DEndpoint> =
  | [aiModel?: MeshyAiModelFor<E>, config?: MeshyClientConfig]
  | [config?: MeshyClientConfig]

/**
 * Create a Meshy 3D model adapter. It reads the API key from
 * `config.apiKey`, or from the `MESHY_API_KEY` environment variable.
 *
 * @param endpoint - The Meshy endpoint, for example `'image-to-3d'` or
 *   `'rigging'`. It types `modelOptions` and the prompt parts.
 * @param args - An optional Meshy `ai_model`, then an optional client config
 *   (API key, base URL, headers, fetch). Only endpoints with an `ai_model`
 *   take the model. Without a model, the config can be the second argument.
 *
 * @example
 * ```ts
 * import { generate3DModel } from '@tanstack/ai'
 * import { meshy3DModel } from '@tanstack/ai-meshy'
 *
 * const mesh = await generate3DModel({
 *   adapter: meshy3DModel('image-to-3d', 'meshy-7.1'),
 *   threadId: 'thread-1',
 *   prompt: [
 *     { type: 'image', source: { type: 'url', value: 'https://example.com/knight.png' } },
 *   ],
 *   wait: true,
 * })
 *
 * const rig = await generate3DModel({
 *   adapter: meshy3DModel('rigging'),
 *   threadId: 'thread-1',
 *   prompt: [
 *     { type: 'model3d', source: { type: 'file', value: mesh.jobId, provider: 'meshy' } },
 *   ],
 *   wait: true,
 * })
 * ```
 *
 * @experimental Meshy support is experimental and may change.
 */
export function meshy3DModel<E extends MeshyModel3DEndpoint>(
  endpoint: E,
  ...args: MeshyModel3DArgs<E>
) {
  const [first, second] = args
  if (typeof first === 'object') {
    return new MeshyModel3DAdapter(endpoint, undefined, first)
  }
  return new MeshyModel3DAdapter(endpoint, first, second)
}
