/**
 * The Tripo 3D endpoints that `tripo3dModel()` can call. The endpoint is the
 * adapter model.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoModel3dEndpoint =
  | 'text-to-model'
  | 'image-to-model'
  | 'multiview-to-model'
  | 'texture'
  | 'convert'
  | 'rig'
  | 'retarget'
  | 'decimate'
  | 'uv'
  | 'segment'

/**
 * The API path of each endpoint, relative to the Tripo base URL
 * (`https://openapi.tripo3d.ai/v3`). Create is `POST <path>`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export const TRIPO_ENDPOINT_PATHS: Record<TripoModel3dEndpoint, string> = {
  'text-to-model': '/generation/text-to-model',
  'image-to-model': '/generation/image-to-model',
  'multiview-to-model': '/generation/multiview-to-model',
  texture: '/models/texture',
  convert: '/models/convert',
  rig: '/animations/rig',
  retarget: '/animations/retarget',
  decimate: '/mesh/decimate',
  uv: '/mesh/uv',
  segment: '/mesh/segment',
}

/**
 * Where the prompt parts of one endpoint go.
 *
 * - `text`: the request field for the prompt text, or `null` for no text.
 *   `'texture_prompt'` puts the text in `texture_prompt.text`.
 * - `image`: `'input'` takes one image, `'inputs'` takes 2 to 4 views (front,
 *   left, back, right). `'texture_prompt'` puts one image in
 *   `texture_prompt.image` (or `style_image` next to a text), and 2 to 4 images
 *   in `texture_prompt.images`. `null` for no images.
 * - `mesh`: the mesh goes to `input`. `taskIdOnly` when the endpoint takes
 *   only a Tripo task id (a `file` source). `null` for no mesh.
 */
interface TripoPromptRoute {
  text: 'prompt' | 'texture_prompt' | null
  image: 'input' | 'inputs' | 'texture_prompt' | null
  mesh: { taskIdOnly: boolean } | null
}

const ANY_MESH = { taskIdOnly: false } as const

/**
 * The prompt routes of every endpoint. The prompt modality types below come
 * from this table, so the types and the runtime check cannot drift.
 *
 * @experimental Tripo support is experimental and may change.
 */
export const TRIPO_PROMPT_ROUTES = {
  'text-to-model': { text: 'prompt', image: null, mesh: null },
  'image-to-model': { text: null, image: 'input', mesh: null },
  'multiview-to-model': { text: null, image: 'inputs', mesh: null },
  texture: { text: 'texture_prompt', image: 'texture_prompt', mesh: ANY_MESH },
  convert: { text: null, image: null, mesh: ANY_MESH },
  rig: { text: null, image: null, mesh: ANY_MESH },
  retarget: { text: null, image: null, mesh: { taskIdOnly: true } },
  decimate: { text: null, image: null, mesh: ANY_MESH },
  uv: { text: null, image: null, mesh: ANY_MESH },
  segment: { text: null, image: null, mesh: ANY_MESH },
} as const satisfies Record<TripoModel3dEndpoint, TripoPromptRoute>

type TripoPromptRouteFor<E extends TripoModel3dEndpoint> =
  (typeof TRIPO_PROMPT_ROUTES)[E]

/**
 * The non-text prompt parts that an endpoint takes, for the
 * `generate3dModel()` prompt type.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoModel3dInputModalities<E extends TripoModel3dEndpoint> =
  ReadonlyArray<
    | (TripoPromptRouteFor<E>['image'] extends null ? never : 'image')
    | (TripoPromptRouteFor<E>['mesh'] extends null ? never : 'model3d')
  >

/**
 * The `model` values of the generation endpoints (`text-to-model`,
 * `image-to-model`, `multiview-to-model`). `v*` is the H series, `P*` is the
 * P series (low poly).
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoGenerationModel =
  | 'v3.1-20260211'
  | 'v3.0-20250812'
  | 'v2.5-20250123'
  | 'P1-20260311'
  | 'P2-20260801'

/**
 * The generation model that the adapter sends when the caller gives no model.
 *
 * @experimental Tripo support is experimental and may change.
 */
export const DEFAULT_TRIPO_GENERATION_MODEL =
  'v3.1-20260211' satisfies TripoGenerationModel

/**
 * The `model` values of the `texture` endpoint.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoTextureModel =
  | 'v3.5-20260815'
  | 'v3.0-20250812'
  | 'v2.5-20250123'

/**
 * The `model` values of the `rig` endpoint.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoRigModel = 'v1.0-20240301' | 'v2.5-20260210' | 'v3.0-20260909'

/**
 * The `model` values of the `decimate` endpoint.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoDecimateModel = 'v1.0' | 'v2.0' | 'v3.0'

/**
 * The `model` values of the `segment` endpoint.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoSegmentModel = 'v1.0-20250506' | 'v2.0-20260430'

interface TripoModelByEndpoint {
  'text-to-model': TripoGenerationModel
  'image-to-model': TripoGenerationModel
  'multiview-to-model': TripoGenerationModel
  texture: TripoTextureModel
  convert: never
  rig: TripoRigModel
  retarget: never
  decimate: TripoDecimateModel
  // ponytail: uv takes only `model: 'default'`, so it has no model choice.
  uv: never
  segment: TripoSegmentModel
}

/**
 * The Tripo `model` values an endpoint takes. `never` when the endpoint has no
 * model choice.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoModelFor<E extends TripoModel3dEndpoint> =
  TripoModelByEndpoint[E]

interface TripoDefaultModelByEndpoint {
  'text-to-model': typeof DEFAULT_TRIPO_GENERATION_MODEL
  'image-to-model': typeof DEFAULT_TRIPO_GENERATION_MODEL
  'multiview-to-model': typeof DEFAULT_TRIPO_GENERATION_MODEL
  texture: 'v3.5-20260815'
  convert: never
  rig: 'v1.0-20240301'
  retarget: never
  decimate: 'v2.0'
  uv: never
  segment: 'v1.0-20250506'
}

/**
 * The model that runs when the caller gives no model. On the generation
 * endpoints it is `DEFAULT_TRIPO_GENERATION_MODEL`, which the adapter sends.
 * On the other endpoints it is the Tripo default for an omitted `model`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoDefaultModelFor<E extends TripoModel3dEndpoint> =
  TripoDefaultModelByEndpoint[E]

type TripoExportOrientation = '+x' | '-x' | '+y' | '-y'
type TripoTextureQuality = 'fast' | 'standard' | 'detailed' | 'extreme'
type TripoTextureAlignment = 'original_image' | 'geometry'
type TripoOutFormat = 'glb' | 'fbx'

/** Fields that every generation model takes on every generation endpoint. */
interface TripoGenerationBaseOptions {
  /** Geometry seed. The same seed and input give the same mesh. */
  model_seed?: number
  /**
   * Maximum face count. Omit it for adaptive topology. H series triangle
   * limits: v3.1 1,500,000 (2,000,000 with `geometry_quality: 'detailed'`),
   * v3.0 1,000,000 (2,000,000 detailed), v2.5 500,000. Quad: 150,000. P1: 50
   * to 20,000. P2: 48 to 50,000 triangles, 48 to 25,000 quads.
   */
  face_limit?: number
  /** Make texture maps. Defaults to `true`. */
  texture?: boolean
  /** Make PBR maps. Defaults to `true`. `true` forces `texture` on. */
  pbr?: boolean
  /** Texture seed. Keep `model_seed` and change this for new textures only. */
  texture_seed?: number
  /**
   * Texture model, set apart from `model`. Defaults to `v2.5-20250123` for v2.5
   * geometry and to `v3.5-20260815` for all other geometry.
   */
  texture_version?: TripoTextureModel
  /**
   * Remove baked lighting from the reference image. Only the `v3.5-20260815`
   * texture model reads it. Defaults to `false`, or to `true` when
   * `texture_version` is set to `v3.5-20260815`.
   */
  delight?: boolean
  /**
   * Forward axis of the export. Defaults to `+x`. Leave it unset if a later
   * task (texture, rig, convert) uses the model.
   */
  export_orientation?: TripoExportOrientation
  /** Unwrap UVs. Defaults to `true`. `false` is faster and smaller. */
  export_uv?: boolean
}

/** Generation fields of `P1-20260311`. */
interface TripoGenerationP1Options extends TripoGenerationBaseOptions {
  /**
   * Texture quality. Defaults to `standard`. `extreme` makes 8K textures and
   * costs more. `fast` needs the `v3.5-20260815` texture model.
   */
  texture_quality?: TripoTextureQuality
  /** Scale the model to real-world size in meters. Defaults to `false`. */
  auto_size?: boolean
}

/** Generation fields of `P2-20260801`. */
interface TripoGenerationP2Options extends TripoGenerationP1Options {
  /**
   * Make a quad mesh. Defaults to `false`. On the H series it forces FBX
   * output and a face count of 10,000 when `face_limit` is not set.
   */
  quad?: boolean
}

/** Generation fields of the H series from `v3.0-20250812`. */
interface TripoGenerationH3Options extends TripoGenerationP2Options {
  /** `detailed` is Ultra mode with finer geometry. Defaults to `standard`. */
  geometry_quality?: 'standard' | 'detailed'
  /**
   * Make a low-poly model with clean, hand-made topology. Best for simple
   * inputs. Face limits: 500 to 20,000 triangles, 500 to 10,000 quads.
   */
  smart_low_poly?: boolean
  /**
   * Make editable parts. Set `texture: false` and `pbr: false`, or Tripo
   * rejects the task with code 1004. `quad` is ignored, and `smart_low_poly`
   * turns the parts off.
   */
  generate_parts?: boolean
  /** `geometry` uses meshopt compression for a smaller file. */
  compress?: 'geometry'
}

// Tripo: texture_quality, geometry_quality, auto_size, quad, smart_low_poly,
// generate_parts, and compress need model >= v3.0. The P pages list
// texture_quality, auto_size, and (P2 only) quad.
interface TripoGenerationOptionsByModel {
  'v3.1-20260211': TripoGenerationH3Options
  'v3.0-20250812': TripoGenerationH3Options
  'v2.5-20250123': TripoGenerationBaseOptions
  'P1-20260311': TripoGenerationP1Options
  'P2-20260801': TripoGenerationP2Options
}

/** Fields that image to model and multiview to model share. */
interface TripoImageGenerationOptions {
  /** `original_image` follows the input colors, `geometry` the mesh. */
  texture_alignment?: TripoTextureAlignment
  /**
   * `align_image` turns the model to the input image view. Defaults to
   * `default`. Works only with `texture: true`.
   */
  orientation?: 'default' | 'align_image'
}

/**
 * Options for `text-to-model`. The prompt text goes to `prompt`. The fields
 * depend on the model `M`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoTextToModelOptions<M extends TripoGenerationModel> =
  TripoGenerationOptionsByModel[M] & {
    /** What the model must not have, up to 255 characters. */
    negative_prompt?: string
    /** Seed of the internal text to image stage. */
    image_seed?: number
  }

/**
 * Options for `image-to-model`. One image part goes to `input`. The fields
 * depend on the model `M`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoImageToModelOptions<M extends TripoGenerationModel> =
  TripoGenerationOptionsByModel[M] &
    TripoImageGenerationOptions & {
      /** Make a low-quality input image better first. Defaults to `false`. */
      enable_image_autofix?: boolean
    }

/**
 * Options for `multiview-to-model`. 2 to 4 image parts go to `inputs`, in the
 * order front, left, back, right. The fields depend on the model `M`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoMultiviewToModelOptions<M extends TripoGenerationModel> =
  TripoGenerationOptionsByModel[M] & TripoImageGenerationOptions

/**
 * Options for `texture`. The mesh goes in a `model3d` part. The text and the
 * images go to `texture_prompt`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface TripoTextureOptions {
  /** Make PBR maps. Defaults to `true`. */
  pbr?: boolean
  /** Texture seed. The same seed gives the same textures. */
  texture_seed?: number
  /** `original_image` follows the reference colors, `geometry` the mesh. */
  texture_alignment?: TripoTextureAlignment
  /**
   * Texture quality. Defaults to `standard`. `extreme` makes 8K textures and
   * costs more. `fast` fails with code 1004 on `v2.5-20250123`.
   */
  texture_quality?: TripoTextureQuality
  /** Parts from a segment task to texture. Omit it to texture all parts. */
  part_names?: Array<string>
  /** `geometry` uses meshopt compression for a smaller file. */
  compress?: 'geometry'
  /** Bake advanced material effects into the base textures. Defaults to `true`. */
  bake?: boolean
  /**
   * Remove baked lighting from the reference image. Only `v3.5-20260815`
   * reads it. Defaults to `false`, or to `true` when `model` is set to
   * `v3.5-20260815`.
   */
  delight?: boolean
}

/**
 * Options for `convert`. The mesh goes in a `model3d` part.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface TripoConvertOptions {
  /** Output file format. */
  format: 'GLTF' | 'FBX' | 'USDZ' | 'OBJ' | 'STL' | '3MF'
  /** Make a quad mesh. Forces FBX output. Defaults to `false`. */
  quad?: boolean
  /** Force symmetry. Works only with `quad: true`. */
  force_symmetry?: boolean
  /** Maximum face count. Omit it to keep the face count. */
  face_limit?: number
  /** Flatten the bottom of the model. Defaults to `false`. */
  flatten_bottom?: boolean
  /** Depth of the bottom flattening. Defaults to `0.01`. */
  flatten_bottom_threshold?: number
  /** Diffuse texture size in pixels. Defaults to `4096`. */
  texture_size?: number
  /** Texture image format. Defaults to `JPEG`. */
  texture_format?:
    | 'JPEG'
    | 'PNG'
    | 'WEBP'
    | 'BMP'
    | 'DPX'
    | 'HDR'
    | 'OPEN_EXR'
    | 'TARGA'
    | 'TIFF'
  /** Bake advanced materials into the base textures. Defaults to `true`. */
  bake?: boolean
  /** Pack all UVs into one layout. Defaults to `false`. */
  pack_uv?: boolean
  /** Include vertex colors. Only for `OBJ` and `GLTF`. */
  export_vertex_colors?: boolean
  /** Move the pivot to the bottom center. Defaults to `false`. */
  pivot_to_center_bottom?: boolean
  /** Scale factor of the export. Defaults to `1`. */
  scale_factor?: number
  /** Include the skeleton and the animation. Defaults to `true`. */
  with_animation?: boolean
  /** Play the animation with no root movement. Defaults to `false`. */
  animate_in_place?: boolean
  /** Parts from a segment task to export. */
  part_names?: Array<string>
  /** Forward axis of the export. Defaults to `+x`. */
  export_orientation?: TripoExportOrientation
  /** FBX preset for the target tool. Defaults to `blender`. */
  fbx_preset?: 'blender' | '3dsmax' | 'mixamo' | 'bake_scale'
  /**
   * FBX texture delivery. Defaults to `embedded`. `zip` returns a zip with the
   * FBX and a texture folder. Only for `format: 'FBX'`.
   */
  texture_packaging?: 'embedded' | 'zip'
}

type TripoNamedRigType =
  | 'biped'
  | 'quadruped'
  | 'hexapod'
  | 'octopod'
  | 'avian'
  | 'serpentine'
  | 'aquatic'

type TripoRigSpec = 'tripo' | 'mixamo'

// v1.0 rigs bipeds only. `others` and the actorcore, unity, unreal, and vrm
// skeletons need v3.0.
interface TripoRigTypeByModel {
  'v1.0-20240301': 'biped'
  'v2.5-20260210': TripoNamedRigType
  'v3.0-20260909': TripoNamedRigType | 'others'
}

interface TripoRigSpecByModel {
  'v1.0-20240301': TripoRigSpec
  'v2.5-20260210': TripoRigSpec
  'v3.0-20260909': TripoRigSpec | 'actorcore' | 'unity' | 'unreal' | 'vrm'
}

/**
 * Options for `rig`. The mesh goes in a `model3d` part. The fields depend on
 * the model `M`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface TripoRigOptions<M extends TripoRigModel> {
  /**
   * Skeleton type. Defaults to `biped`. On `v2.5-20260210` a biped is rigged
   * as `v3.0-20260909`.
   */
  rig_type?: TripoRigTypeByModel[M]
  /** Bone names of a biped rig. Defaults to `tripo`. */
  spec?: TripoRigSpecByModel[M]
  /** Output format. Defaults to `glb`. */
  out_format?: TripoOutFormat
}

interface TripoRetargetSharedOptions {
  /** Output format. Defaults to `glb`. */
  out_format?: TripoOutFormat
  /** Export the mesh with the animation. Defaults to `true`. */
  export_with_geometry?: boolean
  /** Play the animation with no root movement. Defaults to `false`. */
  animate_in_place?: boolean
}

/**
 * Options for `retarget`. The rigged task goes in a `model3d` part with a
 * Tripo `file` source. Set exactly one of `animation` or `animations`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoRetargetOptions = TripoRetargetSharedOptions &
  (
    | {
        /** One preset, for example `preset:idle` (v3.0 rig) or `preset:biped:wave_goodbye_01` (v1.0 rig). */
        animation: string
        animations?: never
      }
    | {
        animation?: never
        /** 1 to 5 presets. */
        animations: Array<string>
      }
  )

/** Decimate fields of `v1.0`. */
interface TripoDecimateV1Options {
  /** Target face count. */
  face_limit?: number
  /** Make a quad mesh. Defaults to `false`. */
  quad?: boolean
}

/** Decimate fields of `v2.0`. */
interface TripoDecimateV2Options extends TripoDecimateV1Options {
  /** Bake the textures onto the low-poly model. Defaults to `true`. */
  bake?: boolean
  /** Parts from a segment task to decimate. */
  part_names?: Array<string>
}

/** Decimate fields of `v3.0`. */
interface TripoDecimateV3Options extends TripoDecimateV2Options {
  /** Unwrap UVs in the same task. Defaults to `false`. */
  smart_uv?: boolean
}

interface TripoDecimateOptionsByModel {
  'v1.0': TripoDecimateV1Options
  'v2.0': TripoDecimateV2Options
  'v3.0': TripoDecimateV3Options
}

/**
 * Options for `decimate`. The mesh goes in a `model3d` part. The fields
 * depend on the model `M`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoDecimateOptions<M extends TripoDecimateModel> =
  TripoDecimateOptionsByModel[M]

/**
 * Options for `uv`. The mesh goes in a `model3d` part. The mesh can have at
 * most 80,000 triangles (a quad counts as two).
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface TripoUvOptions {
  /** Bake the textures onto the new UVs. Defaults to `true`. */
  bake?: boolean
  /** Forward axis of the export. */
  export_orientation?: TripoExportOrientation
  /** `geometry` uses meshopt compression for a smaller file. */
  compress?: 'geometry'
}

/** Segment fields of `v2.0-20260430`. */
interface TripoSegmentV2Options {
  /** Size of the parts. Defaults to `balanced`. */
  segmentation_granularity?: 'simple' | 'balanced' | 'detailed'
  /** Split by connected components. Defaults to `true`. */
  split_by_connectivity?: boolean
  /**
   * Reference image (a file token or a URL) for the labels. With it, Tripo
   * ignores `segmentation_granularity` and `split_by_connectivity`.
   */
  ref_image?: string
}

interface TripoSegmentOptionsByModel {
  'v1.0-20250506': Record<string, never>
  'v2.0-20260430': TripoSegmentV2Options
}

/**
 * Options for `segment`. The mesh goes in a `model3d` part. Only
 * `v2.0-20260430` has options.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoSegmentOptions<M extends TripoSegmentModel> =
  TripoSegmentOptionsByModel[M]

interface TripoModel3dProviderOptionsByEndpoint<M> {
  'text-to-model': TripoTextToModelOptions<Extract<M, TripoGenerationModel>>
  'image-to-model': TripoImageToModelOptions<Extract<M, TripoGenerationModel>>
  'multiview-to-model': TripoMultiviewToModelOptions<
    Extract<M, TripoGenerationModel>
  >
  texture: TripoTextureOptions
  convert: TripoConvertOptions
  rig: TripoRigOptions<Extract<M, TripoRigModel>>
  retarget: TripoRetargetOptions
  decimate: TripoDecimateOptions<Extract<M, TripoDecimateModel>>
  uv: TripoUvOptions
  segment: TripoSegmentOptions<Extract<M, TripoSegmentModel>>
}

/**
 * The `modelOptions` of an endpoint and model, with Tripo's own field names.
 * The fields that the prompt parts set (`prompt`, `input`, `inputs`,
 * `texture_prompt`) and `model` are not here. With no `M`, the options are
 * those of the default model (`TripoDefaultModelFor<E>`).
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoModel3dProviderOptions<
  E extends TripoModel3dEndpoint,
  M extends TripoModelFor<E> = TripoDefaultModelFor<E>,
> = TripoModel3dProviderOptionsByEndpoint<M>[E]
