/* eslint-disable */
// ---------------------------------------------------------------------------
// AUTO-GENERATED. Do not edit by hand.
//
// Generated from @fal-ai/client@1.11.0 EndpointTypeMap by
// scripts/generate-fal-image-field-map.ts. Regenerate after bumping
// @fal-ai/client:
//
//   pnpm tsx scripts/generate-fal-image-field-map.ts
//
// Maps every fal 3D endpoint that takes an existing mesh to the input field
// for that mesh. Endpoints with no mesh input are not listed. The
// `satisfies` clause below checks every field name against the SDK's
// endpoint input types at compile time (type-only import, so nothing from
// endpoints.d.ts ships at runtime).
// ---------------------------------------------------------------------------
import type { EndpointTypeMap } from '@fal-ai/client/endpoints'

/** sha256 of the endpoints.d.ts this file was generated from. */
export const FAL_MESH_ENDPOINTS_DTS_SHA256 =
  'be36a2f9a11b0c7d011036915e1615f80e60bfc341ec6b770e897770c63cb511'

/** Every input field name that fal 3D endpoints use for an input mesh. */
export type FalMeshFieldName = 'model_url' | 'mesh_url' | 'input_file_url'

/** fal endpoint id -> the input field that takes the mesh. */
export const FAL_MESH_FIELD_MAP = {
  'fal-ai/hunyuan-3d/v3.1/part': 'input_file_url',
  'fal-ai/hunyuan-3d/v3.1/smart-topology': 'input_file_url',
  'fal-ai/meshy/rigging': 'model_url',
  'fal-ai/meshy/rigging/multi-animation': 'model_url',
  'fal-ai/trellis-2/retexture': 'mesh_url',
  'hitem3d/hi3d/multicolor': 'mesh_url',
  'hitem3d/hi3d/split': 'mesh_url',
  'hitem3d/hi3d/texture': 'mesh_url',
  'meshy/v6-lite/retexture': 'model_url',
  'meshy/v6/retexture': 'model_url',
  'meshy/v7/retexture': 'model_url',
  'tripo3d/tripo/remesh': 'mesh_url',
  'tripo3d/tripo/segment': 'mesh_url',
} as const satisfies {
  [K in keyof EndpointTypeMap]?: Extract<
    keyof EndpointTypeMap[K]['input'],
    FalMeshFieldName
  >
}
