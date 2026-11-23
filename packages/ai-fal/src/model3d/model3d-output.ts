import { extractUrlExtension } from '../utils/client'
import type { Model3dFile, Model3dFileRole, Model3dFormat } from '@tanstack/ai'

/** The fields of a fal `File` that the mapper reads. */
interface FalFileLike {
  url: string
  content_type?: unknown
  file_name?: unknown
}

const FORMAT_BY_EXTENSION: Partial<Record<string, Model3dFormat>> = {
  glb: 'glb',
  gltf: 'gltf',
  fbx: 'fbx',
  obj: 'obj',
  usdz: 'usdz',
  stl: 'stl',
}

const FORMAT_BY_CONTENT_TYPE: Partial<Record<string, Model3dFormat>> = {
  'model/gltf-binary': 'glb',
  'model/gltf+json': 'gltf',
  'model/obj': 'obj',
  'model/stl': 'stl',
  'application/sla': 'stl',
  'model/vnd.usdz+zip': 'usdz',
}

/**
 * The `model_urls` keys in the order the mapper prefers them when there is
 * no GLB. FBX keeps materials and rigs, so it comes before OBJ.
 */
const MODEL_URL_FORMATS = ['glb', 'gltf', 'fbx', 'usdz', 'obj', 'stl'] as const

/**
 * Output fields that hold one mesh file, in the order the mapper prefers
 * them for the main `url`. Then come `model_urls`, rigged and animated
 * meshes, and mesh parts (see {@link collectMeshFiles}).
 */
const PBR_FIELDS = ['pbr_model', 'model_glb_pbr'] as const
const BASE_FIELDS = ['model_mesh', 'base_model'] as const
const RIGGED_FIELDS = ['rigged_character_glb', 'rigged_character_fbx'] as const
const ANIMATION_FIELDS = ['animation_glb', 'animation_fbx'] as const
const PART_LIST_FIELDS = ['result_files', 'individual_glbs', 'meshes'] as const
const PREVIEW_FIELDS = ['rendered_image', 'thumbnail'] as const
const TEXTURE_FIELDS = ['texture', 'material_mtl'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFalFile(value: unknown): value is FalFileLike {
  return isRecord(value) && typeof value.url === 'string'
}

function fileNameExtension(fileName: unknown) {
  if (typeof fileName !== 'string' || !fileName.includes('.')) return undefined
  return fileName.split('.').pop()
}

/**
 * Find the format of a fal file from its file name, then its URL extension,
 * then its content type. Returns `undefined` when the file is not a mesh
 * format that `Model3dFormat` names (for example a PNG texture).
 */
function detectFormat(file: FalFileLike) {
  const extension =
    fileNameExtension(file.file_name) ?? extractUrlExtension(file.url)
  const byExtension = extension
    ? FORMAT_BY_EXTENSION[extension.toLowerCase()]
    : undefined
  if (byExtension) return byExtension
  if (typeof file.content_type !== 'string') return undefined
  const mimeType = file.content_type.split(';')[0]?.trim().toLowerCase()
  return mimeType ? FORMAT_BY_CONTENT_TYPE[mimeType] : undefined
}

/** A mesh file. Unlike a texture, a mesh always has a format. */
type Model3dMeshFile = Model3dFile & { format: Model3dFormat }

function contentTypeField(file: FalFileLike) {
  return typeof file.content_type === 'string'
    ? { contentType: file.content_type }
    : {}
}

function toMeshFile(
  value: unknown,
  role: Model3dFileRole,
  knownFormat?: Model3dFormat,
) {
  if (!isFalFile(value)) return undefined
  const format = detectFormat(value) ?? knownFormat
  if (!format) return undefined
  const file: Model3dMeshFile = {
    url: value.url,
    format,
    role,
    ...contentTypeField(value),
  }
  return file
}

/**
 * Read every mesh file from a fal 3D output, in the order the mapper prefers
 * them, without two files that share a URL. Files that are not a
 * `Model3dFormat` (textures, MTL files, Gaussian splats) are left out.
 */
function collectMeshFiles(output: Record<string, unknown>) {
  const files: Array<Model3dMeshFile> = []
  const add = (
    value: unknown,
    role: Model3dFileRole,
    knownFormat?: Model3dFormat,
  ) => {
    const file = toMeshFile(value, role, knownFormat)
    const isNewFile = file && !files.some((seen) => seen.url === file.url)
    if (file && isNewFile) files.push(file)
  }

  for (const field of PBR_FIELDS) add(output[field], 'pbr')
  add(output.model_glb, 'base', 'glb')
  const modelUrls = isRecord(output.model_urls) ? output.model_urls : {}
  for (const format of MODEL_URL_FORMATS) add(modelUrls[format], 'base', format)
  for (const field of BASE_FIELDS) add(output[field], 'base')
  for (const field of RIGGED_FIELDS) add(output[field], 'rigged')
  for (const field of ANIMATION_FIELDS) add(output[field], 'animation')
  const basicAnimations = isRecord(output.basic_animations)
    ? Object.values(output.basic_animations)
    : []
  for (const animation of basicAnimations) add(animation, 'animation')
  for (const field of PART_LIST_FIELDS) {
    const parts = output[field]
    if (!Array.isArray(parts)) continue
    for (const part of parts) add(part, 'part')
  }
  return files
}

/**
 * Read the texture files of a fal 3D output: the `textures` images (Rodin),
 * the `base_color`, `metallic`, `normal`, and `roughness` files of each
 * `texture_urls` entry (Meshy), and the `texture` and `material_mtl` files
 * (Hunyuan3D rapid). They have the role `'texture'` and no `format`.
 */
function collectTextureFiles(output: Record<string, unknown>) {
  const values: Array<unknown> = []
  if (Array.isArray(output.textures)) values.push(...output.textures)
  const textureSets = Array.isArray(output.texture_urls)
    ? output.texture_urls
    : []
  for (const textureSet of textureSets) {
    if (isRecord(textureSet)) values.push(...Object.values(textureSet))
  }
  for (const field of TEXTURE_FIELDS) values.push(output[field])

  const files: Array<Model3dFile> = []
  for (const value of values) {
    if (!isFalFile(value)) continue
    files.push({ url: value.url, role: 'texture', ...contentTypeField(value) })
  }
  return files
}

/** The first GLB in the list, else the first file. */
function pickMainFile(files: ReadonlyArray<Model3dMeshFile>) {
  return files.find((file) => file.format === 'glb') ?? files[0]
}

function findPreviewUrl(output: Record<string, unknown>) {
  for (const field of PREVIEW_FIELDS) {
    const preview = output[field]
    if (isFalFile(preview)) return preview.url
  }
  return undefined
}

/**
 * Map the output of any fal 3D endpoint to a `Model3dResult`. One generic
 * mapper reads the known output fields, so there is no table per model.
 *
 * `url` is the best mesh of the PBR and base files: the first GLB in the
 * order `pbr_model`, `model_glb_pbr`, `model_glb`, `model_urls.glb`,
 * `model_mesh`, `base_model`. When there is no GLB, it is the first
 * non-GLB file in that order, with `model_urls` in the order gltf, fbx,
 * usdz, obj, stl. When the output has no PBR or base file, the same rule
 * runs on the rigged, animated, and part files. `files` holds every mesh
 * file with its format and role, the main file included, and then the
 * texture files with the role `'texture'` and no format.
 *
 * `previewImageUrl` comes from `rendered_image` or `thumbnail`.
 *
 * Throws when the output has no mesh file.
 */
export function mapFalModel3dOutput(jobId: string, output: unknown) {
  const fields = isRecord(output) ? output : {}
  const meshFiles = collectMeshFiles(fields)
  const primaryFiles = meshFiles.filter(
    (file) => file.role === 'pbr' || file.role === 'base',
  )
  const main = pickMainFile(primaryFiles) ?? pickMainFile(meshFiles)
  if (!main) {
    const fieldNames = Object.keys(fields).join(', ') || 'none'
    throw new Error(
      `fal: job ${jobId} returned no 3D model file. Output fields: ${fieldNames}.`,
    )
  }
  const previewImageUrl = findPreviewUrl(fields)
  return {
    jobId,
    url: main.url,
    format: main.format,
    files: [...meshFiles, ...collectTextureFiles(fields)],
    ...(previewImageUrl ? { previewImageUrl } : {}),
  }
}
