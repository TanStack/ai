// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  H31ImageTo3dInputSchema,
  H31ImageTo3dOutputSchema,
  H31MultiviewTo3dInputSchema,
  H31MultiviewTo3dOutputSchema,
  H31TextTo3dInputSchema,
  H31TextTo3dOutputSchema,
  Hunyuan3dV2InputSchema,
  Hunyuan3dV2MiniInputSchema,
  Hunyuan3dV2MiniOutputSchema,
  Hunyuan3dV2MiniTurboInputSchema,
  Hunyuan3dV2MiniTurboOutputSchema,
  Hunyuan3dV2MultiViewInputSchema,
  Hunyuan3dV2MultiViewOutputSchema,
  Hunyuan3dV2MultiViewTurboInputSchema,
  Hunyuan3dV2MultiViewTurboOutputSchema,
  Hunyuan3dV2OutputSchema,
  Hunyuan3dV2TurboInputSchema,
  Hunyuan3dV2TurboOutputSchema,
  Hunyuan3dV31PartInputSchema,
  Hunyuan3dV31PartOutputSchema,
  Hunyuan3dV31ProImageTo3dInputSchema,
  Hunyuan3dV31ProImageTo3dOutputSchema,
  Hunyuan3dV31ProTextTo3dInputSchema,
  Hunyuan3dV31ProTextTo3dOutputSchema,
  Hunyuan3dV31RapidImageTo3dInputSchema,
  Hunyuan3dV31RapidImageTo3dOutputSchema,
  Hunyuan3dV31RapidTextTo3dInputSchema,
  Hunyuan3dV31RapidTextTo3dOutputSchema,
  Hunyuan3dV31SmartTopologyInputSchema,
  Hunyuan3dV31SmartTopologyOutputSchema,
  Hunyuan3dV3ImageTo3dInputSchema,
  Hunyuan3dV3ImageTo3dOutputSchema,
  Hunyuan3dV3SketchTo3dInputSchema,
  Hunyuan3dV3SketchTo3dOutputSchema,
  Hunyuan3dV3TextTo3dInputSchema,
  Hunyuan3dV3TextTo3dOutputSchema,
  HunyuanMotionFastInputSchema,
  HunyuanMotionFastOutputSchema,
  HunyuanMotionInputSchema,
  HunyuanMotionOutputSchema,
  Hunyuan_worldImageToWorldInputSchema,
  Hunyuan_worldImageToWorldOutputSchema,
  Hyper3dRodinInputSchema,
  Hyper3dRodinOutputSchema,
  Hyper3dRodinV25InputSchema,
  Hyper3dRodinV25OutputSchema,
  Hyper3dRodinV25TextTo3dInputSchema,
  Hyper3dRodinV25TextTo3dOutputSchema,
  Hyper3dRodinV2InputSchema,
  Hyper3dRodinV2OutputSchema,
  MeshyRiggingInputSchema,
  MeshyRiggingOutputSchema,
  MeshyV5MultiImageTo3dInputSchema,
  MeshyV5MultiImageTo3dOutputSchema,
  MeshyV5RemeshInputSchema,
  MeshyV5RemeshOutputSchema,
  MeshyV5RetextureInputSchema,
  MeshyV5RetextureOutputSchema,
  MeshyV6ImageTo3dInputSchema,
  MeshyV6ImageTo3dOutputSchema,
  MeshyV6MultiImageTo3dInputSchema,
  MeshyV6MultiImageTo3dOutputSchema,
  MeshyV6PreviewImageTo3dInputSchema,
  MeshyV6PreviewImageTo3dOutputSchema,
  MeshyV6PreviewTextTo3dInputSchema,
  MeshyV6PreviewTextTo3dOutputSchema,
  MeshyV6TextTo3dInputSchema,
  MeshyV6TextTo3dOutputSchema,
  P1ImageTo3dInputSchema,
  P1ImageTo3dOutputSchema,
  P1TextTo3dInputSchema,
  P1TextTo3dOutputSchema,
  Pixal3dInputSchema,
  Pixal3dOutputSchema,
  Reconviagen05InputSchema,
  Reconviagen05OutputSchema,
  Sam33dAlignInputSchema,
  Sam33dAlignOutputSchema,
  Sam33dBodyInputSchema,
  Sam33dBodyOutputSchema,
  Sam33dObjectsInputSchema,
  Sam33dObjectsOutputSchema,
  Trellis2InputSchema,
  Trellis2OutputSchema,
  Trellis2RetextureInputSchema,
  Trellis2RetextureOutputSchema,
  TrellisInputSchema,
  TrellisMultiInputSchema,
  TrellisMultiOutputSchema,
  TrellisOutputSchema,
  TripoV25ImageTo3dInputSchema,
  TripoV25ImageTo3dOutputSchema,
  TripoV25MultiviewTo3dInputSchema,
  TripoV25MultiviewTo3dOutputSchema,
  TriposplatInputSchema,
  TriposplatOutputSchema,
  TriposrInputSchema,
  TriposrOutputSchema,
} from './schemas.gen.js'

/**
 * Map of fal-3d endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const fal3dEndpointSchemaMap: {
  readonly 'fal-ai/hunyuan_world/image-to-world': {
    readonly input: typeof Hunyuan_worldImageToWorldInputSchema
    readonly output: typeof Hunyuan_worldImageToWorldOutputSchema
  }
  readonly 'fal-ai/hunyuan-3d/v3.1/part': {
    readonly input: typeof Hunyuan3dV31PartInputSchema
    readonly output: typeof Hunyuan3dV31PartOutputSchema
  }
  readonly 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d': {
    readonly input: typeof Hunyuan3dV31ProImageTo3dInputSchema
    readonly output: typeof Hunyuan3dV31ProImageTo3dOutputSchema
  }
  readonly 'fal-ai/hunyuan-3d/v3.1/pro/text-to-3d': {
    readonly input: typeof Hunyuan3dV31ProTextTo3dInputSchema
    readonly output: typeof Hunyuan3dV31ProTextTo3dOutputSchema
  }
  readonly 'fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d': {
    readonly input: typeof Hunyuan3dV31RapidImageTo3dInputSchema
    readonly output: typeof Hunyuan3dV31RapidImageTo3dOutputSchema
  }
  readonly 'fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d': {
    readonly input: typeof Hunyuan3dV31RapidTextTo3dInputSchema
    readonly output: typeof Hunyuan3dV31RapidTextTo3dOutputSchema
  }
  readonly 'fal-ai/hunyuan-3d/v3.1/smart-topology': {
    readonly input: typeof Hunyuan3dV31SmartTopologyInputSchema
    readonly output: typeof Hunyuan3dV31SmartTopologyOutputSchema
  }
  readonly 'fal-ai/hunyuan-motion': {
    readonly input: typeof HunyuanMotionInputSchema
    readonly output: typeof HunyuanMotionOutputSchema
  }
  readonly 'fal-ai/hunyuan-motion/fast': {
    readonly input: typeof HunyuanMotionFastInputSchema
    readonly output: typeof HunyuanMotionFastOutputSchema
  }
  readonly 'fal-ai/hunyuan3d-v3/image-to-3d': {
    readonly input: typeof Hunyuan3dV3ImageTo3dInputSchema
    readonly output: typeof Hunyuan3dV3ImageTo3dOutputSchema
  }
  readonly 'fal-ai/hunyuan3d-v3/sketch-to-3d': {
    readonly input: typeof Hunyuan3dV3SketchTo3dInputSchema
    readonly output: typeof Hunyuan3dV3SketchTo3dOutputSchema
  }
  readonly 'fal-ai/hunyuan3d-v3/text-to-3d': {
    readonly input: typeof Hunyuan3dV3TextTo3dInputSchema
    readonly output: typeof Hunyuan3dV3TextTo3dOutputSchema
  }
  readonly 'fal-ai/hunyuan3d/v2': {
    readonly input: typeof Hunyuan3dV2InputSchema
    readonly output: typeof Hunyuan3dV2OutputSchema
  }
  readonly 'fal-ai/hunyuan3d/v2/mini': {
    readonly input: typeof Hunyuan3dV2MiniInputSchema
    readonly output: typeof Hunyuan3dV2MiniOutputSchema
  }
  readonly 'fal-ai/hunyuan3d/v2/mini/turbo': {
    readonly input: typeof Hunyuan3dV2MiniTurboInputSchema
    readonly output: typeof Hunyuan3dV2MiniTurboOutputSchema
  }
  readonly 'fal-ai/hunyuan3d/v2/multi-view': {
    readonly input: typeof Hunyuan3dV2MultiViewInputSchema
    readonly output: typeof Hunyuan3dV2MultiViewOutputSchema
  }
  readonly 'fal-ai/hunyuan3d/v2/multi-view/turbo': {
    readonly input: typeof Hunyuan3dV2MultiViewTurboInputSchema
    readonly output: typeof Hunyuan3dV2MultiViewTurboOutputSchema
  }
  readonly 'fal-ai/hunyuan3d/v2/turbo': {
    readonly input: typeof Hunyuan3dV2TurboInputSchema
    readonly output: typeof Hunyuan3dV2TurboOutputSchema
  }
  readonly 'fal-ai/hyper3d/rodin': {
    readonly input: typeof Hyper3dRodinInputSchema
    readonly output: typeof Hyper3dRodinOutputSchema
  }
  readonly 'fal-ai/hyper3d/rodin/v2': {
    readonly input: typeof Hyper3dRodinV2InputSchema
    readonly output: typeof Hyper3dRodinV2OutputSchema
  }
  readonly 'fal-ai/hyper3d/rodin/v2.5': {
    readonly input: typeof Hyper3dRodinV25InputSchema
    readonly output: typeof Hyper3dRodinV25OutputSchema
  }
  readonly 'fal-ai/hyper3d/rodin/v2.5/text-to-3d': {
    readonly input: typeof Hyper3dRodinV25TextTo3dInputSchema
    readonly output: typeof Hyper3dRodinV25TextTo3dOutputSchema
  }
  readonly 'fal-ai/meshy/rigging': {
    readonly input: typeof MeshyRiggingInputSchema
    readonly output: typeof MeshyRiggingOutputSchema
  }
  readonly 'fal-ai/meshy/v5/multi-image-to-3d': {
    readonly input: typeof MeshyV5MultiImageTo3dInputSchema
    readonly output: typeof MeshyV5MultiImageTo3dOutputSchema
  }
  readonly 'fal-ai/meshy/v5/remesh': {
    readonly input: typeof MeshyV5RemeshInputSchema
    readonly output: typeof MeshyV5RemeshOutputSchema
  }
  readonly 'fal-ai/meshy/v5/retexture': {
    readonly input: typeof MeshyV5RetextureInputSchema
    readonly output: typeof MeshyV5RetextureOutputSchema
  }
  readonly 'fal-ai/meshy/v6-preview/image-to-3d': {
    readonly input: typeof MeshyV6PreviewImageTo3dInputSchema
    readonly output: typeof MeshyV6PreviewImageTo3dOutputSchema
  }
  readonly 'fal-ai/meshy/v6-preview/text-to-3d': {
    readonly input: typeof MeshyV6PreviewTextTo3dInputSchema
    readonly output: typeof MeshyV6PreviewTextTo3dOutputSchema
  }
  readonly 'fal-ai/meshy/v6/image-to-3d': {
    readonly input: typeof MeshyV6ImageTo3dInputSchema
    readonly output: typeof MeshyV6ImageTo3dOutputSchema
  }
  readonly 'fal-ai/meshy/v6/multi-image-to-3d': {
    readonly input: typeof MeshyV6MultiImageTo3dInputSchema
    readonly output: typeof MeshyV6MultiImageTo3dOutputSchema
  }
  readonly 'fal-ai/meshy/v6/text-to-3d': {
    readonly input: typeof MeshyV6TextTo3dInputSchema
    readonly output: typeof MeshyV6TextTo3dOutputSchema
  }
  readonly 'fal-ai/pixal3d': {
    readonly input: typeof Pixal3dInputSchema
    readonly output: typeof Pixal3dOutputSchema
  }
  readonly 'fal-ai/reconviagen-0.5': {
    readonly input: typeof Reconviagen05InputSchema
    readonly output: typeof Reconviagen05OutputSchema
  }
  readonly 'fal-ai/sam-3/3d-align': {
    readonly input: typeof Sam33dAlignInputSchema
    readonly output: typeof Sam33dAlignOutputSchema
  }
  readonly 'fal-ai/sam-3/3d-body': {
    readonly input: typeof Sam33dBodyInputSchema
    readonly output: typeof Sam33dBodyOutputSchema
  }
  readonly 'fal-ai/sam-3/3d-objects': {
    readonly input: typeof Sam33dObjectsInputSchema
    readonly output: typeof Sam33dObjectsOutputSchema
  }
  readonly 'fal-ai/trellis': {
    readonly input: typeof TrellisInputSchema
    readonly output: typeof TrellisOutputSchema
  }
  readonly 'fal-ai/trellis-2': {
    readonly input: typeof Trellis2InputSchema
    readonly output: typeof Trellis2OutputSchema
  }
  readonly 'fal-ai/trellis-2/retexture': {
    readonly input: typeof Trellis2RetextureInputSchema
    readonly output: typeof Trellis2RetextureOutputSchema
  }
  readonly 'fal-ai/trellis/multi': {
    readonly input: typeof TrellisMultiInputSchema
    readonly output: typeof TrellisMultiOutputSchema
  }
  readonly 'fal-ai/triposr': {
    readonly input: typeof TriposrInputSchema
    readonly output: typeof TriposrOutputSchema
  }
  readonly 'tripo3d/h3.1/image-to-3d': {
    readonly input: typeof H31ImageTo3dInputSchema
    readonly output: typeof H31ImageTo3dOutputSchema
  }
  readonly 'tripo3d/h3.1/multiview-to-3d': {
    readonly input: typeof H31MultiviewTo3dInputSchema
    readonly output: typeof H31MultiviewTo3dOutputSchema
  }
  readonly 'tripo3d/h3.1/text-to-3d': {
    readonly input: typeof H31TextTo3dInputSchema
    readonly output: typeof H31TextTo3dOutputSchema
  }
  readonly 'tripo3d/p1/image-to-3d': {
    readonly input: typeof P1ImageTo3dInputSchema
    readonly output: typeof P1ImageTo3dOutputSchema
  }
  readonly 'tripo3d/p1/text-to-3d': {
    readonly input: typeof P1TextTo3dInputSchema
    readonly output: typeof P1TextTo3dOutputSchema
  }
  readonly 'tripo3d/tripo/v2.5/image-to-3d': {
    readonly input: typeof TripoV25ImageTo3dInputSchema
    readonly output: typeof TripoV25ImageTo3dOutputSchema
  }
  readonly 'tripo3d/tripo/v2.5/multiview-to-3d': {
    readonly input: typeof TripoV25MultiviewTo3dInputSchema
    readonly output: typeof TripoV25MultiviewTo3dOutputSchema
  }
  readonly 'tripo3d/triposplat': {
    readonly input: typeof TriposplatInputSchema
    readonly output: typeof TriposplatOutputSchema
  }
} = {
  'fal-ai/hunyuan_world/image-to-world': {
    input: Hunyuan_worldImageToWorldInputSchema,
    output: Hunyuan_worldImageToWorldOutputSchema,
  },
  'fal-ai/hunyuan-3d/v3.1/part': {
    input: Hunyuan3dV31PartInputSchema,
    output: Hunyuan3dV31PartOutputSchema,
  },
  'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d': {
    input: Hunyuan3dV31ProImageTo3dInputSchema,
    output: Hunyuan3dV31ProImageTo3dOutputSchema,
  },
  'fal-ai/hunyuan-3d/v3.1/pro/text-to-3d': {
    input: Hunyuan3dV31ProTextTo3dInputSchema,
    output: Hunyuan3dV31ProTextTo3dOutputSchema,
  },
  'fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d': {
    input: Hunyuan3dV31RapidImageTo3dInputSchema,
    output: Hunyuan3dV31RapidImageTo3dOutputSchema,
  },
  'fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d': {
    input: Hunyuan3dV31RapidTextTo3dInputSchema,
    output: Hunyuan3dV31RapidTextTo3dOutputSchema,
  },
  'fal-ai/hunyuan-3d/v3.1/smart-topology': {
    input: Hunyuan3dV31SmartTopologyInputSchema,
    output: Hunyuan3dV31SmartTopologyOutputSchema,
  },
  'fal-ai/hunyuan-motion': {
    input: HunyuanMotionInputSchema,
    output: HunyuanMotionOutputSchema,
  },
  'fal-ai/hunyuan-motion/fast': {
    input: HunyuanMotionFastInputSchema,
    output: HunyuanMotionFastOutputSchema,
  },
  'fal-ai/hunyuan3d-v3/image-to-3d': {
    input: Hunyuan3dV3ImageTo3dInputSchema,
    output: Hunyuan3dV3ImageTo3dOutputSchema,
  },
  'fal-ai/hunyuan3d-v3/sketch-to-3d': {
    input: Hunyuan3dV3SketchTo3dInputSchema,
    output: Hunyuan3dV3SketchTo3dOutputSchema,
  },
  'fal-ai/hunyuan3d-v3/text-to-3d': {
    input: Hunyuan3dV3TextTo3dInputSchema,
    output: Hunyuan3dV3TextTo3dOutputSchema,
  },
  'fal-ai/hunyuan3d/v2': {
    input: Hunyuan3dV2InputSchema,
    output: Hunyuan3dV2OutputSchema,
  },
  'fal-ai/hunyuan3d/v2/mini': {
    input: Hunyuan3dV2MiniInputSchema,
    output: Hunyuan3dV2MiniOutputSchema,
  },
  'fal-ai/hunyuan3d/v2/mini/turbo': {
    input: Hunyuan3dV2MiniTurboInputSchema,
    output: Hunyuan3dV2MiniTurboOutputSchema,
  },
  'fal-ai/hunyuan3d/v2/multi-view': {
    input: Hunyuan3dV2MultiViewInputSchema,
    output: Hunyuan3dV2MultiViewOutputSchema,
  },
  'fal-ai/hunyuan3d/v2/multi-view/turbo': {
    input: Hunyuan3dV2MultiViewTurboInputSchema,
    output: Hunyuan3dV2MultiViewTurboOutputSchema,
  },
  'fal-ai/hunyuan3d/v2/turbo': {
    input: Hunyuan3dV2TurboInputSchema,
    output: Hunyuan3dV2TurboOutputSchema,
  },
  'fal-ai/hyper3d/rodin': {
    input: Hyper3dRodinInputSchema,
    output: Hyper3dRodinOutputSchema,
  },
  'fal-ai/hyper3d/rodin/v2': {
    input: Hyper3dRodinV2InputSchema,
    output: Hyper3dRodinV2OutputSchema,
  },
  'fal-ai/hyper3d/rodin/v2.5': {
    input: Hyper3dRodinV25InputSchema,
    output: Hyper3dRodinV25OutputSchema,
  },
  'fal-ai/hyper3d/rodin/v2.5/text-to-3d': {
    input: Hyper3dRodinV25TextTo3dInputSchema,
    output: Hyper3dRodinV25TextTo3dOutputSchema,
  },
  'fal-ai/meshy/rigging': {
    input: MeshyRiggingInputSchema,
    output: MeshyRiggingOutputSchema,
  },
  'fal-ai/meshy/v5/multi-image-to-3d': {
    input: MeshyV5MultiImageTo3dInputSchema,
    output: MeshyV5MultiImageTo3dOutputSchema,
  },
  'fal-ai/meshy/v5/remesh': {
    input: MeshyV5RemeshInputSchema,
    output: MeshyV5RemeshOutputSchema,
  },
  'fal-ai/meshy/v5/retexture': {
    input: MeshyV5RetextureInputSchema,
    output: MeshyV5RetextureOutputSchema,
  },
  'fal-ai/meshy/v6-preview/image-to-3d': {
    input: MeshyV6PreviewImageTo3dInputSchema,
    output: MeshyV6PreviewImageTo3dOutputSchema,
  },
  'fal-ai/meshy/v6-preview/text-to-3d': {
    input: MeshyV6PreviewTextTo3dInputSchema,
    output: MeshyV6PreviewTextTo3dOutputSchema,
  },
  'fal-ai/meshy/v6/image-to-3d': {
    input: MeshyV6ImageTo3dInputSchema,
    output: MeshyV6ImageTo3dOutputSchema,
  },
  'fal-ai/meshy/v6/multi-image-to-3d': {
    input: MeshyV6MultiImageTo3dInputSchema,
    output: MeshyV6MultiImageTo3dOutputSchema,
  },
  'fal-ai/meshy/v6/text-to-3d': {
    input: MeshyV6TextTo3dInputSchema,
    output: MeshyV6TextTo3dOutputSchema,
  },
  'fal-ai/pixal3d': { input: Pixal3dInputSchema, output: Pixal3dOutputSchema },
  'fal-ai/reconviagen-0.5': {
    input: Reconviagen05InputSchema,
    output: Reconviagen05OutputSchema,
  },
  'fal-ai/sam-3/3d-align': {
    input: Sam33dAlignInputSchema,
    output: Sam33dAlignOutputSchema,
  },
  'fal-ai/sam-3/3d-body': {
    input: Sam33dBodyInputSchema,
    output: Sam33dBodyOutputSchema,
  },
  'fal-ai/sam-3/3d-objects': {
    input: Sam33dObjectsInputSchema,
    output: Sam33dObjectsOutputSchema,
  },
  'fal-ai/trellis': { input: TrellisInputSchema, output: TrellisOutputSchema },
  'fal-ai/trellis-2': {
    input: Trellis2InputSchema,
    output: Trellis2OutputSchema,
  },
  'fal-ai/trellis-2/retexture': {
    input: Trellis2RetextureInputSchema,
    output: Trellis2RetextureOutputSchema,
  },
  'fal-ai/trellis/multi': {
    input: TrellisMultiInputSchema,
    output: TrellisMultiOutputSchema,
  },
  'fal-ai/triposr': { input: TriposrInputSchema, output: TriposrOutputSchema },
  'tripo3d/h3.1/image-to-3d': {
    input: H31ImageTo3dInputSchema,
    output: H31ImageTo3dOutputSchema,
  },
  'tripo3d/h3.1/multiview-to-3d': {
    input: H31MultiviewTo3dInputSchema,
    output: H31MultiviewTo3dOutputSchema,
  },
  'tripo3d/h3.1/text-to-3d': {
    input: H31TextTo3dInputSchema,
    output: H31TextTo3dOutputSchema,
  },
  'tripo3d/p1/image-to-3d': {
    input: P1ImageTo3dInputSchema,
    output: P1ImageTo3dOutputSchema,
  },
  'tripo3d/p1/text-to-3d': {
    input: P1TextTo3dInputSchema,
    output: P1TextTo3dOutputSchema,
  },
  'tripo3d/tripo/v2.5/image-to-3d': {
    input: TripoV25ImageTo3dInputSchema,
    output: TripoV25ImageTo3dOutputSchema,
  },
  'tripo3d/tripo/v2.5/multiview-to-3d': {
    input: TripoV25MultiviewTo3dInputSchema,
    output: TripoV25MultiviewTo3dOutputSchema,
  },
  'tripo3d/triposplat': {
    input: TriposplatInputSchema,
    output: TriposplatOutputSchema,
  },
}
