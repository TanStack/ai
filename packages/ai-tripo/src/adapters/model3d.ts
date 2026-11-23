import { BaseModel3dAdapter } from '@tanstack/ai/adapters'
import { resolveMediaPrompt } from '@tanstack/ai'
import { createTripoClient, mapTripoStatus, tripoInputFor } from '../client'
import {
  DEFAULT_TRIPO_GENERATION_MODEL,
  TRIPO_ENDPOINT_PATHS,
  TRIPO_PROMPT_ROUTES,
} from '../model-meta'
import type {
  ContentPartSource,
  MediaPrompt,
  Model3dFile,
  Model3dFileRole,
  Model3dFormat,
  Model3dGenerationOptions,
  Model3dPart,
} from '@tanstack/ai'
import type {
  TripoClient,
  TripoClientConfig,
  TripoTask,
  TripoTaskOutput,
} from '../client'
import type {
  TripoDefaultModelFor,
  TripoModel3dEndpoint,
  TripoModel3dInputModalities,
  TripoModel3dProviderOptions,
  TripoModelFor,
} from '../model-meta'

/** Turns a source into a Tripo input value. A `data` source is uploaded. */
type TripoUpload = (source: ContentPartSource) => Promise<string>

const noFields = async () => ({})

// A file or a URL as the `{ url }` or `{ file_token }` object that
// `texture_prompt.image` and `style_image` take.
async function imageReference(upload: TripoUpload, source: ContentPartSource) {
  const value = await upload(source)
  return source.type === 'url' ? { url: value } : { file_token: value }
}

// Positional views [front, left, back, right]. Tripo reads "" as a skipped
// view. ponytail: the views fill from the front, so a caller cannot skip
// left; add view keys to the prompt parts if that is needed.
async function positionalViews(
  upload: TripoUpload,
  sources: ReadonlyArray<ContentPartSource>,
) {
  const views = await Promise.all(sources.map(upload))
  return [...views, '', '', ''].slice(0, 4)
}

function meshFields(
  endpoint: TripoModel3dEndpoint,
  meshes: ReadonlyArray<Model3dPart>,
) {
  const route = TRIPO_PROMPT_ROUTES[endpoint].mesh
  if (route === null) {
    if (meshes.length > 0) {
      throw new Error(`tripo: ${endpoint} takes no model3d prompt part.`)
    }
    return noFields
  }
  const [mesh, ...rest] = meshes
  if (!mesh || rest.length > 0) {
    throw new Error(
      `tripo: ${endpoint} takes one model3d prompt part (received ${meshes.length}).`,
    )
  }
  const needsTaskId = route.taskIdOnly && mesh.source.type !== 'file'
  if (needsTaskId) {
    throw new Error(
      `tripo: ${endpoint} takes the mesh only as a Tripo task id. Pass { type: 'file', value: '<task id>', provider: 'tripo' }.`,
    )
  }
  return async (upload: TripoUpload) => ({ input: await upload(mesh.source) })
}

function multiviewFields(sources: ReadonlyArray<ContentPartSource>) {
  const [first] = sources
  const isMultiviewTask = sources.length === 1 && first?.type === 'file'
  if (isMultiviewTask) {
    return async (upload: TripoUpload) => ({
      inputs: [{ task_id: await upload(first) }],
    })
  }
  if (sources.length < 2 || sources.length > 4) {
    throw new Error(
      `tripo: multiview-to-model takes 2 to 4 images (front, left, back, right), or one image-to-multiview task as a file source (received ${sources.length} images).`,
    )
  }
  return async (upload: TripoUpload) => ({
    inputs: await positionalViews(upload, sources),
  })
}

// `text`, `image`, and `images` are exclusive. `style_image` goes only with
// `text`. With no text and no image, `texture_prompt` is left out: Tripo
// takes that for a mesh that Tripo made and rejects it for other meshes.
function textureFields(
  text: string,
  sources: ReadonlyArray<ContentPartSource>,
) {
  const [first, ...rest] = sources
  if (sources.length > 4) {
    throw new Error(
      `tripo: texture takes 1 to 4 images (received ${sources.length}).`,
    )
  }
  if (text && rest.length > 0) {
    throw new Error(
      'tripo: texture takes a text with at most one style image, or images without a text.',
    )
  }
  if (text) {
    return async (upload: TripoUpload) => ({
      texture_prompt: first
        ? { text, style_image: await imageReference(upload, first) }
        : { text },
    })
  }
  if (!first) return noFields
  if (rest.length === 0) {
    return async (upload: TripoUpload) => ({
      texture_prompt: { image: await imageReference(upload, first) },
    })
  }
  return async (upload: TripoUpload) => ({
    texture_prompt: { images: await positionalViews(upload, sources) },
  })
}

function textAndImageFields(
  endpoint: TripoModel3dEndpoint,
  text: string,
  sources: ReadonlyArray<ContentPartSource>,
) {
  const route = TRIPO_PROMPT_ROUTES[endpoint]
  if (route.text === 'prompt') {
    if (!text) throw new Error(`tripo: ${endpoint} needs a text prompt.`)
    return async () => ({ prompt: text })
  }
  const imageRoute = route.image
  switch (imageRoute) {
    case null:
      return noFields
    case 'input': {
      const [image, ...rest] = sources
      if (!image || rest.length > 0) {
        throw new Error(
          `tripo: ${endpoint} takes one image (received ${sources.length}).`,
        )
      }
      return async (upload: TripoUpload) => ({ input: await upload(image) })
    }
    case 'inputs':
      return multiviewFields(sources)
    case 'texture_prompt':
      return textureFields(text, sources)
    default: {
      const unknownRoute: never = imageRoute
      throw new Error(`tripo: unknown image route ${String(unknownRoute)}`)
    }
  }
}

/**
 * Checks the prompt against the routes of the endpoint and returns a function
 * that builds the request fields. It throws for a part that the endpoint
 * cannot use, so no part is dropped and nothing is uploaded or charged
 * before the prompt is valid.
 */
function promptFieldsFor(endpoint: TripoModel3dEndpoint, prompt: MediaPrompt) {
  const resolved = resolveMediaPrompt(prompt)
  const route = TRIPO_PROMPT_ROUTES[endpoint]
  const hasUnsupportedParts =
    resolved.videos.length > 0 || resolved.audios.length > 0
  if (hasUnsupportedParts) {
    throw new Error(
      `tripo: ${endpoint} takes text, image, and model3d prompt parts only. Remove the video and audio parts.`,
    )
  }
  if (resolved.text && route.text === null) {
    throw new Error(
      `tripo: ${endpoint} takes no text prompt. Remove the text from the prompt.`,
    )
  }
  if (resolved.images.length > 0 && route.image === null) {
    throw new Error(`tripo: ${endpoint} takes no image prompt parts.`)
  }
  const mesh = meshFields(endpoint, resolved.models3d)
  const sources = resolved.images.map((image) => image.source)
  const textAndImages = textAndImageFields(endpoint, resolved.text, sources)
  return async (upload: TripoUpload) => ({
    ...(await mesh(upload)),
    ...(await textAndImages(upload)),
  })
}

const MESH_FORMATS: ReadonlyArray<Model3dFormat> = [
  'glb',
  'gltf',
  'fbx',
  'obj',
  'usdz',
  'stl',
  '3mf',
]

// The format from the extension of the URL path, so a query string such as
// `?sig=...` does not count. A path with no known mesh extension uses
// `fallback` (the convert `format`, or FBX when `quad` is true).
function formatFromUrl(url: string, fallback: Model3dFormat = 'glb') {
  const extension = new URL(url).pathname.split('.').pop()?.toLowerCase()
  return MESH_FORMATS.find((format) => format === extension) ?? fallback
}

// Convert output format. `quad: true` always writes FBX.
function convertMeshFormat(modelOptions: object | undefined): Model3dFormat {
  if (modelOptions && 'quad' in modelOptions && modelOptions.quad === true) {
    return 'fbx'
  }
  if (
    modelOptions &&
    'format' in modelOptions &&
    typeof modelOptions.format === 'string'
  ) {
    const format = modelOptions.format.toLowerCase()
    return MESH_FORMATS.find((value) => value === format) ?? 'glb'
  }
  return 'glb'
}

// ZIP packaging returns an archive. Model3dResult cannot describe that.
function assertConvertPackaging(
  endpoint: TripoModel3dEndpoint,
  modelOptions: object | undefined,
) {
  if (endpoint !== 'convert') return
  if (
    modelOptions &&
    'texture_packaging' in modelOptions &&
    modelOptions.texture_packaging === 'zip'
  ) {
    throw new Error(
      "tripo: convert with texture_packaging: 'zip' is not supported. Use the default embedded packaging.",
    )
  }
}

// The role of `model_url`. It is `'base'` for the endpoints not listed.
const MAIN_FILE_ROLES: Partial<Record<TripoModel3dEndpoint, Model3dFileRole>> =
  { rig: 'rigged', retarget: 'animation', segment: 'part' }

// Every file URL of the task output. `pbr_model` and `base_model` can repeat
// `model_url`, so a URL that is already listed is skipped.
function collectFiles(
  endpoint: TripoModel3dEndpoint,
  output: TripoTaskOutput,
  fallbackFormat?: Model3dFormat,
) {
  const files: Array<Model3dFile> = []
  const add = (url: unknown, role: Model3dFileRole, isMesh = true) => {
    const isNewUrl =
      typeof url === 'string' && url !== '' && !files.some((f) => f.url === url)
    if (!isNewUrl) return
    files.push({
      url,
      role,
      ...(isMesh ? { format: formatFromUrl(url, fallbackFormat) } : {}),
    })
  }
  add(output.model_url, MAIN_FILE_ROLES[endpoint] ?? 'base')
  add(output.pbr_model, 'pbr')
  add(output.base_model, 'base')
  const animationUrls = output.model_urls ?? []
  for (const url of animationUrls) add(url, 'animation')
  add(output.seg_model_url, 'part')
  add(output.uv_render_url, 'texture', false)
  return files
}

function isMeshFile(
  file: Model3dFile,
): file is Model3dFile & { format: Model3dFormat } {
  return file.format !== undefined
}

/**
 * Tripo 3D model adapter. One class runs every Tripo 3D endpoint as a task:
 * text, image, and multiview to model, texture, convert, rig, retarget,
 * decimate, UV unwrap, and segment.
 *
 * The endpoint is the adapter model. Text, image, and `model3d` prompt parts
 * go to the request fields of the endpoint. A part with a `file` source is a
 * Tripo task id or `file_token`, so one result can feed the next step. A
 * `data` source is uploaded first, so Tripo never gets a data URI. Tripo has
 * no cancel API, so the adapter has no `cancel3dModelJob`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export class TripoModel3dAdapter<
  E extends TripoModel3dEndpoint,
  M extends TripoModelFor<E> = TripoDefaultModelFor<E>,
> extends BaseModel3dAdapter<
  E,
  TripoModel3dProviderOptions<E, M>,
  Record<E, TripoModel3dProviderOptions<E, M>>,
  Record<E, TripoModel3dInputModalities<E>>
> {
  readonly name = 'tripo' as const
  // A `file` source is a Tripo task id or `file_token`.
  override readonly supportsFileSources = true
  private readonly client: TripoClient
  private readonly tripoModel: TripoModelFor<E> | undefined
  private readonly convertFormats = new Map<string, Model3dFormat>()

  // ponytail: `M` only types `modelOptions`. `tripo3dModel()` infers it from
  // the model argument, so the constructor takes any model of the endpoint.
  constructor(
    endpoint: E,
    model: TripoModelFor<E> | undefined,
    config?: TripoClientConfig,
  ) {
    super({}, endpoint)
    this.tripoModel = model
    this.client = createTripoClient(config)
  }

  private readTask(jobId: string, signal: AbortSignal | undefined) {
    return this.client.get<TripoTask>(`/tasks/${encodeURIComponent(jobId)}`, {
      signal,
    })
  }

  async create3dModelJob(
    options: Model3dGenerationOptions<TripoModel3dProviderOptions<E, M>>,
  ) {
    const { modelOptions, logger, abortSignal } = options

    logger.request(
      `activity=generate3dModel provider=tripo model=${this.model}`,
      { provider: 'tripo', model: this.model },
    )

    try {
      assertConvertPackaging(this.model, modelOptions)
      const path = TRIPO_ENDPOINT_PATHS[this.model]
      const buildPromptFields = promptFieldsFor(this.model, options.prompt)
      const promptFields = await buildPromptFields((source) =>
        tripoInputFor(this.client, source, abortSignal),
      )
      const isGeneration = path.startsWith('/generation/')
      const model =
        this.tripoModel ??
        (isGeneration ? DEFAULT_TRIPO_GENERATION_MODEL : undefined)
      const body = {
        ...modelOptions,
        ...promptFields,
        ...(model ? { model } : {}),
      }
      const data = await this.client.post<{ task_id: string }>(
        path,
        body,
        abortSignal,
      )
      if (this.model === 'convert') {
        this.convertFormats.set(data.task_id, convertMeshFormat(modelOptions))
      }
      return { jobId: data.task_id, model: this.model }
    } catch (error) {
      logger.errors('tripo.create3dModelJob fatal', {
        error,
        source: 'tripo.create3dModelJob',
      })
      throw error
    }
  }

  async get3dModelStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) {
    const task = await this.readTask(jobId, options?.abortSignal)
    return { jobId, ...mapTripoStatus(task) }
  }

  /**
   * Reads the finished task. A failed task throws with the Tripo error
   * message. `url` is the first GLB, else the first mesh file. A task with
   * no mesh file throws.
   */
  async get3dModel(jobId: string, options?: { abortSignal?: AbortSignal }) {
    const task = await this.readTask(jobId, options?.abortSignal)
    const { status, error } = mapTripoStatus(task)
    if (status === 'failed') {
      throw new Error(`tripo: ${this.model} task ${jobId} failed: ${error}`)
    }
    const output = task.output ?? {}
    // Same-instance convert jobs store the format. A new adapter reads
    // `format` and `quad` from the task input instead.
    const fallbackFormat =
      this.convertFormats.get(jobId) ??
      (this.model === 'convert' ? convertMeshFormat(task.input) : undefined)
    const files = collectFiles(this.model, output, fallbackFormat)
    const meshFiles = files.filter(isMeshFile)
    const main = meshFiles.find((file) => file.format === 'glb') ?? meshFiles[0]
    if (!main) {
      throw new Error(`tripo: task ${jobId} returned no 3D model file.`)
    }
    return {
      jobId,
      url: main.url,
      format: main.format,
      files,
      ...(output.rendered_image_url
        ? { previewImageUrl: output.rendered_image_url }
        : {}),
    }
  }
}

type TripoModel3dArgs<E extends TripoModel3dEndpoint> =
  | [model?: TripoModelFor<E>, config?: TripoClientConfig]
  | [config?: TripoClientConfig]

// The model in the factory arguments, or the default model when the
// arguments have none. A config object is not a model, so it gives the
// default.
type TripoModelFromArgs<
  E extends TripoModel3dEndpoint,
  A extends TripoModel3dArgs<E>,
> = A extends [infer Model extends TripoModelFor<E>, ...Array<unknown>]
  ? Model
  : TripoDefaultModelFor<E>

/**
 * Create a Tripo 3D model adapter. It reads the API key from `config.apiKey`,
 * or from the `TRIPO_API_KEY` environment variable.
 *
 * @param endpoint - The Tripo endpoint, for example `'image-to-model'` or
 *   `'rig'`. It types `modelOptions` and the prompt parts.
 * @param args - An optional Tripo `model`, then an optional client config
 *   (API key, base URL, headers, fetch). Only endpoints with a model choice
 *   take the model. Without a model, the config can be the second argument.
 *   The generation endpoints send `v3.1-20260211` when no model is given.
 *
 * @example
 * ```ts
 * import { generate3dModel } from '@tanstack/ai'
 * import { tripo3dModel } from '@tanstack/ai-tripo'
 *
 * const mesh = await generate3dModel({
 *   adapter: tripo3dModel('image-to-model'),
 *   threadId: 'thread-1',
 *   prompt: [
 *     { type: 'image', source: { type: 'url', value: 'https://example.com/knight.png' } },
 *   ],
 *   wait: true,
 * })
 *
 * const rig = await generate3dModel({
 *   adapter: tripo3dModel('rig', 'v3.0-20260909'),
 *   threadId: 'thread-1',
 *   prompt: [
 *     { type: 'model3d', source: { type: 'file', value: mesh.jobId, provider: 'tripo' } },
 *   ],
 *   wait: true,
 * })
 *
 * const walk = await generate3dModel({
 *   adapter: tripo3dModel('retarget'),
 *   threadId: 'thread-1',
 *   prompt: [
 *     { type: 'model3d', source: { type: 'file', value: rig.jobId, provider: 'tripo' } },
 *   ],
 *   modelOptions: { animation: 'preset:walk' },
 *   wait: true,
 * })
 * ```
 *
 * @experimental Tripo support is experimental and may change.
 */
export function tripo3dModel<
  E extends TripoModel3dEndpoint,
  A extends TripoModel3dArgs<E>,
>(endpoint: E, ...args: A) {
  const [first, second]: TripoModel3dArgs<E> = args
  if (typeof first === 'object') {
    return new TripoModel3dAdapter<E, TripoModelFromArgs<E, A>>(
      endpoint,
      undefined,
      first,
    )
  }
  return new TripoModel3dAdapter<E, TripoModelFromArgs<E, A>>(
    endpoint,
    first,
    second,
  )
}
