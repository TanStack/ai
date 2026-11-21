/**
 * The Meshy 3D endpoints that `meshy3dModel()` can call. The endpoint is the
 * adapter model.
 *
 * @experimental Meshy support is experimental and may change.
 */
export type MeshyModel3dEndpoint =
  | 'text-to-3d-preview'
  | 'text-to-3d-refine'
  | 'image-to-3d'
  | 'multi-image-to-3d'
  | 'retexture'
  | 'remesh'
  | 'convert'
  | 'resize'
  | 'uv-unwrap'
  | 'rigging'
  | 'animation'
  | 'print-multi-color'
  | 'print-repair'
  | 'print-split'
  | 'relief'

/**
 * The API path of each endpoint, relative to the Meshy base URL. Create is
 * `POST <path>`. Status, result, and cancel use `<path>/<task id>`.
 *
 * @experimental Meshy support is experimental and may change.
 */
export const MESHY_ENDPOINT_PATHS: Record<MeshyModel3dEndpoint, string> = {
  'text-to-3d-preview': '/v2/text-to-3d',
  'text-to-3d-refine': '/v2/text-to-3d',
  'image-to-3d': '/v1/image-to-3d',
  'multi-image-to-3d': '/v1/multi-image-to-3d',
  retexture: '/v1/retexture',
  remesh: '/v1/remesh',
  convert: '/v1/convert',
  resize: '/v1/resize',
  'uv-unwrap': '/v1/uv-unwrap',
  rigging: '/v1/rigging',
  animation: '/v1/animations',
  'print-multi-color': '/v1/print/multi-color',
  'print-repair': '/v1/print/repair',
  'print-split': '/v1/print/split',
  relief: '/v1/relief',
}

/**
 * Where the prompt parts of one endpoint go.
 *
 * - `text`: the request field for the prompt text, or `null` for no text.
 * - `image`: `'image_url'` or `'texture_image_url'` take one image,
 *   `'image_urls'` takes 1 to 4 images, `'style'` sends 1 image to
 *   `image_style_url` and 2 to 4 images to `multiview_image_urls`. `null` for
 *   no images.
 * - `mesh`: the field for a Meshy task id (a `file` source), and `fileOnly`
 *   when the endpoint takes no `model_url`. `inlineData` says which mesh
 *   formats a data URI can hold. `null` for no mesh.
 */
interface MeshyPromptRoute {
  text: 'prompt' | 'texture_prompt' | 'text_style_prompt' | null
  image: 'image_url' | 'texture_image_url' | 'image_urls' | 'style' | null
  mesh: {
    fileField: MeshyMeshFileField
    fileOnly: boolean
    inlineData: MeshyInlineMeshData
  } | null
}

/**
 * How an endpoint takes a mesh as a data URI.
 *
 * - `'any'`: every mesh format, as `data:application/octet-stream`.
 * - `'gltf'`: only GLB (`model/gltf-binary`) or glTF (`model/gltf+json`).
 * - `'glb'`: only GLB (`model/gltf-binary`).
 *
 * Send other formats as a URL.
 *
 * @experimental Meshy support is experimental and may change.
 */
export type MeshyInlineMeshData = 'any' | 'gltf' | 'glb'

/**
 * The request field that takes a Meshy task id for a mesh.
 *
 * @experimental Meshy support is experimental and may change.
 */
export type MeshyMeshFileField =
  | 'input_task_id'
  | 'rig_task_id'
  | 'preview_task_id'

const ANY_MESH = {
  fileField: 'input_task_id',
  fileOnly: false,
  inlineData: 'any',
} as const

/**
 * The prompt routes of every endpoint. The prompt modality types below come
 * from this table, so the types and the runtime check cannot drift.
 */
export const MESHY_PROMPT_ROUTES = {
  'text-to-3d-preview': { text: 'prompt', image: null, mesh: null },
  'text-to-3d-refine': {
    text: 'texture_prompt',
    image: 'texture_image_url',
    mesh: { fileField: 'preview_task_id', fileOnly: true, inlineData: 'any' },
  },
  'image-to-3d': { text: 'texture_prompt', image: 'image_url', mesh: null },
  'multi-image-to-3d': {
    text: 'texture_prompt',
    image: 'image_urls',
    mesh: null,
  },
  retexture: { text: 'text_style_prompt', image: 'style', mesh: ANY_MESH },
  remesh: { text: null, image: null, mesh: ANY_MESH },
  convert: { text: null, image: null, mesh: ANY_MESH },
  resize: { text: null, image: null, mesh: ANY_MESH },
  'uv-unwrap': { text: null, image: null, mesh: ANY_MESH },
  rigging: { text: null, image: null, mesh: ANY_MESH },
  animation: {
    text: null,
    image: null,
    mesh: { fileField: 'rig_task_id', fileOnly: true, inlineData: 'any' },
  },
  'print-multi-color': {
    text: null,
    image: null,
    mesh: { fileField: 'input_task_id', fileOnly: false, inlineData: 'glb' },
  },
  'print-repair': {
    text: null,
    image: null,
    mesh: { fileField: 'input_task_id', fileOnly: false, inlineData: 'gltf' },
  },
  'print-split': {
    text: 'prompt',
    image: null,
    mesh: { fileField: 'input_task_id', fileOnly: true, inlineData: 'any' },
  },
  relief: { text: null, image: 'image_url', mesh: null },
} as const satisfies Record<MeshyModel3dEndpoint, MeshyPromptRoute>

type MeshyPromptRouteFor<E extends MeshyModel3dEndpoint> =
  (typeof MESHY_PROMPT_ROUTES)[E]

/**
 * The non-text prompt parts that an endpoint takes, for the
 * `generate3dModel()` prompt type.
 *
 * @experimental Meshy support is experimental and may change.
 */
export type MeshyModel3dInputModalities<E extends MeshyModel3dEndpoint> =
  ReadonlyArray<
    | (MeshyPromptRouteFor<E>['image'] extends null ? never : 'image')
    | (MeshyPromptRouteFor<E>['mesh'] extends null ? never : 'model3d')
  >

type MeshyGeometryAiModel =
  | 'latest'
  | 'meshy-7.1'
  | 'meshy-6'
  | 'meshy-6-lite'
  | 'meshy-t2'
  | 'meshy-t2.5'

type MeshyTextureAiModel =
  | 'latest'
  | 'meshy-7'
  | 'meshy-6'
  | 'meshy-6-lite'
  | 'meshy-n1'

interface MeshyAiModelByEndpoint {
  'text-to-3d-preview': MeshyGeometryAiModel
  'text-to-3d-refine': MeshyTextureAiModel
  'image-to-3d': MeshyGeometryAiModel
  'multi-image-to-3d': 'latest' | 'meshy-7.1' | 'meshy-6' | 'meshy-6-lite'
  retexture: MeshyTextureAiModel
  remesh: never
  convert: never
  resize: never
  'uv-unwrap': never
  rigging: never
  animation: never
  'print-multi-color': never
  'print-repair': never
  'print-split': never
  relief: never
}

/**
 * The Meshy `ai_model` values an endpoint takes. `never` when the endpoint
 * has no `ai_model`.
 *
 * @experimental Meshy support is experimental and may change.
 */
export type MeshyAiModelFor<E extends MeshyModel3dEndpoint> =
  MeshyAiModelByEndpoint[E]

type MeshyTargetFormat = 'glb' | 'obj' | 'fbx' | 'stl' | 'usdz' | '3mf'
type MeshyOriginAt = 'bottom' | 'center'
type MeshyTopology = 'quad' | 'triangle'
type MeshyTextureResolution = '2k' | '4k' | '8k'
type MeshyDecimationMode = 1 | 2 | 3 | 4
type MeshyPoseMode = 'a-pose' | 't-pose'

/** Options for `text-to-3d-preview`. The prompt text goes to `prompt`. */
export interface MeshyTextTo3dPreviewOptions {
  /** Task name, up to 100 characters. */
  name?: string
  /** `smart-topology` uses the `meshy-t2` models. */
  model_type?: 'standard' | 'smart-topology'
  /** Geometry detail. `2k` and `4k` need `meshy-7.1` or `latest`. */
  geometry_resolution?: 'standard' | '2k' | '4k'
  /** Remesh after the draft stage. */
  should_remesh?: boolean
  /** Output mesh topology. */
  topology?: MeshyTopology
  /** Decimation algorithm, 1 to 4. */
  decimation_mode?: MeshyDecimationMode
  /** Target polygon count, 100 to 300000. */
  target_polycount?: number
  /** Force a rest pose for characters. */
  pose_mode?: MeshyPoseMode
  /** Random seed. 0 picks a random seed. */
  seed?: number
  /** Run content moderation. */
  moderation?: boolean
  /** File formats to make. */
  target_formats?: Array<MeshyTargetFormat>
  /** Make a preview image with a transparent background. */
  alpha_thumbnail?: boolean
  /** Guess the real-world size. */
  auto_size?: boolean
  /** Where to put the model origin. */
  origin_at?: MeshyOriginAt
}

/**
 * Options for `text-to-3d-refine`. The preview task goes in a `model3d` part,
 * the text to `texture_prompt`, and an image to `texture_image_url`.
 */
export interface MeshyTextTo3dRefineOptions {
  /** Task name, up to 100 characters. */
  name?: string
  /** Make PBR texture maps. */
  enable_pbr?: boolean
  /** Resolution of the base color texture. */
  texture_resolution?: MeshyTextureResolution
  /** Remove baked lighting from the textures. */
  remove_lighting?: boolean
  /** Run content moderation. */
  moderation?: boolean
  /** File formats to make. */
  target_formats?: Array<MeshyTargetFormat>
  /** Make a preview image with a transparent background. */
  alpha_thumbnail?: boolean
  /** Guess the real-world size. */
  auto_size?: boolean
  /** Where to put the model origin. */
  origin_at?: MeshyOriginAt
}

/** Fields that image to 3D and multi-image to 3D share. */
interface MeshyImageTo3dSharedOptions {
  /** Task name, up to 100 characters. */
  name?: string
  /** Reuse the input images of an earlier task, in place of image parts. */
  input_task_id?: string
  /** Output mesh topology. */
  topology?: MeshyTopology
  /** Target polygon count, 100 to 300000. */
  target_polycount?: number
  /** Remesh after the draft stage. */
  should_remesh?: boolean
  /** Run the texture stage. Defaults to `true`. */
  should_texture?: boolean
  /** Make PBR texture maps. */
  enable_pbr?: boolean
  /** Texture reference image, as a URL or a data URI. */
  texture_image_url?: string
  /** Make the input image better before the generation. */
  image_enhancement?: boolean
  /** Remove baked lighting from the textures. */
  remove_lighting?: boolean
  /** Run content moderation. */
  moderation?: boolean
  /** Force a rest pose for characters. */
  pose_mode?: MeshyPoseMode
  /** Also return the model before the remesh. */
  save_pre_remeshed_model?: boolean
  /** Guess the real-world size. */
  auto_size?: boolean
  /** Where to put the model origin. */
  origin_at?: MeshyOriginAt
  /** Decimation algorithm, 1 to 4. */
  decimation_mode?: MeshyDecimationMode
  /** File formats to make. */
  target_formats?: Array<MeshyTargetFormat>
  /** Resolution of the base color texture. */
  texture_resolution?: MeshyTextureResolution
  /** Render front, right, back, and left preview images. */
  multi_view_thumbnails?: boolean
  /** Make a preview image with a transparent background. */
  alpha_thumbnail?: boolean
}

/**
 * Options for `image-to-3d`. One image part goes to `image_url`, the text to
 * `texture_prompt`.
 */
export interface MeshyImageTo3dOptions extends MeshyImageTo3dSharedOptions {
  /** `smart-topology` uses the `meshy-t2` models. */
  model_type?: 'standard' | 'smart-topology'
  /** Geometry detail. `2k` and `4k` need `meshy-7.1` or `latest`. */
  geometry_resolution?: 'standard' | '2k' | '4k'
  /** Texture model in the same task. Defaults to the one for `ai_model`. */
  texture_model?: 'meshy-6' | 'meshy-6-lite' | 'meshy-7' | 'meshy-n1'
}

/**
 * Options for `multi-image-to-3d`. 1 to 4 image parts go to `image_urls`, the
 * text to `texture_prompt`.
 */
export interface MeshyMultiImageTo3dOptions extends MeshyImageTo3dSharedOptions {
  /** Geometry detail. `2k` needs `meshy-7.1` or `latest`. */
  geometry_resolution?: 'standard' | '2k'
  /** 1 to 4 texture reference views, front view first. */
  texture_image_urls?: Array<string>
  /** Texture model in the same task. */
  texture_model?: 'meshy-7' | 'meshy-n1'
}

/**
 * Options for `retexture`. The mesh goes in a `model3d` part. The text goes
 * to `text_style_prompt`, 1 image to `image_style_url`, and 2 to 4 images to
 * `multiview_image_urls`.
 */
export interface MeshyRetextureOptions {
  /** Art style. */
  art_style?: 'realistic' | 'cartoon'
  /** Keep the UVs of the source mesh. */
  enable_original_uv?: boolean
  /** Make PBR texture maps. */
  enable_pbr?: boolean
  /** Remove baked lighting from the textures. */
  remove_lighting?: boolean
  /** File formats to make. */
  target_formats?: Array<MeshyTargetFormat>
  /** Resolution of the base color texture. */
  texture_resolution?: MeshyTextureResolution
  /** Make a preview image with a transparent background. */
  alpha_thumbnail?: boolean
}

/** Options for `remesh`. The mesh goes in a `model3d` part. */
export interface MeshyRemeshOptions {
  /** File formats to make. Defaults to `['glb']`. */
  target_formats?: Array<MeshyTargetFormat | 'blend'>
  /** Output mesh topology. */
  topology?: MeshyTopology
  /** Target polygon count, 100 to 300000. */
  target_polycount?: number
  /** Decimation algorithm, 1 to 4. */
  decimation_mode?: MeshyDecimationMode
  /** Target height in meters. */
  resize_height?: number
  /** Target longest side in meters. */
  resize_longest_side?: number
  /** Guess the real-world size. */
  auto_size?: boolean
  /** Where to put the model origin. */
  origin_at?: MeshyOriginAt
  /** Only export new formats, with no remesh. */
  convert_format_only?: boolean
  /** Make a preview image with a transparent background. */
  alpha_thumbnail?: boolean
}

/** Options for `convert`. The mesh goes in a `model3d` part. */
export interface MeshyConvertOptions {
  /** File formats to make. At least one. */
  target_formats: Array<MeshyTargetFormat | 'blend'>
}

/** Options for `resize`. The mesh goes in a `model3d` part. */
export interface MeshyResizeOptions {
  /** Target height in meters. */
  resize_height?: number
  /** Target longest side in meters. */
  resize_longest_side?: number
  /** Guess the real-world size. */
  auto_size?: boolean
  /** Where to put the model origin. */
  origin_at?: MeshyOriginAt
}

/** Options for `uv-unwrap`. The mesh goes in a `model3d` part. */
export type MeshyUvUnwrapOptions = Record<string, never>

/** Options for `rigging`. The mesh goes in a `model3d` part. */
export interface MeshyRiggingOptions {
  /** Task name. */
  name?: string
  /** A humanoid (`biped`) or a four-legged animal (`quadruped`). */
  animation_type?: 'biped' | 'quadruped'
  /** Height of the model in meters. */
  height_meters?: number
  /** Skeleton of a biped rig. */
  skeleton_template?:
    | 'meshyrig'
    | 'mixamo'
    | 'ue5_mannequin'
    | 'max_biped'
    | 'unity_humanoid'
    | 'maya_human_ik'
    | 'blender_rigify_basic_human'
    | 'cc5_hd_neutral_base'
    | 'daz_genesis9'
  /** Add finger bones to a biped rig. */
  include_fingers?: boolean
}

interface MeshyAnimationSharedOptions {
  /** Task name. */
  name?: string
  /** Post-processing of the animation file. */
  post_process?: {
    /** The operation to run. */
    operation_type: 'change_fps' | 'fbx2usdz' | 'extract_armature'
    /** Frame rate for `change_fps`. */
    fps?: 24 | 25 | 30 | 60
  }
}

/**
 * Options for `animation`. The rigging task goes in a `model3d` part with a
 * Meshy `file` source. Set exactly one of `action_id`, `action_ids`, or
 * `motion_task_id`.
 */
export type MeshyAnimationOptions = MeshyAnimationSharedOptions &
  (
    | {
        /** One animation from the Meshy animation library. */
        action_id: number
        action_ids?: never
        motion_task_id?: never
      }
    | {
        action_id?: never
        /** 1 to 10 library animations, one clip each, in this order. */
        action_ids: Array<number>
        motion_task_id?: never
      }
    | {
        action_id?: never
        action_ids?: never
        /** A finished Meshy text to motion task. The rig must be a biped. */
        motion_task_id: string
      }
  )

/** Options for `print-multi-color`. The mesh goes in a `model3d` part. */
export interface MeshyPrintMultiColorOptions {
  /** How Meshy places the colors. */
  style?: 'realistic' | 'cartoon'
  /** Number of colors, 1 to 16. */
  max_colors?: number
  /** Quadtree depth, 3 to 6. Only for the `realistic` style. */
  max_depth?: number
  /** Printer brand for the slicer preset in the 3MF file. */
  printer_brand?:
    | 'bambu'
    | 'anycubic'
    | 'creality'
    | 'flashforge'
    | 'snapmaker'
    | 'elegoo'
    | 'prusa'
    | 'qidi'
    | 'ankermake'
}

/** Options for `print-repair`. The mesh goes in a `model3d` part. */
export interface MeshyPrintRepairOptions {
  /** Make a preview image with a transparent background. */
  alpha_thumbnail?: boolean
  /** Printer type. It sets the minimum wall thickness. */
  printer_type?: 'fdm' | 'sla' | 'full_color'
  /** Planned print height in millimeters. Do not set it with the longest side. */
  intended_print_height_mm?: number
  /** Planned print longest side in millimeters. */
  intended_print_longest_side_mm?: number
}

/**
 * Options for `print-split`. The task to split goes in a `model3d` part with
 * a Meshy `file` source. The text names the parts and goes to `prompt`.
 */
export interface MeshyPrintSplitOptions {
  /** `auto` picks the cuts. `by_parts` and `by_color` use the prompt. */
  mode?: 'auto' | 'by_parts' | 'by_color'
  /** File formats to make. */
  target_formats?: Array<MeshyTargetFormat | 'blend'>
  /** Keep the parts in place, or lay them flat on the build plate. */
  layout?: 'assembled' | 'on_plate'
  /** Keep the texture of the input model on every part. */
  keep_texture?: boolean
  /** Add connectors at each cut. */
  connectors?: boolean
  /** Connector shape. */
  connector_type?: 'cube' | 'cylinder'
  /** Connector size, 0.1 to 0.8 of the cut surface. */
  connector_size?: number
  /** Connector height, 0.1 to 0.8 of the cut surface. */
  connector_height?: number
}

/** Options for `relief`. One image part goes to `image_url`. */
export interface MeshyReliefOptions {
  /** `high` carves deeper. `low` is for engraving and thin plaques. */
  variant?: 'high' | 'low'
  /** Set `false` to make only the depth map. */
  should_generate_model?: boolean
  /** Length of the longer side of the photo, 20 to 250 millimeters. */
  size_mm?: number
  /** `emboss` raises the near parts. `engrave` cuts them in. */
  carving_mode?: 'emboss' | 'engrave'
  /** Carving depth, 0 to 60 millimeters. */
  carving_depth_mm?: number
  /** Cut away the background and make no base plate. */
  remove_base?: boolean
  /** Depth below which `remove_base` cuts, 0.01 to 1. */
  removal_threshold?: number
  /** Thickness of the base plate, 0.1 to 10 millimeters. */
  base_thickness_mm?: number
  /** Bend the relief. */
  bend_mode?: 'off' | 'convex' | 'concave'
  /** Which edges the bend curls. */
  bend_axis?: 'xz' | 'yz'
  /** Arc of the bend in degrees, 0 to 360. */
  bend_angle?: number
  /** Mesh points along the longer side, 512 to 2048. */
  mesh_resolution?: number
  /** File formats to make. Defaults to `['glb', 'stl']`. */
  target_formats?: Array<MeshyTargetFormat>
  /** Color the model with the photo. */
  color_mapping?: boolean
}

interface MeshyModel3dProviderOptionsByEndpoint {
  'text-to-3d-preview': MeshyTextTo3dPreviewOptions
  'text-to-3d-refine': MeshyTextTo3dRefineOptions
  'image-to-3d': MeshyImageTo3dOptions
  'multi-image-to-3d': MeshyMultiImageTo3dOptions
  retexture: MeshyRetextureOptions
  remesh: MeshyRemeshOptions
  convert: MeshyConvertOptions
  resize: MeshyResizeOptions
  'uv-unwrap': MeshyUvUnwrapOptions
  rigging: MeshyRiggingOptions
  animation: MeshyAnimationOptions
  'print-multi-color': MeshyPrintMultiColorOptions
  'print-repair': MeshyPrintRepairOptions
  'print-split': MeshyPrintSplitOptions
  relief: MeshyReliefOptions
}

/**
 * The `modelOptions` of an endpoint, with Meshy's own field names. The fields
 * that the prompt parts set are not here.
 *
 * @experimental Meshy support is experimental and may change.
 */
export type MeshyModel3dProviderOptions<E extends MeshyModel3dEndpoint> =
  MeshyModel3dProviderOptionsByEndpoint[E]
