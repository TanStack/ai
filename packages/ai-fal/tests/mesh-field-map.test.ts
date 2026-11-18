import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  FAL_MESH_ENDPOINTS_DTS_SHA256,
  FAL_MESH_FIELD_MAP,
} from '../src/model3d/generated/mesh-field-overrides'

describe('generated mesh-field-overrides artifact', () => {
  it('matches the installed @fal-ai/client endpoint types', () => {
    const require = createRequire(import.meta.url)
    const endpointsJs = require.resolve('@fal-ai/client/endpoints')
    const endpointsDts = endpointsJs.replace(/\.js$/, '.d.ts')
    const hash = createHash('sha256')
      .update(readFileSync(endpointsDts))
      .digest('hex')
    expect(
      hash,
      'mesh-field-overrides.ts is stale for the installed @fal-ai/client. Run: pnpm generate:fal-image-fields',
    ).toBe(FAL_MESH_ENDPOINTS_DTS_SHA256)
  })

  it.each([
    ['meshy/v7/retexture', 'model_url'],
    ['tripo3d/tripo/remesh', 'mesh_url'],
    ['fal-ai/trellis-2/retexture', 'mesh_url'],
    ['fal-ai/hunyuan-3d/v3.1/smart-topology', 'input_file_url'],
    ['fal-ai/hunyuan-3d/v3.1/part', 'input_file_url'],
  ])('maps %s to its mesh field %s', (endpointId, field) => {
    expect(Object.entries(FAL_MESH_FIELD_MAP)).toContainEqual([
      endpointId,
      field,
    ])
  })

  it('leaves out an image-to-3D endpoint with no mesh input', () => {
    expect(Object.keys(FAL_MESH_FIELD_MAP)).not.toContain(
      'fal-ai/hunyuan3d-v3/image-to-3d',
    )
  })
})
