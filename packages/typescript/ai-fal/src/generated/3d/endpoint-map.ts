// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaBytedanceSeed3dImageTo3dInput,
  zSchemaBytedanceSeed3dImageTo3dOutput,
  zSchemaHunyuan3dV21Input,
  zSchemaHunyuan3dV21Output,
  zSchemaHunyuan3dV2Input,
  zSchemaHunyuan3dV2MiniInput,
  zSchemaHunyuan3dV2MiniOutput,
  zSchemaHunyuan3dV2MiniTurboInput,
  zSchemaHunyuan3dV2MiniTurboOutput,
  zSchemaHunyuan3dV2MultiViewInput,
  zSchemaHunyuan3dV2MultiViewOutput,
  zSchemaHunyuan3dV2MultiViewTurboInput,
  zSchemaHunyuan3dV2MultiViewTurboOutput,
  zSchemaHunyuan3dV2Output,
  zSchemaHunyuan3dV2TurboInput,
  zSchemaHunyuan3dV2TurboOutput,
  zSchemaHunyuan3dV3ImageTo3dInput,
  zSchemaHunyuan3dV3ImageTo3dOutput,
  zSchemaHunyuan3dV3SketchTo3dInput,
  zSchemaHunyuan3dV3SketchTo3dOutput,
  zSchemaHunyuan3dV3TextTo3dInput,
  zSchemaHunyuan3dV3TextTo3dOutput,
  zSchemaHunyuanMotionFastInput,
  zSchemaHunyuanMotionFastOutput,
  zSchemaHunyuanMotionInput,
  zSchemaHunyuanMotionOutput,
  zSchemaHunyuanPartInput,
  zSchemaHunyuanPartOutput,
  zSchemaHunyuanWorldImageToWorldInput,
  zSchemaHunyuanWorldImageToWorldOutput,
  zSchemaHyper3dRodinInput,
  zSchemaHyper3dRodinOutput,
  zSchemaHyper3dRodinV2Input,
  zSchemaHyper3dRodinV2Output,
  zSchemaMeshyV5MultiImageTo3dInput,
  zSchemaMeshyV5MultiImageTo3dOutput,
  zSchemaMeshyV5RemeshInput,
  zSchemaMeshyV5RemeshOutput,
  zSchemaMeshyV5RetextureInput,
  zSchemaMeshyV5RetextureOutput,
  zSchemaMeshyV6PreviewImageTo3dInput,
  zSchemaMeshyV6PreviewImageTo3dOutput,
  zSchemaMeshyV6PreviewTextTo3dInput,
  zSchemaMeshyV6PreviewTextTo3dOutput,
  zSchemaOmnipartInput,
  zSchemaOmnipartOutput,
  zSchemaPshumanInput,
  zSchemaPshumanOutput,
  zSchemaSam33dAlignInput,
  zSchemaSam33dAlignOutput,
  zSchemaSam33dBodyInput,
  zSchemaSam33dBodyOutput,
  zSchemaSam33dObjectsInput,
  zSchemaSam33dObjectsOutput,
  zSchemaTrellis2Input,
  zSchemaTrellis2Output,
  zSchemaTrellisInput,
  zSchemaTrellisMultiInput,
  zSchemaTrellisMultiOutput,
  zSchemaTrellisOutput,
  zSchemaTripoV25ImageTo3dInput,
  zSchemaTripoV25ImageTo3dOutput,
  zSchemaTripoV25MultiviewTo3dInput,
  zSchemaTripoV25MultiviewTo3dOutput,
  zSchemaTriposrInput,
  zSchemaTriposrOutput,
  zSchemaUltrashapeInput,
  zSchemaUltrashapeOutput,
} from './zod.gen'
import type { z } from 'zod'

import type {
  SchemaBytedanceSeed3dImageTo3dInput,
  SchemaBytedanceSeed3dImageTo3dOutput,
  SchemaHunyuan3dV21Input,
  SchemaHunyuan3dV21Output,
  SchemaHunyuan3dV2Input,
  SchemaHunyuan3dV2MiniInput,
  SchemaHunyuan3dV2MiniOutput,
  SchemaHunyuan3dV2MiniTurboInput,
  SchemaHunyuan3dV2MiniTurboOutput,
  SchemaHunyuan3dV2MultiViewInput,
  SchemaHunyuan3dV2MultiViewOutput,
  SchemaHunyuan3dV2MultiViewTurboInput,
  SchemaHunyuan3dV2MultiViewTurboOutput,
  SchemaHunyuan3dV2Output,
  SchemaHunyuan3dV2TurboInput,
  SchemaHunyuan3dV2TurboOutput,
  SchemaHunyuan3dV3ImageTo3dInput,
  SchemaHunyuan3dV3ImageTo3dOutput,
  SchemaHunyuan3dV3SketchTo3dInput,
  SchemaHunyuan3dV3SketchTo3dOutput,
  SchemaHunyuan3dV3TextTo3dInput,
  SchemaHunyuan3dV3TextTo3dOutput,
  SchemaHunyuanMotionFastInput,
  SchemaHunyuanMotionFastOutput,
  SchemaHunyuanMotionInput,
  SchemaHunyuanMotionOutput,
  SchemaHunyuanPartInput,
  SchemaHunyuanPartOutput,
  SchemaHunyuanWorldImageToWorldInput,
  SchemaHunyuanWorldImageToWorldOutput,
  SchemaHyper3dRodinInput,
  SchemaHyper3dRodinOutput,
  SchemaHyper3dRodinV2Input,
  SchemaHyper3dRodinV2Output,
  SchemaMeshyV5MultiImageTo3dInput,
  SchemaMeshyV5MultiImageTo3dOutput,
  SchemaMeshyV5RemeshInput,
  SchemaMeshyV5RemeshOutput,
  SchemaMeshyV5RetextureInput,
  SchemaMeshyV5RetextureOutput,
  SchemaMeshyV6PreviewImageTo3dInput,
  SchemaMeshyV6PreviewImageTo3dOutput,
  SchemaMeshyV6PreviewTextTo3dInput,
  SchemaMeshyV6PreviewTextTo3dOutput,
  SchemaOmnipartInput,
  SchemaOmnipartOutput,
  SchemaPshumanInput,
  SchemaPshumanOutput,
  SchemaSam33dAlignInput,
  SchemaSam33dAlignOutput,
  SchemaSam33dBodyInput,
  SchemaSam33dBodyOutput,
  SchemaSam33dObjectsInput,
  SchemaSam33dObjectsOutput,
  SchemaTrellis2Input,
  SchemaTrellis2Output,
  SchemaTrellisInput,
  SchemaTrellisMultiInput,
  SchemaTrellisMultiOutput,
  SchemaTrellisOutput,
  SchemaTripoV25ImageTo3dInput,
  SchemaTripoV25ImageTo3dOutput,
  SchemaTripoV25MultiviewTo3dInput,
  SchemaTripoV25MultiviewTo3dOutput,
  SchemaTriposrInput,
  SchemaTriposrOutput,
  SchemaUltrashapeInput,
  SchemaUltrashapeOutput,
} from './types.gen'

export type Gen3dEndpointMap = {
  'fal-ai/ultrashape': {
    input: SchemaUltrashapeInput
    output: SchemaUltrashapeOutput
  }
  'fal-ai/sam-3/3d-align': {
    input: SchemaSam33dAlignInput
    output: SchemaSam33dAlignOutput
  }
  'fal-ai/meshy/v5/retexture': {
    input: SchemaMeshyV5RetextureInput
    output: SchemaMeshyV5RetextureOutput
  }
  'fal-ai/meshy/v5/remesh': {
    input: SchemaMeshyV5RemeshInput
    output: SchemaMeshyV5RemeshOutput
  }
  'fal-ai/hunyuan-part': {
    input: SchemaHunyuanPartInput
    output: SchemaHunyuanPartOutput
  }
  'fal-ai/trellis-2': {
    input: SchemaTrellis2Input
    output: SchemaTrellis2Output
  }
  'fal-ai/hunyuan3d-v3/sketch-to-3d': {
    input: SchemaHunyuan3dV3SketchTo3dInput
    output: SchemaHunyuan3dV3SketchTo3dOutput
  }
  'fal-ai/hunyuan3d-v3/image-to-3d': {
    input: SchemaHunyuan3dV3ImageTo3dInput
    output: SchemaHunyuan3dV3ImageTo3dOutput
  }
  'fal-ai/sam-3/3d-body': {
    input: SchemaSam33dBodyInput
    output: SchemaSam33dBodyOutput
  }
  'fal-ai/sam-3/3d-objects': {
    input: SchemaSam33dObjectsInput
    output: SchemaSam33dObjectsOutput
  }
  'fal-ai/omnipart': {
    input: SchemaOmnipartInput
    output: SchemaOmnipartOutput
  }
  'fal-ai/bytedance/seed3d/image-to-3d': {
    input: SchemaBytedanceSeed3dImageTo3dInput
    output: SchemaBytedanceSeed3dImageTo3dOutput
  }
  'fal-ai/meshy/v5/multi-image-to-3d': {
    input: SchemaMeshyV5MultiImageTo3dInput
    output: SchemaMeshyV5MultiImageTo3dOutput
  }
  'fal-ai/meshy/v6-preview/image-to-3d': {
    input: SchemaMeshyV6PreviewImageTo3dInput
    output: SchemaMeshyV6PreviewImageTo3dOutput
  }
  'fal-ai/hyper3d/rodin/v2': {
    input: SchemaHyper3dRodinV2Input
    output: SchemaHyper3dRodinV2Output
  }
  'fal-ai/pshuman': {
    input: SchemaPshumanInput
    output: SchemaPshumanOutput
  }
  'fal-ai/hunyuan_world/image-to-world': {
    input: SchemaHunyuanWorldImageToWorldInput
    output: SchemaHunyuanWorldImageToWorldOutput
  }
  'tripo3d/tripo/v2.5/multiview-to-3d': {
    input: SchemaTripoV25MultiviewTo3dInput
    output: SchemaTripoV25MultiviewTo3dOutput
  }
  'fal-ai/hunyuan3d-v21': {
    input: SchemaHunyuan3dV21Input
    output: SchemaHunyuan3dV21Output
  }
  'fal-ai/trellis/multi': {
    input: SchemaTrellisMultiInput
    output: SchemaTrellisMultiOutput
  }
  'tripo3d/tripo/v2.5/image-to-3d': {
    input: SchemaTripoV25ImageTo3dInput
    output: SchemaTripoV25ImageTo3dOutput
  }
  'fal-ai/hunyuan3d/v2/multi-view/turbo': {
    input: SchemaHunyuan3dV2MultiViewTurboInput
    output: SchemaHunyuan3dV2MultiViewTurboOutput
  }
  'fal-ai/hunyuan3d/v2': {
    input: SchemaHunyuan3dV2Input
    output: SchemaHunyuan3dV2Output
  }
  'fal-ai/hunyuan3d/v2/mini': {
    input: SchemaHunyuan3dV2MiniInput
    output: SchemaHunyuan3dV2MiniOutput
  }
  'fal-ai/hunyuan3d/v2/multi-view': {
    input: SchemaHunyuan3dV2MultiViewInput
    output: SchemaHunyuan3dV2MultiViewOutput
  }
  'fal-ai/hunyuan3d/v2/turbo': {
    input: SchemaHunyuan3dV2TurboInput
    output: SchemaHunyuan3dV2TurboOutput
  }
  'fal-ai/hunyuan3d/v2/mini/turbo': {
    input: SchemaHunyuan3dV2MiniTurboInput
    output: SchemaHunyuan3dV2MiniTurboOutput
  }
  'fal-ai/hyper3d/rodin': {
    input: SchemaHyper3dRodinInput
    output: SchemaHyper3dRodinOutput
  }
  'fal-ai/trellis': {
    input: SchemaTrellisInput
    output: SchemaTrellisOutput
  }
  'fal-ai/triposr': {
    input: SchemaTriposrInput
    output: SchemaTriposrOutput
  }
  'fal-ai/hunyuan-motion/fast': {
    input: SchemaHunyuanMotionFastInput
    output: SchemaHunyuanMotionFastOutput
  }
  'fal-ai/hunyuan-motion': {
    input: SchemaHunyuanMotionInput
    output: SchemaHunyuanMotionOutput
  }
  'fal-ai/hunyuan3d-v3/text-to-3d': {
    input: SchemaHunyuan3dV3TextTo3dInput
    output: SchemaHunyuan3dV3TextTo3dOutput
  }
  'fal-ai/meshy/v6-preview/text-to-3d': {
    input: SchemaMeshyV6PreviewTextTo3dInput
    output: SchemaMeshyV6PreviewTextTo3dOutput
  }
}

/** Union type of all 3d model endpoint IDs */
export type Gen3dModel = keyof Gen3dEndpointMap

export const Gen3dSchemaMap: Record<
  Gen3dModel,
  {
    input: z.ZodSchema<Gen3dModelInput<Gen3dModel>>
    output: z.ZodSchema<Gen3dModelOutput<Gen3dModel>>
  }
> = {
  ['fal-ai/ultrashape']: {
    input: zSchemaUltrashapeInput,
    output: zSchemaUltrashapeOutput,
  },
  ['fal-ai/sam-3/3d-align']: {
    input: zSchemaSam33dAlignInput,
    output: zSchemaSam33dAlignOutput,
  },
  ['fal-ai/meshy/v5/retexture']: {
    input: zSchemaMeshyV5RetextureInput,
    output: zSchemaMeshyV5RetextureOutput,
  },
  ['fal-ai/meshy/v5/remesh']: {
    input: zSchemaMeshyV5RemeshInput,
    output: zSchemaMeshyV5RemeshOutput,
  },
  ['fal-ai/hunyuan-part']: {
    input: zSchemaHunyuanPartInput,
    output: zSchemaHunyuanPartOutput,
  },
  ['fal-ai/trellis-2']: {
    input: zSchemaTrellis2Input,
    output: zSchemaTrellis2Output,
  },
  ['fal-ai/hunyuan3d-v3/sketch-to-3d']: {
    input: zSchemaHunyuan3dV3SketchTo3dInput,
    output: zSchemaHunyuan3dV3SketchTo3dOutput,
  },
  ['fal-ai/hunyuan3d-v3/image-to-3d']: {
    input: zSchemaHunyuan3dV3ImageTo3dInput,
    output: zSchemaHunyuan3dV3ImageTo3dOutput,
  },
  ['fal-ai/sam-3/3d-body']: {
    input: zSchemaSam33dBodyInput,
    output: zSchemaSam33dBodyOutput,
  },
  ['fal-ai/sam-3/3d-objects']: {
    input: zSchemaSam33dObjectsInput,
    output: zSchemaSam33dObjectsOutput,
  },
  ['fal-ai/omnipart']: {
    input: zSchemaOmnipartInput,
    output: zSchemaOmnipartOutput,
  },
  ['fal-ai/bytedance/seed3d/image-to-3d']: {
    input: zSchemaBytedanceSeed3dImageTo3dInput,
    output: zSchemaBytedanceSeed3dImageTo3dOutput,
  },
  ['fal-ai/meshy/v5/multi-image-to-3d']: {
    input: zSchemaMeshyV5MultiImageTo3dInput,
    output: zSchemaMeshyV5MultiImageTo3dOutput,
  },
  ['fal-ai/meshy/v6-preview/image-to-3d']: {
    input: zSchemaMeshyV6PreviewImageTo3dInput,
    output: zSchemaMeshyV6PreviewImageTo3dOutput,
  },
  ['fal-ai/hyper3d/rodin/v2']: {
    input: zSchemaHyper3dRodinV2Input,
    output: zSchemaHyper3dRodinV2Output,
  },
  ['fal-ai/pshuman']: {
    input: zSchemaPshumanInput,
    output: zSchemaPshumanOutput,
  },
  ['fal-ai/hunyuan_world/image-to-world']: {
    input: zSchemaHunyuanWorldImageToWorldInput,
    output: zSchemaHunyuanWorldImageToWorldOutput,
  },
  ['tripo3d/tripo/v2.5/multiview-to-3d']: {
    input: zSchemaTripoV25MultiviewTo3dInput,
    output: zSchemaTripoV25MultiviewTo3dOutput,
  },
  ['fal-ai/hunyuan3d-v21']: {
    input: zSchemaHunyuan3dV21Input,
    output: zSchemaHunyuan3dV21Output,
  },
  ['fal-ai/trellis/multi']: {
    input: zSchemaTrellisMultiInput,
    output: zSchemaTrellisMultiOutput,
  },
  ['tripo3d/tripo/v2.5/image-to-3d']: {
    input: zSchemaTripoV25ImageTo3dInput,
    output: zSchemaTripoV25ImageTo3dOutput,
  },
  ['fal-ai/hunyuan3d/v2/multi-view/turbo']: {
    input: zSchemaHunyuan3dV2MultiViewTurboInput,
    output: zSchemaHunyuan3dV2MultiViewTurboOutput,
  },
  ['fal-ai/hunyuan3d/v2']: {
    input: zSchemaHunyuan3dV2Input,
    output: zSchemaHunyuan3dV2Output,
  },
  ['fal-ai/hunyuan3d/v2/mini']: {
    input: zSchemaHunyuan3dV2MiniInput,
    output: zSchemaHunyuan3dV2MiniOutput,
  },
  ['fal-ai/hunyuan3d/v2/multi-view']: {
    input: zSchemaHunyuan3dV2MultiViewInput,
    output: zSchemaHunyuan3dV2MultiViewOutput,
  },
  ['fal-ai/hunyuan3d/v2/turbo']: {
    input: zSchemaHunyuan3dV2TurboInput,
    output: zSchemaHunyuan3dV2TurboOutput,
  },
  ['fal-ai/hunyuan3d/v2/mini/turbo']: {
    input: zSchemaHunyuan3dV2MiniTurboInput,
    output: zSchemaHunyuan3dV2MiniTurboOutput,
  },
  ['fal-ai/hyper3d/rodin']: {
    input: zSchemaHyper3dRodinInput,
    output: zSchemaHyper3dRodinOutput,
  },
  ['fal-ai/trellis']: {
    input: zSchemaTrellisInput,
    output: zSchemaTrellisOutput,
  },
  ['fal-ai/triposr']: {
    input: zSchemaTriposrInput,
    output: zSchemaTriposrOutput,
  },
  ['fal-ai/hunyuan-motion/fast']: {
    input: zSchemaHunyuanMotionFastInput,
    output: zSchemaHunyuanMotionFastOutput,
  },
  ['fal-ai/hunyuan-motion']: {
    input: zSchemaHunyuanMotionInput,
    output: zSchemaHunyuanMotionOutput,
  },
  ['fal-ai/hunyuan3d-v3/text-to-3d']: {
    input: zSchemaHunyuan3dV3TextTo3dInput,
    output: zSchemaHunyuan3dV3TextTo3dOutput,
  },
  ['fal-ai/meshy/v6-preview/text-to-3d']: {
    input: zSchemaMeshyV6PreviewTextTo3dInput,
    output: zSchemaMeshyV6PreviewTextTo3dOutput,
  },
}

/** Get the input type for a specific 3d model */
export type Gen3dModelInput<T extends Gen3dModel> = Gen3dEndpointMap[T]['input']

/** Get the output type for a specific 3d model */
export type Gen3dModelOutput<T extends Gen3dModel> =
  Gen3dEndpointMap[T]['output']
