// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaFlux2Klein4bBaseTrainerEditInput,
  zSchemaFlux2Klein4bBaseTrainerEditOutput,
  zSchemaFlux2Klein4bBaseTrainerInput,
  zSchemaFlux2Klein4bBaseTrainerOutput,
  zSchemaFlux2Klein9bBaseTrainerEditInput,
  zSchemaFlux2Klein9bBaseTrainerEditOutput,
  zSchemaFlux2Klein9bBaseTrainerInput,
  zSchemaFlux2Klein9bBaseTrainerOutput,
  zSchemaFlux2TrainerEditInput,
  zSchemaFlux2TrainerEditOutput,
  zSchemaFlux2TrainerInput,
  zSchemaFlux2TrainerOutput,
  zSchemaFlux2TrainerV2EditInput,
  zSchemaFlux2TrainerV2EditOutput,
  zSchemaFlux2TrainerV2Input,
  zSchemaFlux2TrainerV2Output,
  zSchemaFluxKontextTrainerInput,
  zSchemaFluxKontextTrainerOutput,
  zSchemaFluxKreaTrainerInput,
  zSchemaFluxKreaTrainerOutput,
  zSchemaFluxLoraFastTrainingInput,
  zSchemaFluxLoraFastTrainingOutput,
  zSchemaFluxLoraPortraitTrainerInput,
  zSchemaFluxLoraPortraitTrainerOutput,
  zSchemaHunyuanVideoLoraTrainingInput,
  zSchemaHunyuanVideoLoraTrainingOutput,
  zSchemaLtx2V2vTrainerInput,
  zSchemaLtx2V2vTrainerOutput,
  zSchemaLtx2VideoTrainerInput,
  zSchemaLtx2VideoTrainerOutput,
  zSchemaLtxVideoTrainerInput,
  zSchemaLtxVideoTrainerOutput,
  zSchemaQwenImage2512TrainerInput,
  zSchemaQwenImage2512TrainerOutput,
  zSchemaQwenImage2512TrainerV2Input,
  zSchemaQwenImage2512TrainerV2Output,
  zSchemaQwenImageEdit2509TrainerInput,
  zSchemaQwenImageEdit2509TrainerOutput,
  zSchemaQwenImageEdit2511TrainerInput,
  zSchemaQwenImageEdit2511TrainerOutput,
  zSchemaQwenImageEditPlusTrainerInput,
  zSchemaQwenImageEditPlusTrainerOutput,
  zSchemaQwenImageEditTrainerInput,
  zSchemaQwenImageEditTrainerOutput,
  zSchemaQwenImageLayeredTrainerInput,
  zSchemaQwenImageLayeredTrainerOutput,
  zSchemaQwenImageTrainerInput,
  zSchemaQwenImageTrainerOutput,
  zSchemaRecraftV3CreateStyleInput,
  zSchemaRecraftV3CreateStyleOutput,
  zSchemaTurboFluxTrainerInput,
  zSchemaTurboFluxTrainerOutput,
  zSchemaWan22ImageTrainerInput,
  zSchemaWan22ImageTrainerOutput,
  zSchemaWanTrainerFlf2V720pInput,
  zSchemaWanTrainerFlf2V720pOutput,
  zSchemaWanTrainerI2V720pInput,
  zSchemaWanTrainerI2V720pOutput,
  zSchemaWanTrainerInput,
  zSchemaWanTrainerOutput,
  zSchemaWanTrainerT2V14bInput,
  zSchemaWanTrainerT2V14bOutput,
  zSchemaWanTrainerT2vInput,
  zSchemaWanTrainerT2vOutput,
  zSchemaZImageBaseTrainerInput,
  zSchemaZImageBaseTrainerOutput,
  zSchemaZImageTrainerInput,
  zSchemaZImageTrainerOutput,
  zSchemaZImageTurboTrainerV2Input,
  zSchemaZImageTurboTrainerV2Output,
} from './zod.gen'

import type {
  SchemaFlux2Klein4bBaseTrainerEditInput,
  SchemaFlux2Klein4bBaseTrainerEditOutput,
  SchemaFlux2Klein4bBaseTrainerInput,
  SchemaFlux2Klein4bBaseTrainerOutput,
  SchemaFlux2Klein9bBaseTrainerEditInput,
  SchemaFlux2Klein9bBaseTrainerEditOutput,
  SchemaFlux2Klein9bBaseTrainerInput,
  SchemaFlux2Klein9bBaseTrainerOutput,
  SchemaFlux2TrainerEditInput,
  SchemaFlux2TrainerEditOutput,
  SchemaFlux2TrainerInput,
  SchemaFlux2TrainerOutput,
  SchemaFlux2TrainerV2EditInput,
  SchemaFlux2TrainerV2EditOutput,
  SchemaFlux2TrainerV2Input,
  SchemaFlux2TrainerV2Output,
  SchemaFluxKontextTrainerInput,
  SchemaFluxKontextTrainerOutput,
  SchemaFluxKreaTrainerInput,
  SchemaFluxKreaTrainerOutput,
  SchemaFluxLoraFastTrainingInput,
  SchemaFluxLoraFastTrainingOutput,
  SchemaFluxLoraPortraitTrainerInput,
  SchemaFluxLoraPortraitTrainerOutput,
  SchemaHunyuanVideoLoraTrainingInput,
  SchemaHunyuanVideoLoraTrainingOutput,
  SchemaLtx2V2vTrainerInput,
  SchemaLtx2V2vTrainerOutput,
  SchemaLtx2VideoTrainerInput,
  SchemaLtx2VideoTrainerOutput,
  SchemaLtxVideoTrainerInput,
  SchemaLtxVideoTrainerOutput,
  SchemaQwenImage2512TrainerInput,
  SchemaQwenImage2512TrainerOutput,
  SchemaQwenImage2512TrainerV2Input,
  SchemaQwenImage2512TrainerV2Output,
  SchemaQwenImageEdit2509TrainerInput,
  SchemaQwenImageEdit2509TrainerOutput,
  SchemaQwenImageEdit2511TrainerInput,
  SchemaQwenImageEdit2511TrainerOutput,
  SchemaQwenImageEditPlusTrainerInput,
  SchemaQwenImageEditPlusTrainerOutput,
  SchemaQwenImageEditTrainerInput,
  SchemaQwenImageEditTrainerOutput,
  SchemaQwenImageLayeredTrainerInput,
  SchemaQwenImageLayeredTrainerOutput,
  SchemaQwenImageTrainerInput,
  SchemaQwenImageTrainerOutput,
  SchemaRecraftV3CreateStyleInput,
  SchemaRecraftV3CreateStyleOutput,
  SchemaTurboFluxTrainerInput,
  SchemaTurboFluxTrainerOutput,
  SchemaWan22ImageTrainerInput,
  SchemaWan22ImageTrainerOutput,
  SchemaWanTrainerFlf2V720pInput,
  SchemaWanTrainerFlf2V720pOutput,
  SchemaWanTrainerI2V720pInput,
  SchemaWanTrainerI2V720pOutput,
  SchemaWanTrainerInput,
  SchemaWanTrainerOutput,
  SchemaWanTrainerT2V14bInput,
  SchemaWanTrainerT2V14bOutput,
  SchemaWanTrainerT2vInput,
  SchemaWanTrainerT2vOutput,
  SchemaZImageBaseTrainerInput,
  SchemaZImageBaseTrainerOutput,
  SchemaZImageTrainerInput,
  SchemaZImageTrainerOutput,
  SchemaZImageTurboTrainerV2Input,
  SchemaZImageTurboTrainerV2Output,
} from './types.gen'

import type { z } from 'zod'

export type TrainingEndpointMap = {
  'fal-ai/flux-krea-trainer': {
    input: SchemaFluxKreaTrainerInput
    output: SchemaFluxKreaTrainerOutput
  }
  'fal-ai/flux-kontext-trainer': {
    input: SchemaFluxKontextTrainerInput
    output: SchemaFluxKontextTrainerOutput
  }
  'fal-ai/flux-lora-fast-training': {
    input: SchemaFluxLoraFastTrainingInput
    output: SchemaFluxLoraFastTrainingOutput
  }
  'fal-ai/flux-lora-portrait-trainer': {
    input: SchemaFluxLoraPortraitTrainerInput
    output: SchemaFluxLoraPortraitTrainerOutput
  }
  'fal-ai/z-image-base-trainer': {
    input: SchemaZImageBaseTrainerInput
    output: SchemaZImageBaseTrainerOutput
  }
  'fal-ai/z-image-turbo-trainer-v2': {
    input: SchemaZImageTurboTrainerV2Input
    output: SchemaZImageTurboTrainerV2Output
  }
  'fal-ai/flux-2-klein-9b-base-trainer/edit': {
    input: SchemaFlux2Klein9bBaseTrainerEditInput
    output: SchemaFlux2Klein9bBaseTrainerEditOutput
  }
  'fal-ai/flux-2-klein-9b-base-trainer': {
    input: SchemaFlux2Klein9bBaseTrainerInput
    output: SchemaFlux2Klein9bBaseTrainerOutput
  }
  'fal-ai/flux-2-klein-4b-base-trainer': {
    input: SchemaFlux2Klein4bBaseTrainerInput
    output: SchemaFlux2Klein4bBaseTrainerOutput
  }
  'fal-ai/flux-2-klein-4b-base-trainer/edit': {
    input: SchemaFlux2Klein4bBaseTrainerEditInput
    output: SchemaFlux2Klein4bBaseTrainerEditOutput
  }
  'fal-ai/qwen-image-2512-trainer-v2': {
    input: SchemaQwenImage2512TrainerV2Input
    output: SchemaQwenImage2512TrainerV2Output
  }
  'fal-ai/flux-2-trainer-v2/edit': {
    input: SchemaFlux2TrainerV2EditInput
    output: SchemaFlux2TrainerV2EditOutput
  }
  'fal-ai/flux-2-trainer-v2': {
    input: SchemaFlux2TrainerV2Input
    output: SchemaFlux2TrainerV2Output
  }
  'fal-ai/ltx2-v2v-trainer': {
    input: SchemaLtx2V2vTrainerInput
    output: SchemaLtx2V2vTrainerOutput
  }
  'fal-ai/ltx2-video-trainer': {
    input: SchemaLtx2VideoTrainerInput
    output: SchemaLtx2VideoTrainerOutput
  }
  'fal-ai/qwen-image-2512-trainer': {
    input: SchemaQwenImage2512TrainerInput
    output: SchemaQwenImage2512TrainerOutput
  }
  'fal-ai/qwen-image-edit-2511-trainer': {
    input: SchemaQwenImageEdit2511TrainerInput
    output: SchemaQwenImageEdit2511TrainerOutput
  }
  'fal-ai/qwen-image-layered-trainer': {
    input: SchemaQwenImageLayeredTrainerInput
    output: SchemaQwenImageLayeredTrainerOutput
  }
  'fal-ai/qwen-image-edit-2509-trainer': {
    input: SchemaQwenImageEdit2509TrainerInput
    output: SchemaQwenImageEdit2509TrainerOutput
  }
  'fal-ai/z-image-trainer': {
    input: SchemaZImageTrainerInput
    output: SchemaZImageTrainerOutput
  }
  'fal-ai/flux-2-trainer/edit': {
    input: SchemaFlux2TrainerEditInput
    output: SchemaFlux2TrainerEditOutput
  }
  'fal-ai/flux-2-trainer': {
    input: SchemaFlux2TrainerInput
    output: SchemaFlux2TrainerOutput
  }
  'fal-ai/qwen-image-edit-plus-trainer': {
    input: SchemaQwenImageEditPlusTrainerInput
    output: SchemaQwenImageEditPlusTrainerOutput
  }
  'fal-ai/qwen-image-edit-trainer': {
    input: SchemaQwenImageEditTrainerInput
    output: SchemaQwenImageEditTrainerOutput
  }
  'fal-ai/qwen-image-trainer': {
    input: SchemaQwenImageTrainerInput
    output: SchemaQwenImageTrainerOutput
  }
  'fal-ai/wan-22-image-trainer': {
    input: SchemaWan22ImageTrainerInput
    output: SchemaWan22ImageTrainerOutput
  }
  'fal-ai/wan-trainer/t2v': {
    input: SchemaWanTrainerT2vInput
    output: SchemaWanTrainerT2vOutput
  }
  'fal-ai/wan-trainer/t2v-14b': {
    input: SchemaWanTrainerT2V14bInput
    output: SchemaWanTrainerT2V14bOutput
  }
  'fal-ai/wan-trainer/i2v-720p': {
    input: SchemaWanTrainerI2V720pInput
    output: SchemaWanTrainerI2V720pOutput
  }
  'fal-ai/wan-trainer/flf2v-720p': {
    input: SchemaWanTrainerFlf2V720pInput
    output: SchemaWanTrainerFlf2V720pOutput
  }
  'fal-ai/ltx-video-trainer': {
    input: SchemaLtxVideoTrainerInput
    output: SchemaLtxVideoTrainerOutput
  }
  'fal-ai/recraft/v3/create-style': {
    input: SchemaRecraftV3CreateStyleInput
    output: SchemaRecraftV3CreateStyleOutput
  }
  'fal-ai/turbo-flux-trainer': {
    input: SchemaTurboFluxTrainerInput
    output: SchemaTurboFluxTrainerOutput
  }
  'fal-ai/wan-trainer': {
    input: SchemaWanTrainerInput
    output: SchemaWanTrainerOutput
  }
  'fal-ai/hunyuan-video-lora-training': {
    input: SchemaHunyuanVideoLoraTrainingInput
    output: SchemaHunyuanVideoLoraTrainingOutput
  }
}

/** Union type of all training model endpoint IDs */
export type TrainingModel = keyof TrainingEndpointMap

export const TrainingSchemaMap: Record<
  TrainingModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ['fal-ai/flux-krea-trainer']: {
    input: zSchemaFluxKreaTrainerInput,
    output: zSchemaFluxKreaTrainerOutput,
  },
  ['fal-ai/flux-kontext-trainer']: {
    input: zSchemaFluxKontextTrainerInput,
    output: zSchemaFluxKontextTrainerOutput,
  },
  ['fal-ai/flux-lora-fast-training']: {
    input: zSchemaFluxLoraFastTrainingInput,
    output: zSchemaFluxLoraFastTrainingOutput,
  },
  ['fal-ai/flux-lora-portrait-trainer']: {
    input: zSchemaFluxLoraPortraitTrainerInput,
    output: zSchemaFluxLoraPortraitTrainerOutput,
  },
  ['fal-ai/z-image-base-trainer']: {
    input: zSchemaZImageBaseTrainerInput,
    output: zSchemaZImageBaseTrainerOutput,
  },
  ['fal-ai/z-image-turbo-trainer-v2']: {
    input: zSchemaZImageTurboTrainerV2Input,
    output: zSchemaZImageTurboTrainerV2Output,
  },
  ['fal-ai/flux-2-klein-9b-base-trainer/edit']: {
    input: zSchemaFlux2Klein9bBaseTrainerEditInput,
    output: zSchemaFlux2Klein9bBaseTrainerEditOutput,
  },
  ['fal-ai/flux-2-klein-9b-base-trainer']: {
    input: zSchemaFlux2Klein9bBaseTrainerInput,
    output: zSchemaFlux2Klein9bBaseTrainerOutput,
  },
  ['fal-ai/flux-2-klein-4b-base-trainer']: {
    input: zSchemaFlux2Klein4bBaseTrainerInput,
    output: zSchemaFlux2Klein4bBaseTrainerOutput,
  },
  ['fal-ai/flux-2-klein-4b-base-trainer/edit']: {
    input: zSchemaFlux2Klein4bBaseTrainerEditInput,
    output: zSchemaFlux2Klein4bBaseTrainerEditOutput,
  },
  ['fal-ai/qwen-image-2512-trainer-v2']: {
    input: zSchemaQwenImage2512TrainerV2Input,
    output: zSchemaQwenImage2512TrainerV2Output,
  },
  ['fal-ai/flux-2-trainer-v2/edit']: {
    input: zSchemaFlux2TrainerV2EditInput,
    output: zSchemaFlux2TrainerV2EditOutput,
  },
  ['fal-ai/flux-2-trainer-v2']: {
    input: zSchemaFlux2TrainerV2Input,
    output: zSchemaFlux2TrainerV2Output,
  },
  ['fal-ai/ltx2-v2v-trainer']: {
    input: zSchemaLtx2V2vTrainerInput,
    output: zSchemaLtx2V2vTrainerOutput,
  },
  ['fal-ai/ltx2-video-trainer']: {
    input: zSchemaLtx2VideoTrainerInput,
    output: zSchemaLtx2VideoTrainerOutput,
  },
  ['fal-ai/qwen-image-2512-trainer']: {
    input: zSchemaQwenImage2512TrainerInput,
    output: zSchemaQwenImage2512TrainerOutput,
  },
  ['fal-ai/qwen-image-edit-2511-trainer']: {
    input: zSchemaQwenImageEdit2511TrainerInput,
    output: zSchemaQwenImageEdit2511TrainerOutput,
  },
  ['fal-ai/qwen-image-layered-trainer']: {
    input: zSchemaQwenImageLayeredTrainerInput,
    output: zSchemaQwenImageLayeredTrainerOutput,
  },
  ['fal-ai/qwen-image-edit-2509-trainer']: {
    input: zSchemaQwenImageEdit2509TrainerInput,
    output: zSchemaQwenImageEdit2509TrainerOutput,
  },
  ['fal-ai/z-image-trainer']: {
    input: zSchemaZImageTrainerInput,
    output: zSchemaZImageTrainerOutput,
  },
  ['fal-ai/flux-2-trainer/edit']: {
    input: zSchemaFlux2TrainerEditInput,
    output: zSchemaFlux2TrainerEditOutput,
  },
  ['fal-ai/flux-2-trainer']: {
    input: zSchemaFlux2TrainerInput,
    output: zSchemaFlux2TrainerOutput,
  },
  ['fal-ai/qwen-image-edit-plus-trainer']: {
    input: zSchemaQwenImageEditPlusTrainerInput,
    output: zSchemaQwenImageEditPlusTrainerOutput,
  },
  ['fal-ai/qwen-image-edit-trainer']: {
    input: zSchemaQwenImageEditTrainerInput,
    output: zSchemaQwenImageEditTrainerOutput,
  },
  ['fal-ai/qwen-image-trainer']: {
    input: zSchemaQwenImageTrainerInput,
    output: zSchemaQwenImageTrainerOutput,
  },
  ['fal-ai/wan-22-image-trainer']: {
    input: zSchemaWan22ImageTrainerInput,
    output: zSchemaWan22ImageTrainerOutput,
  },
  ['fal-ai/wan-trainer/t2v']: {
    input: zSchemaWanTrainerT2vInput,
    output: zSchemaWanTrainerT2vOutput,
  },
  ['fal-ai/wan-trainer/t2v-14b']: {
    input: zSchemaWanTrainerT2V14bInput,
    output: zSchemaWanTrainerT2V14bOutput,
  },
  ['fal-ai/wan-trainer/i2v-720p']: {
    input: zSchemaWanTrainerI2V720pInput,
    output: zSchemaWanTrainerI2V720pOutput,
  },
  ['fal-ai/wan-trainer/flf2v-720p']: {
    input: zSchemaWanTrainerFlf2V720pInput,
    output: zSchemaWanTrainerFlf2V720pOutput,
  },
  ['fal-ai/ltx-video-trainer']: {
    input: zSchemaLtxVideoTrainerInput,
    output: zSchemaLtxVideoTrainerOutput,
  },
  ['fal-ai/recraft/v3/create-style']: {
    input: zSchemaRecraftV3CreateStyleInput,
    output: zSchemaRecraftV3CreateStyleOutput,
  },
  ['fal-ai/turbo-flux-trainer']: {
    input: zSchemaTurboFluxTrainerInput,
    output: zSchemaTurboFluxTrainerOutput,
  },
  ['fal-ai/wan-trainer']: {
    input: zSchemaWanTrainerInput,
    output: zSchemaWanTrainerOutput,
  },
  ['fal-ai/hunyuan-video-lora-training']: {
    input: zSchemaHunyuanVideoLoraTrainingInput,
    output: zSchemaHunyuanVideoLoraTrainingOutput,
  },
} as const

/** Get the input type for a specific training model */
export type TrainingModelInput<T extends TrainingModel> =
  TrainingEndpointMap[T]['input']

/** Get the output type for a specific training model */
export type TrainingModelOutput<T extends TrainingModel> =
  TrainingEndpointMap[T]['output']
