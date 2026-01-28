// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaAiFaceSwapFaceswapvideoInput,
  zSchemaAiFaceSwapFaceswapvideoOutput,
  zSchemaAmtInterpolationInput,
  zSchemaAmtInterpolationOutput,
  zSchemaAutoCaptionInput,
  zSchemaAutoCaptionOutput,
  zSchemaBenV2VideoInput,
  zSchemaBenV2VideoOutput,
  zSchemaBirefnetV2VideoInput,
  zSchemaBirefnetV2VideoOutput,
  zSchemaBriaVideoEraserEraseKeypointsInput,
  zSchemaBriaVideoEraserEraseKeypointsOutput,
  zSchemaBriaVideoEraserEraseMaskInput,
  zSchemaBriaVideoEraserEraseMaskOutput,
  zSchemaBriaVideoEraserErasePromptInput,
  zSchemaBriaVideoEraserErasePromptOutput,
  zSchemaBytedanceUpscalerUpscaleVideoInput,
  zSchemaBytedanceUpscalerUpscaleVideoOutput,
  zSchemaCogvideox5bVideoToVideoInput,
  zSchemaCogvideox5bVideoToVideoOutput,
  zSchemaControlnextInput,
  zSchemaControlnextOutput,
  zSchemaCrystalVideoUpscalerInput,
  zSchemaCrystalVideoUpscalerOutput,
  zSchemaDubbingInput,
  zSchemaDubbingOutput,
  zSchemaDwposeVideoInput,
  zSchemaDwposeVideoOutput,
  zSchemaEdittoInput,
  zSchemaEdittoOutput,
  zSchemaFastAnimatediffTurboVideoToVideoInput,
  zSchemaFastAnimatediffTurboVideoToVideoOutput,
  zSchemaFastAnimatediffVideoToVideoInput,
  zSchemaFastAnimatediffVideoToVideoOutput,
  zSchemaFfmpegApiComposeInput,
  zSchemaFfmpegApiComposeOutput,
  zSchemaFfmpegApiMergeAudioVideoInput,
  zSchemaFfmpegApiMergeAudioVideoOutput,
  zSchemaFfmpegApiMergeVideosInput,
  zSchemaFfmpegApiMergeVideosOutput,
  zSchemaFilmVideoInput,
  zSchemaFilmVideoOutput,
  zSchemaFlashvsrUpscaleVideoInput,
  zSchemaFlashvsrUpscaleVideoOutput,
  zSchemaHunyuanVideoFoleyInput,
  zSchemaHunyuanVideoFoleyOutput,
  zSchemaHunyuanVideoLoraVideoToVideoInput,
  zSchemaHunyuanVideoLoraVideoToVideoOutput,
  zSchemaHunyuanVideoVideoToVideoInput,
  zSchemaHunyuanVideoVideoToVideoOutput,
  zSchemaInfinitalkInput,
  zSchemaInfinitalkOutput,
  zSchemaInfinitalkVideoToVideoInput,
  zSchemaInfinitalkVideoToVideoOutput,
  zSchemaKlingVideoO1StandardVideoToVideoEditInput,
  zSchemaKlingVideoO1StandardVideoToVideoEditOutput,
  zSchemaKlingVideoO1StandardVideoToVideoReferenceInput,
  zSchemaKlingVideoO1StandardVideoToVideoReferenceOutput,
  zSchemaKlingVideoO1VideoToVideoEditInput,
  zSchemaKlingVideoO1VideoToVideoEditOutput,
  zSchemaKlingVideoO1VideoToVideoReferenceInput,
  zSchemaKlingVideoO1VideoToVideoReferenceOutput,
  zSchemaKlingVideoV26ProMotionControlInput,
  zSchemaKlingVideoV26ProMotionControlOutput,
  zSchemaKlingVideoV26StandardMotionControlInput,
  zSchemaKlingVideoV26StandardMotionControlOutput,
  zSchemaKreaWan14bVideoToVideoInput,
  zSchemaKreaWan14bVideoToVideoOutput,
  zSchemaLatentsyncInput,
  zSchemaLatentsyncOutput,
  zSchemaLightxRecameraInput,
  zSchemaLightxRecameraOutput,
  zSchemaLightxRelightInput,
  zSchemaLightxRelightOutput,
  zSchemaLipsyncInput,
  zSchemaLipsyncOutput,
  zSchemaLtx219bDistilledExtendVideoInput,
  zSchemaLtx219bDistilledExtendVideoLoraInput,
  zSchemaLtx219bDistilledExtendVideoLoraOutput,
  zSchemaLtx219bDistilledExtendVideoOutput,
  zSchemaLtx219bDistilledVideoToVideoInput,
  zSchemaLtx219bDistilledVideoToVideoLoraInput,
  zSchemaLtx219bDistilledVideoToVideoLoraOutput,
  zSchemaLtx219bDistilledVideoToVideoOutput,
  zSchemaLtx219bExtendVideoInput,
  zSchemaLtx219bExtendVideoLoraInput,
  zSchemaLtx219bExtendVideoLoraOutput,
  zSchemaLtx219bExtendVideoOutput,
  zSchemaLtx219bVideoToVideoInput,
  zSchemaLtx219bVideoToVideoLoraInput,
  zSchemaLtx219bVideoToVideoLoraOutput,
  zSchemaLtx219bVideoToVideoOutput,
  zSchemaLtx2RetakeVideoInput,
  zSchemaLtx2RetakeVideoOutput,
  zSchemaLtxVideo13bDevExtendInput,
  zSchemaLtxVideo13bDevExtendOutput,
  zSchemaLtxVideo13bDevMulticonditioningInput,
  zSchemaLtxVideo13bDevMulticonditioningOutput,
  zSchemaLtxVideo13bDistilledExtendInput,
  zSchemaLtxVideo13bDistilledExtendOutput,
  zSchemaLtxVideo13bDistilledMulticonditioningInput,
  zSchemaLtxVideo13bDistilledMulticonditioningOutput,
  zSchemaLtxVideoLoraMulticonditioningInput,
  zSchemaLtxVideoLoraMulticonditioningOutput,
  zSchemaLtxVideoV095ExtendInput,
  zSchemaLtxVideoV095ExtendOutput,
  zSchemaLtxVideoV095MulticonditioningInput,
  zSchemaLtxVideoV095MulticonditioningOutput,
  zSchemaLtxv13B098DistilledExtendInput,
  zSchemaLtxv13B098DistilledExtendOutput,
  zSchemaLtxv13B098DistilledMulticonditioningInput,
  zSchemaLtxv13B098DistilledMulticonditioningOutput,
  zSchemaLucyEditDevInput,
  zSchemaLucyEditDevOutput,
  zSchemaLucyEditFastInput,
  zSchemaLucyEditFastOutput,
  zSchemaLucyEditProInput,
  zSchemaLucyEditProOutput,
  zSchemaLucyRestyleInput,
  zSchemaLucyRestyleOutput,
  zSchemaLumaDreamMachineRay2FlashModifyInput,
  zSchemaLumaDreamMachineRay2FlashModifyOutput,
  zSchemaLumaDreamMachineRay2FlashReframeInput,
  zSchemaLumaDreamMachineRay2FlashReframeOutput,
  zSchemaLumaDreamMachineRay2ModifyInput,
  zSchemaLumaDreamMachineRay2ModifyOutput,
  zSchemaLumaDreamMachineRay2ReframeInput,
  zSchemaLumaDreamMachineRay2ReframeOutput,
  zSchemaMagiDistilledExtendVideoInput,
  zSchemaMagiDistilledExtendVideoOutput,
  zSchemaMagiExtendVideoInput,
  zSchemaMagiExtendVideoOutput,
  zSchemaMareyMotionTransferInput,
  zSchemaMareyMotionTransferOutput,
  zSchemaMareyPoseTransferInput,
  zSchemaMareyPoseTransferOutput,
  zSchemaMmaudioV2Input,
  zSchemaMmaudioV2Output,
  zSchemaOneToAllAnimation13bInput,
  zSchemaOneToAllAnimation13bOutput,
  zSchemaOneToAllAnimation14bInput,
  zSchemaOneToAllAnimation14bOutput,
  zSchemaPikaV2PikadditionsInput,
  zSchemaPikaV2PikadditionsOutput,
  zSchemaPixverseExtendFastInput,
  zSchemaPixverseExtendFastOutput,
  zSchemaPixverseExtendInput,
  zSchemaPixverseExtendOutput,
  zSchemaPixverseLipsyncInput,
  zSchemaPixverseLipsyncOutput,
  zSchemaPixverseSoundEffectsInput,
  zSchemaPixverseSoundEffectsOutput,
  zSchemaRifeVideoInput,
  zSchemaRifeVideoOutput,
  zSchemaSam2VideoInput,
  zSchemaSam2VideoOutput,
  zSchemaSam3VideoInput,
  zSchemaSam3VideoOutput,
  zSchemaSam3VideoRleInput,
  zSchemaSam3VideoRleOutput,
  zSchemaScailInput,
  zSchemaScailOutput,
  zSchemaSeedvrUpscaleVideoInput,
  zSchemaSeedvrUpscaleVideoOutput,
  zSchemaSfxV15VideoToVideoInput,
  zSchemaSfxV15VideoToVideoOutput,
  zSchemaSfxV1VideoToVideoInput,
  zSchemaSfxV1VideoToVideoOutput,
  zSchemaSora2VideoToVideoRemixInput,
  zSchemaSora2VideoToVideoRemixOutput,
  zSchemaSteadyDancerInput,
  zSchemaSteadyDancerOutput,
  zSchemaSyncLipsyncInput,
  zSchemaSyncLipsyncOutput,
  zSchemaSyncLipsyncReact1Input,
  zSchemaSyncLipsyncReact1Output,
  zSchemaSyncLipsyncV2Input,
  zSchemaSyncLipsyncV2Output,
  zSchemaSyncLipsyncV2ProInput,
  zSchemaSyncLipsyncV2ProOutput,
  zSchemaThinksoundAudioInput,
  zSchemaThinksoundAudioOutput,
  zSchemaThinksoundInput,
  zSchemaThinksoundOutput,
  zSchemaTopazUpscaleVideoInput,
  zSchemaTopazUpscaleVideoOutput,
  zSchemaV26ReferenceToVideoInput,
  zSchemaV26ReferenceToVideoOutput,
  zSchemaVeo31ExtendVideoInput,
  zSchemaVeo31ExtendVideoOutput,
  zSchemaVeo31FastExtendVideoInput,
  zSchemaVeo31FastExtendVideoOutput,
  zSchemaVideoAsPromptInput,
  zSchemaVideoAsPromptOutput,
  zSchemaVideoBackgroundRemovalFastInput,
  zSchemaVideoBackgroundRemovalFastOutput,
  zSchemaVideoBackgroundRemovalGreenScreenInput,
  zSchemaVideoBackgroundRemovalGreenScreenOutput,
  zSchemaVideoBackgroundRemovalInput,
  zSchemaVideoBackgroundRemovalOutput,
  zSchemaVideoEraseKeypointsInput,
  zSchemaVideoEraseKeypointsOutput,
  zSchemaVideoEraseMaskInput,
  zSchemaVideoEraseMaskOutput,
  zSchemaVideoErasePromptInput,
  zSchemaVideoErasePromptOutput,
  zSchemaVideoIncreaseResolutionInput,
  zSchemaVideoIncreaseResolutionOutput,
  zSchemaVideoSoundEffectsGeneratorInput,
  zSchemaVideoSoundEffectsGeneratorOutput,
  zSchemaVideoUpscalerInput,
  zSchemaVideoUpscalerOutput,
  zSchemaViduQ2VideoExtensionProInput,
  zSchemaViduQ2VideoExtensionProOutput,
  zSchemaWan22VaceFunA14bDepthInput,
  zSchemaWan22VaceFunA14bDepthOutput,
  zSchemaWan22VaceFunA14bInpaintingInput,
  zSchemaWan22VaceFunA14bInpaintingOutput,
  zSchemaWan22VaceFunA14bOutpaintingInput,
  zSchemaWan22VaceFunA14bOutpaintingOutput,
  zSchemaWan22VaceFunA14bPoseInput,
  zSchemaWan22VaceFunA14bPoseOutput,
  zSchemaWan22VaceFunA14bReframeInput,
  zSchemaWan22VaceFunA14bReframeOutput,
  zSchemaWanFunControlInput,
  zSchemaWanFunControlOutput,
  zSchemaWanV2214bAnimateMoveInput,
  zSchemaWanV2214bAnimateMoveOutput,
  zSchemaWanV2214bAnimateReplaceInput,
  zSchemaWanV2214bAnimateReplaceOutput,
  zSchemaWanV22A14bVideoToVideoInput,
  zSchemaWanV22A14bVideoToVideoOutput,
  zSchemaWanVace13bInput,
  zSchemaWanVace13bOutput,
  zSchemaWanVace14bDepthInput,
  zSchemaWanVace14bDepthOutput,
  zSchemaWanVace14bInpaintingInput,
  zSchemaWanVace14bInpaintingOutput,
  zSchemaWanVace14bInput,
  zSchemaWanVace14bOutpaintingInput,
  zSchemaWanVace14bOutpaintingOutput,
  zSchemaWanVace14bOutput,
  zSchemaWanVace14bPoseInput,
  zSchemaWanVace14bPoseOutput,
  zSchemaWanVace14bReframeInput,
  zSchemaWanVace14bReframeOutput,
  zSchemaWanVaceAppsLongReframeInput,
  zSchemaWanVaceAppsLongReframeOutput,
  zSchemaWanVaceAppsVideoEditInput,
  zSchemaWanVaceAppsVideoEditOutput,
  zSchemaWanVaceInput,
  zSchemaWanVaceOutput,
  zSchemaWanVisionEnhancerInput,
  zSchemaWanVisionEnhancerOutput,
  zSchemaWorkflowUtilitiesAutoSubtitleInput,
  zSchemaWorkflowUtilitiesAutoSubtitleOutput,
} from './zod.gen'

import type {
  SchemaAiFaceSwapFaceswapvideoInput,
  SchemaAiFaceSwapFaceswapvideoOutput,
  SchemaAmtInterpolationInput,
  SchemaAmtInterpolationOutput,
  SchemaAutoCaptionInput,
  SchemaAutoCaptionOutput,
  SchemaBenV2VideoInput,
  SchemaBenV2VideoOutput,
  SchemaBirefnetV2VideoInput,
  SchemaBirefnetV2VideoOutput,
  SchemaBriaVideoEraserEraseKeypointsInput,
  SchemaBriaVideoEraserEraseKeypointsOutput,
  SchemaBriaVideoEraserEraseMaskInput,
  SchemaBriaVideoEraserEraseMaskOutput,
  SchemaBriaVideoEraserErasePromptInput,
  SchemaBriaVideoEraserErasePromptOutput,
  SchemaBytedanceUpscalerUpscaleVideoInput,
  SchemaBytedanceUpscalerUpscaleVideoOutput,
  SchemaCogvideox5bVideoToVideoInput,
  SchemaCogvideox5bVideoToVideoOutput,
  SchemaControlnextInput,
  SchemaControlnextOutput,
  SchemaCrystalVideoUpscalerInput,
  SchemaCrystalVideoUpscalerOutput,
  SchemaDubbingInput,
  SchemaDubbingOutput,
  SchemaDwposeVideoInput,
  SchemaDwposeVideoOutput,
  SchemaEdittoInput,
  SchemaEdittoOutput,
  SchemaFastAnimatediffTurboVideoToVideoInput,
  SchemaFastAnimatediffTurboVideoToVideoOutput,
  SchemaFastAnimatediffVideoToVideoInput,
  SchemaFastAnimatediffVideoToVideoOutput,
  SchemaFfmpegApiComposeInput,
  SchemaFfmpegApiComposeOutput,
  SchemaFfmpegApiMergeAudioVideoInput,
  SchemaFfmpegApiMergeAudioVideoOutput,
  SchemaFfmpegApiMergeVideosInput,
  SchemaFfmpegApiMergeVideosOutput,
  SchemaFilmVideoInput,
  SchemaFilmVideoOutput,
  SchemaFlashvsrUpscaleVideoInput,
  SchemaFlashvsrUpscaleVideoOutput,
  SchemaHunyuanVideoFoleyInput,
  SchemaHunyuanVideoFoleyOutput,
  SchemaHunyuanVideoLoraVideoToVideoInput,
  SchemaHunyuanVideoLoraVideoToVideoOutput,
  SchemaHunyuanVideoVideoToVideoInput,
  SchemaHunyuanVideoVideoToVideoOutput,
  SchemaInfinitalkInput,
  SchemaInfinitalkOutput,
  SchemaInfinitalkVideoToVideoInput,
  SchemaInfinitalkVideoToVideoOutput,
  SchemaKlingVideoO1StandardVideoToVideoEditInput,
  SchemaKlingVideoO1StandardVideoToVideoEditOutput,
  SchemaKlingVideoO1StandardVideoToVideoReferenceInput,
  SchemaKlingVideoO1StandardVideoToVideoReferenceOutput,
  SchemaKlingVideoO1VideoToVideoEditInput,
  SchemaKlingVideoO1VideoToVideoEditOutput,
  SchemaKlingVideoO1VideoToVideoReferenceInput,
  SchemaKlingVideoO1VideoToVideoReferenceOutput,
  SchemaKlingVideoV26ProMotionControlInput,
  SchemaKlingVideoV26ProMotionControlOutput,
  SchemaKlingVideoV26StandardMotionControlInput,
  SchemaKlingVideoV26StandardMotionControlOutput,
  SchemaKreaWan14bVideoToVideoInput,
  SchemaKreaWan14bVideoToVideoOutput,
  SchemaLatentsyncInput,
  SchemaLatentsyncOutput,
  SchemaLightxRecameraInput,
  SchemaLightxRecameraOutput,
  SchemaLightxRelightInput,
  SchemaLightxRelightOutput,
  SchemaLipsyncInput,
  SchemaLipsyncOutput,
  SchemaLtx219bDistilledExtendVideoInput,
  SchemaLtx219bDistilledExtendVideoLoraInput,
  SchemaLtx219bDistilledExtendVideoLoraOutput,
  SchemaLtx219bDistilledExtendVideoOutput,
  SchemaLtx219bDistilledVideoToVideoInput,
  SchemaLtx219bDistilledVideoToVideoLoraInput,
  SchemaLtx219bDistilledVideoToVideoLoraOutput,
  SchemaLtx219bDistilledVideoToVideoOutput,
  SchemaLtx219bExtendVideoInput,
  SchemaLtx219bExtendVideoLoraInput,
  SchemaLtx219bExtendVideoLoraOutput,
  SchemaLtx219bExtendVideoOutput,
  SchemaLtx219bVideoToVideoInput,
  SchemaLtx219bVideoToVideoLoraInput,
  SchemaLtx219bVideoToVideoLoraOutput,
  SchemaLtx219bVideoToVideoOutput,
  SchemaLtx2RetakeVideoInput,
  SchemaLtx2RetakeVideoOutput,
  SchemaLtxVideo13bDevExtendInput,
  SchemaLtxVideo13bDevExtendOutput,
  SchemaLtxVideo13bDevMulticonditioningInput,
  SchemaLtxVideo13bDevMulticonditioningOutput,
  SchemaLtxVideo13bDistilledExtendInput,
  SchemaLtxVideo13bDistilledExtendOutput,
  SchemaLtxVideo13bDistilledMulticonditioningInput,
  SchemaLtxVideo13bDistilledMulticonditioningOutput,
  SchemaLtxVideoLoraMulticonditioningInput,
  SchemaLtxVideoLoraMulticonditioningOutput,
  SchemaLtxVideoV095ExtendInput,
  SchemaLtxVideoV095ExtendOutput,
  SchemaLtxVideoV095MulticonditioningInput,
  SchemaLtxVideoV095MulticonditioningOutput,
  SchemaLtxv13B098DistilledExtendInput,
  SchemaLtxv13B098DistilledExtendOutput,
  SchemaLtxv13B098DistilledMulticonditioningInput,
  SchemaLtxv13B098DistilledMulticonditioningOutput,
  SchemaLucyEditDevInput,
  SchemaLucyEditDevOutput,
  SchemaLucyEditFastInput,
  SchemaLucyEditFastOutput,
  SchemaLucyEditProInput,
  SchemaLucyEditProOutput,
  SchemaLucyRestyleInput,
  SchemaLucyRestyleOutput,
  SchemaLumaDreamMachineRay2FlashModifyInput,
  SchemaLumaDreamMachineRay2FlashModifyOutput,
  SchemaLumaDreamMachineRay2FlashReframeInput,
  SchemaLumaDreamMachineRay2FlashReframeOutput,
  SchemaLumaDreamMachineRay2ModifyInput,
  SchemaLumaDreamMachineRay2ModifyOutput,
  SchemaLumaDreamMachineRay2ReframeInput,
  SchemaLumaDreamMachineRay2ReframeOutput,
  SchemaMagiDistilledExtendVideoInput,
  SchemaMagiDistilledExtendVideoOutput,
  SchemaMagiExtendVideoInput,
  SchemaMagiExtendVideoOutput,
  SchemaMareyMotionTransferInput,
  SchemaMareyMotionTransferOutput,
  SchemaMareyPoseTransferInput,
  SchemaMareyPoseTransferOutput,
  SchemaMmaudioV2Input,
  SchemaMmaudioV2Output,
  SchemaOneToAllAnimation13bInput,
  SchemaOneToAllAnimation13bOutput,
  SchemaOneToAllAnimation14bInput,
  SchemaOneToAllAnimation14bOutput,
  SchemaPikaV2PikadditionsInput,
  SchemaPikaV2PikadditionsOutput,
  SchemaPixverseExtendFastInput,
  SchemaPixverseExtendFastOutput,
  SchemaPixverseExtendInput,
  SchemaPixverseExtendOutput,
  SchemaPixverseLipsyncInput,
  SchemaPixverseLipsyncOutput,
  SchemaPixverseSoundEffectsInput,
  SchemaPixverseSoundEffectsOutput,
  SchemaRifeVideoInput,
  SchemaRifeVideoOutput,
  SchemaSam2VideoInput,
  SchemaSam2VideoOutput,
  SchemaSam3VideoInput,
  SchemaSam3VideoOutput,
  SchemaSam3VideoRleInput,
  SchemaSam3VideoRleOutput,
  SchemaScailInput,
  SchemaScailOutput,
  SchemaSeedvrUpscaleVideoInput,
  SchemaSeedvrUpscaleVideoOutput,
  SchemaSfxV15VideoToVideoInput,
  SchemaSfxV15VideoToVideoOutput,
  SchemaSfxV1VideoToVideoInput,
  SchemaSfxV1VideoToVideoOutput,
  SchemaSora2VideoToVideoRemixInput,
  SchemaSora2VideoToVideoRemixOutput,
  SchemaSteadyDancerInput,
  SchemaSteadyDancerOutput,
  SchemaSyncLipsyncInput,
  SchemaSyncLipsyncOutput,
  SchemaSyncLipsyncReact1Input,
  SchemaSyncLipsyncReact1Output,
  SchemaSyncLipsyncV2Input,
  SchemaSyncLipsyncV2Output,
  SchemaSyncLipsyncV2ProInput,
  SchemaSyncLipsyncV2ProOutput,
  SchemaThinksoundAudioInput,
  SchemaThinksoundAudioOutput,
  SchemaThinksoundInput,
  SchemaThinksoundOutput,
  SchemaTopazUpscaleVideoInput,
  SchemaTopazUpscaleVideoOutput,
  SchemaV26ReferenceToVideoInput,
  SchemaV26ReferenceToVideoOutput,
  SchemaVeo31ExtendVideoInput,
  SchemaVeo31ExtendVideoOutput,
  SchemaVeo31FastExtendVideoInput,
  SchemaVeo31FastExtendVideoOutput,
  SchemaVideoAsPromptInput,
  SchemaVideoAsPromptOutput,
  SchemaVideoBackgroundRemovalFastInput,
  SchemaVideoBackgroundRemovalFastOutput,
  SchemaVideoBackgroundRemovalGreenScreenInput,
  SchemaVideoBackgroundRemovalGreenScreenOutput,
  SchemaVideoBackgroundRemovalInput,
  SchemaVideoBackgroundRemovalOutput,
  SchemaVideoEraseKeypointsInput,
  SchemaVideoEraseKeypointsOutput,
  SchemaVideoEraseMaskInput,
  SchemaVideoEraseMaskOutput,
  SchemaVideoErasePromptInput,
  SchemaVideoErasePromptOutput,
  SchemaVideoIncreaseResolutionInput,
  SchemaVideoIncreaseResolutionOutput,
  SchemaVideoSoundEffectsGeneratorInput,
  SchemaVideoSoundEffectsGeneratorOutput,
  SchemaVideoUpscalerInput,
  SchemaVideoUpscalerOutput,
  SchemaViduQ2VideoExtensionProInput,
  SchemaViduQ2VideoExtensionProOutput,
  SchemaWan22VaceFunA14bDepthInput,
  SchemaWan22VaceFunA14bDepthOutput,
  SchemaWan22VaceFunA14bInpaintingInput,
  SchemaWan22VaceFunA14bInpaintingOutput,
  SchemaWan22VaceFunA14bOutpaintingInput,
  SchemaWan22VaceFunA14bOutpaintingOutput,
  SchemaWan22VaceFunA14bPoseInput,
  SchemaWan22VaceFunA14bPoseOutput,
  SchemaWan22VaceFunA14bReframeInput,
  SchemaWan22VaceFunA14bReframeOutput,
  SchemaWanFunControlInput,
  SchemaWanFunControlOutput,
  SchemaWanV2214bAnimateMoveInput,
  SchemaWanV2214bAnimateMoveOutput,
  SchemaWanV2214bAnimateReplaceInput,
  SchemaWanV2214bAnimateReplaceOutput,
  SchemaWanV22A14bVideoToVideoInput,
  SchemaWanV22A14bVideoToVideoOutput,
  SchemaWanVace13bInput,
  SchemaWanVace13bOutput,
  SchemaWanVace14bDepthInput,
  SchemaWanVace14bDepthOutput,
  SchemaWanVace14bInpaintingInput,
  SchemaWanVace14bInpaintingOutput,
  SchemaWanVace14bInput,
  SchemaWanVace14bOutpaintingInput,
  SchemaWanVace14bOutpaintingOutput,
  SchemaWanVace14bOutput,
  SchemaWanVace14bPoseInput,
  SchemaWanVace14bPoseOutput,
  SchemaWanVace14bReframeInput,
  SchemaWanVace14bReframeOutput,
  SchemaWanVaceAppsLongReframeInput,
  SchemaWanVaceAppsLongReframeOutput,
  SchemaWanVaceAppsVideoEditInput,
  SchemaWanVaceAppsVideoEditOutput,
  SchemaWanVaceInput,
  SchemaWanVaceOutput,
  SchemaWanVisionEnhancerInput,
  SchemaWanVisionEnhancerOutput,
  SchemaWorkflowUtilitiesAutoSubtitleInput,
  SchemaWorkflowUtilitiesAutoSubtitleOutput,
} from './types.gen'

import type { z } from 'zod'

export type VideoToVideoEndpointMap = {
  'bria/video/background-removal': {
    input: SchemaVideoBackgroundRemovalInput
    output: SchemaVideoBackgroundRemovalOutput
  }
  'fal-ai/mmaudio-v2': {
    input: SchemaMmaudioV2Input
    output: SchemaMmaudioV2Output
  }
  'half-moon-ai/ai-face-swap/faceswapvideo': {
    input: SchemaAiFaceSwapFaceswapvideoInput
    output: SchemaAiFaceSwapFaceswapvideoOutput
  }
  'fal-ai/ltx-2-19b/distilled/video-to-video/lora': {
    input: SchemaLtx219bDistilledVideoToVideoLoraInput
    output: SchemaLtx219bDistilledVideoToVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/distilled/video-to-video': {
    input: SchemaLtx219bDistilledVideoToVideoInput
    output: SchemaLtx219bDistilledVideoToVideoOutput
  }
  'fal-ai/ltx-2-19b/video-to-video/lora': {
    input: SchemaLtx219bVideoToVideoLoraInput
    output: SchemaLtx219bVideoToVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/video-to-video': {
    input: SchemaLtx219bVideoToVideoInput
    output: SchemaLtx219bVideoToVideoOutput
  }
  'fal-ai/ltx-2-19b/distilled/extend-video/lora': {
    input: SchemaLtx219bDistilledExtendVideoLoraInput
    output: SchemaLtx219bDistilledExtendVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/distilled/extend-video': {
    input: SchemaLtx219bDistilledExtendVideoInput
    output: SchemaLtx219bDistilledExtendVideoOutput
  }
  'fal-ai/ltx-2-19b/extend-video/lora': {
    input: SchemaLtx219bExtendVideoLoraInput
    output: SchemaLtx219bExtendVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/extend-video': {
    input: SchemaLtx219bExtendVideoInput
    output: SchemaLtx219bExtendVideoOutput
  }
  'bria/video/erase/keypoints': {
    input: SchemaVideoEraseKeypointsInput
    output: SchemaVideoEraseKeypointsOutput
  }
  'bria/video/erase/prompt': {
    input: SchemaVideoErasePromptInput
    output: SchemaVideoErasePromptOutput
  }
  'bria/video/erase/mask': {
    input: SchemaVideoEraseMaskInput
    output: SchemaVideoEraseMaskOutput
  }
  'fal-ai/lightx/relight': {
    input: SchemaLightxRelightInput
    output: SchemaLightxRelightOutput
  }
  'fal-ai/lightx/recamera': {
    input: SchemaLightxRecameraInput
    output: SchemaLightxRecameraOutput
  }
  'fal-ai/kling-video/v2.6/standard/motion-control': {
    input: SchemaKlingVideoV26StandardMotionControlInput
    output: SchemaKlingVideoV26StandardMotionControlOutput
  }
  'fal-ai/kling-video/v2.6/pro/motion-control': {
    input: SchemaKlingVideoV26ProMotionControlInput
    output: SchemaKlingVideoV26ProMotionControlOutput
  }
  'decart/lucy-restyle': {
    input: SchemaLucyRestyleInput
    output: SchemaLucyRestyleOutput
  }
  'fal-ai/scail': {
    input: SchemaScailInput
    output: SchemaScailOutput
  }
  'clarityai/crystal-video-upscaler': {
    input: SchemaCrystalVideoUpscalerInput
    output: SchemaCrystalVideoUpscalerOutput
  }
  'bria/bria_video_eraser/erase/mask': {
    input: SchemaBriaVideoEraserEraseMaskInput
    output: SchemaBriaVideoEraserEraseMaskOutput
  }
  'bria/bria_video_eraser/erase/keypoints': {
    input: SchemaBriaVideoEraserEraseKeypointsInput
    output: SchemaBriaVideoEraserEraseKeypointsOutput
  }
  'bria/bria_video_eraser/erase/prompt': {
    input: SchemaBriaVideoEraserErasePromptInput
    output: SchemaBriaVideoEraserErasePromptOutput
  }
  'wan/v2.6/reference-to-video': {
    input: SchemaV26ReferenceToVideoInput
    output: SchemaV26ReferenceToVideoOutput
  }
  'fal-ai/veo3.1/fast/extend-video': {
    input: SchemaVeo31FastExtendVideoInput
    output: SchemaVeo31FastExtendVideoOutput
  }
  'fal-ai/veo3.1/extend-video': {
    input: SchemaVeo31ExtendVideoInput
    output: SchemaVeo31ExtendVideoOutput
  }
  'fal-ai/kling-video/o1/standard/video-to-video/reference': {
    input: SchemaKlingVideoO1StandardVideoToVideoReferenceInput
    output: SchemaKlingVideoO1StandardVideoToVideoReferenceOutput
  }
  'fal-ai/kling-video/o1/standard/video-to-video/edit': {
    input: SchemaKlingVideoO1StandardVideoToVideoEditInput
    output: SchemaKlingVideoO1StandardVideoToVideoEditOutput
  }
  'fal-ai/steady-dancer': {
    input: SchemaSteadyDancerInput
    output: SchemaSteadyDancerOutput
  }
  'fal-ai/one-to-all-animation/1.3b': {
    input: SchemaOneToAllAnimation13bInput
    output: SchemaOneToAllAnimation13bOutput
  }
  'fal-ai/one-to-all-animation/14b': {
    input: SchemaOneToAllAnimation14bInput
    output: SchemaOneToAllAnimation14bOutput
  }
  'fal-ai/wan-vision-enhancer': {
    input: SchemaWanVisionEnhancerInput
    output: SchemaWanVisionEnhancerOutput
  }
  'fal-ai/sync-lipsync/react-1': {
    input: SchemaSyncLipsyncReact1Input
    output: SchemaSyncLipsyncReact1Output
  }
  'veed/video-background-removal/fast': {
    input: SchemaVideoBackgroundRemovalFastInput
    output: SchemaVideoBackgroundRemovalFastOutput
  }
  'fal-ai/kling-video/o1/video-to-video/edit': {
    input: SchemaKlingVideoO1VideoToVideoEditInput
    output: SchemaKlingVideoO1VideoToVideoEditOutput
  }
  'fal-ai/kling-video/o1/video-to-video/reference': {
    input: SchemaKlingVideoO1VideoToVideoReferenceInput
    output: SchemaKlingVideoO1VideoToVideoReferenceOutput
  }
  'veed/video-background-removal': {
    input: SchemaVideoBackgroundRemovalInput
    output: SchemaVideoBackgroundRemovalOutput
  }
  'veed/video-background-removal/green-screen': {
    input: SchemaVideoBackgroundRemovalGreenScreenInput
    output: SchemaVideoBackgroundRemovalGreenScreenOutput
  }
  'fal-ai/ltx-2/retake-video': {
    input: SchemaLtx2RetakeVideoInput
    output: SchemaLtx2RetakeVideoOutput
  }
  'decart/lucy-edit/fast': {
    input: SchemaLucyEditFastInput
    output: SchemaLucyEditFastOutput
  }
  'fal-ai/sam-3/video-rle': {
    input: SchemaSam3VideoRleInput
    output: SchemaSam3VideoRleOutput
  }
  'fal-ai/sam-3/video': {
    input: SchemaSam3VideoInput
    output: SchemaSam3VideoOutput
  }
  'fal-ai/editto': {
    input: SchemaEdittoInput
    output: SchemaEdittoOutput
  }
  'fal-ai/flashvsr/upscale/video': {
    input: SchemaFlashvsrUpscaleVideoInput
    output: SchemaFlashvsrUpscaleVideoOutput
  }
  'fal-ai/workflow-utilities/auto-subtitle': {
    input: SchemaWorkflowUtilitiesAutoSubtitleInput
    output: SchemaWorkflowUtilitiesAutoSubtitleOutput
  }
  'fal-ai/bytedance-upscaler/upscale/video': {
    input: SchemaBytedanceUpscalerUpscaleVideoInput
    output: SchemaBytedanceUpscalerUpscaleVideoOutput
  }
  'fal-ai/video-as-prompt': {
    input: SchemaVideoAsPromptInput
    output: SchemaVideoAsPromptOutput
  }
  'fal-ai/birefnet/v2/video': {
    input: SchemaBirefnetV2VideoInput
    output: SchemaBirefnetV2VideoOutput
  }
  'fal-ai/vidu/q2/video-extension/pro': {
    input: SchemaViduQ2VideoExtensionProInput
    output: SchemaViduQ2VideoExtensionProOutput
  }
  'mirelo-ai/sfx-v1.5/video-to-video': {
    input: SchemaSfxV15VideoToVideoInput
    output: SchemaSfxV15VideoToVideoOutput
  }
  'fal-ai/krea-wan-14b/video-to-video': {
    input: SchemaKreaWan14bVideoToVideoInput
    output: SchemaKreaWan14bVideoToVideoOutput
  }
  'fal-ai/sora-2/video-to-video/remix': {
    input: SchemaSora2VideoToVideoRemixInput
    output: SchemaSora2VideoToVideoRemixOutput
  }
  'fal-ai/wan-vace-apps/long-reframe': {
    input: SchemaWanVaceAppsLongReframeInput
    output: SchemaWanVaceAppsLongReframeOutput
  }
  'fal-ai/infinitalk/video-to-video': {
    input: SchemaInfinitalkVideoToVideoInput
    output: SchemaInfinitalkVideoToVideoOutput
  }
  'fal-ai/seedvr/upscale/video': {
    input: SchemaSeedvrUpscaleVideoInput
    output: SchemaSeedvrUpscaleVideoOutput
  }
  'fal-ai/wan-vace-apps/video-edit': {
    input: SchemaWanVaceAppsVideoEditInput
    output: SchemaWanVaceAppsVideoEditOutput
  }
  'fal-ai/wan/v2.2-14b/animate/replace': {
    input: SchemaWanV2214bAnimateReplaceInput
    output: SchemaWanV2214bAnimateReplaceOutput
  }
  'fal-ai/wan/v2.2-14b/animate/move': {
    input: SchemaWanV2214bAnimateMoveInput
    output: SchemaWanV2214bAnimateMoveOutput
  }
  'decart/lucy-edit/pro': {
    input: SchemaLucyEditProInput
    output: SchemaLucyEditProOutput
  }
  'decart/lucy-edit/dev': {
    input: SchemaLucyEditDevInput
    output: SchemaLucyEditDevOutput
  }
  'fal-ai/wan-22-vace-fun-a14b/reframe': {
    input: SchemaWan22VaceFunA14bReframeInput
    output: SchemaWan22VaceFunA14bReframeOutput
  }
  'fal-ai/wan-22-vace-fun-a14b/outpainting': {
    input: SchemaWan22VaceFunA14bOutpaintingInput
    output: SchemaWan22VaceFunA14bOutpaintingOutput
  }
  'fal-ai/wan-22-vace-fun-a14b/inpainting': {
    input: SchemaWan22VaceFunA14bInpaintingInput
    output: SchemaWan22VaceFunA14bInpaintingOutput
  }
  'fal-ai/wan-22-vace-fun-a14b/depth': {
    input: SchemaWan22VaceFunA14bDepthInput
    output: SchemaWan22VaceFunA14bDepthOutput
  }
  'fal-ai/wan-22-vace-fun-a14b/pose': {
    input: SchemaWan22VaceFunA14bPoseInput
    output: SchemaWan22VaceFunA14bPoseOutput
  }
  'fal-ai/hunyuan-video-foley': {
    input: SchemaHunyuanVideoFoleyInput
    output: SchemaHunyuanVideoFoleyOutput
  }
  'fal-ai/sync-lipsync/v2/pro': {
    input: SchemaSyncLipsyncV2ProInput
    output: SchemaSyncLipsyncV2ProOutput
  }
  'fal-ai/wan-fun-control': {
    input: SchemaWanFunControlInput
    output: SchemaWanFunControlOutput
  }
  'bria/video/increase-resolution': {
    input: SchemaVideoIncreaseResolutionInput
    output: SchemaVideoIncreaseResolutionOutput
  }
  'fal-ai/infinitalk': {
    input: SchemaInfinitalkInput
    output: SchemaInfinitalkOutput
  }
  'mirelo-ai/sfx-v1/video-to-video': {
    input: SchemaSfxV1VideoToVideoInput
    output: SchemaSfxV1VideoToVideoOutput
  }
  'moonvalley/marey/pose-transfer': {
    input: SchemaMareyPoseTransferInput
    output: SchemaMareyPoseTransferOutput
  }
  'moonvalley/marey/motion-transfer': {
    input: SchemaMareyMotionTransferInput
    output: SchemaMareyMotionTransferOutput
  }
  'fal-ai/ffmpeg-api/merge-videos': {
    input: SchemaFfmpegApiMergeVideosInput
    output: SchemaFfmpegApiMergeVideosOutput
  }
  'fal-ai/wan/v2.2-a14b/video-to-video': {
    input: SchemaWanV22A14bVideoToVideoInput
    output: SchemaWanV22A14bVideoToVideoOutput
  }
  'fal-ai/ltxv-13b-098-distilled/extend': {
    input: SchemaLtxv13B098DistilledExtendInput
    output: SchemaLtxv13B098DistilledExtendOutput
  }
  'fal-ai/rife/video': {
    input: SchemaRifeVideoInput
    output: SchemaRifeVideoOutput
  }
  'fal-ai/film/video': {
    input: SchemaFilmVideoInput
    output: SchemaFilmVideoOutput
  }
  'fal-ai/luma-dream-machine/ray-2-flash/modify': {
    input: SchemaLumaDreamMachineRay2FlashModifyInput
    output: SchemaLumaDreamMachineRay2FlashModifyOutput
  }
  'fal-ai/ltxv-13b-098-distilled/multiconditioning': {
    input: SchemaLtxv13B098DistilledMulticonditioningInput
    output: SchemaLtxv13B098DistilledMulticonditioningOutput
  }
  'fal-ai/pixverse/sound-effects': {
    input: SchemaPixverseSoundEffectsInput
    output: SchemaPixverseSoundEffectsOutput
  }
  'fal-ai/thinksound/audio': {
    input: SchemaThinksoundAudioInput
    output: SchemaThinksoundAudioOutput
  }
  'fal-ai/thinksound': {
    input: SchemaThinksoundInput
    output: SchemaThinksoundOutput
  }
  'fal-ai/pixverse/extend/fast': {
    input: SchemaPixverseExtendFastInput
    output: SchemaPixverseExtendFastOutput
  }
  'fal-ai/pixverse/extend': {
    input: SchemaPixverseExtendInput
    output: SchemaPixverseExtendOutput
  }
  'fal-ai/pixverse/lipsync': {
    input: SchemaPixverseLipsyncInput
    output: SchemaPixverseLipsyncOutput
  }
  'fal-ai/luma-dream-machine/ray-2/modify': {
    input: SchemaLumaDreamMachineRay2ModifyInput
    output: SchemaLumaDreamMachineRay2ModifyOutput
  }
  'fal-ai/wan-vace-14b/reframe': {
    input: SchemaWanVace14bReframeInput
    output: SchemaWanVace14bReframeOutput
  }
  'fal-ai/wan-vace-14b/outpainting': {
    input: SchemaWanVace14bOutpaintingInput
    output: SchemaWanVace14bOutpaintingOutput
  }
  'fal-ai/wan-vace-14b/inpainting': {
    input: SchemaWanVace14bInpaintingInput
    output: SchemaWanVace14bInpaintingOutput
  }
  'fal-ai/wan-vace-14b/pose': {
    input: SchemaWanVace14bPoseInput
    output: SchemaWanVace14bPoseOutput
  }
  'fal-ai/wan-vace-14b/depth': {
    input: SchemaWanVace14bDepthInput
    output: SchemaWanVace14bDepthOutput
  }
  'fal-ai/dwpose/video': {
    input: SchemaDwposeVideoInput
    output: SchemaDwposeVideoOutput
  }
  'fal-ai/ffmpeg-api/merge-audio-video': {
    input: SchemaFfmpegApiMergeAudioVideoInput
    output: SchemaFfmpegApiMergeAudioVideoOutput
  }
  'fal-ai/wan-vace-1-3b': {
    input: SchemaWanVace13bInput
    output: SchemaWanVace13bOutput
  }
  'fal-ai/luma-dream-machine/ray-2-flash/reframe': {
    input: SchemaLumaDreamMachineRay2FlashReframeInput
    output: SchemaLumaDreamMachineRay2FlashReframeOutput
  }
  'fal-ai/luma-dream-machine/ray-2/reframe': {
    input: SchemaLumaDreamMachineRay2ReframeInput
    output: SchemaLumaDreamMachineRay2ReframeOutput
  }
  'veed/lipsync': {
    input: SchemaLipsyncInput
    output: SchemaLipsyncOutput
  }
  'fal-ai/wan-vace-14b': {
    input: SchemaWanVace14bInput
    output: SchemaWanVace14bOutput
  }
  'fal-ai/ltx-video-13b-distilled/extend': {
    input: SchemaLtxVideo13bDistilledExtendInput
    output: SchemaLtxVideo13bDistilledExtendOutput
  }
  'fal-ai/ltx-video-13b-distilled/multiconditioning': {
    input: SchemaLtxVideo13bDistilledMulticonditioningInput
    output: SchemaLtxVideo13bDistilledMulticonditioningOutput
  }
  'fal-ai/ltx-video-13b-dev/multiconditioning': {
    input: SchemaLtxVideo13bDevMulticonditioningInput
    output: SchemaLtxVideo13bDevMulticonditioningOutput
  }
  'fal-ai/ltx-video-13b-dev/extend': {
    input: SchemaLtxVideo13bDevExtendInput
    output: SchemaLtxVideo13bDevExtendOutput
  }
  'fal-ai/ltx-video-lora/multiconditioning': {
    input: SchemaLtxVideoLoraMulticonditioningInput
    output: SchemaLtxVideoLoraMulticonditioningOutput
  }
  'fal-ai/magi/extend-video': {
    input: SchemaMagiExtendVideoInput
    output: SchemaMagiExtendVideoOutput
  }
  'fal-ai/magi-distilled/extend-video': {
    input: SchemaMagiDistilledExtendVideoInput
    output: SchemaMagiDistilledExtendVideoOutput
  }
  'fal-ai/wan-vace': {
    input: SchemaWanVaceInput
    output: SchemaWanVaceOutput
  }
  'cassetteai/video-sound-effects-generator': {
    input: SchemaVideoSoundEffectsGeneratorInput
    output: SchemaVideoSoundEffectsGeneratorOutput
  }
  'fal-ai/sync-lipsync/v2': {
    input: SchemaSyncLipsyncV2Input
    output: SchemaSyncLipsyncV2Output
  }
  'fal-ai/latentsync': {
    input: SchemaLatentsyncInput
    output: SchemaLatentsyncOutput
  }
  'fal-ai/pika/v2/pikadditions': {
    input: SchemaPikaV2PikadditionsInput
    output: SchemaPikaV2PikadditionsOutput
  }
  'fal-ai/ltx-video-v095/multiconditioning': {
    input: SchemaLtxVideoV095MulticonditioningInput
    output: SchemaLtxVideoV095MulticonditioningOutput
  }
  'fal-ai/ltx-video-v095/extend': {
    input: SchemaLtxVideoV095ExtendInput
    output: SchemaLtxVideoV095ExtendOutput
  }
  'fal-ai/topaz/upscale/video': {
    input: SchemaTopazUpscaleVideoInput
    output: SchemaTopazUpscaleVideoOutput
  }
  'fal-ai/ben/v2/video': {
    input: SchemaBenV2VideoInput
    output: SchemaBenV2VideoOutput
  }
  'fal-ai/hunyuan-video/video-to-video': {
    input: SchemaHunyuanVideoVideoToVideoInput
    output: SchemaHunyuanVideoVideoToVideoOutput
  }
  'fal-ai/hunyuan-video-lora/video-to-video': {
    input: SchemaHunyuanVideoLoraVideoToVideoInput
    output: SchemaHunyuanVideoLoraVideoToVideoOutput
  }
  'fal-ai/ffmpeg-api/compose': {
    input: SchemaFfmpegApiComposeInput
    output: SchemaFfmpegApiComposeOutput
  }
  'fal-ai/sync-lipsync': {
    input: SchemaSyncLipsyncInput
    output: SchemaSyncLipsyncOutput
  }
  'fal-ai/auto-caption': {
    input: SchemaAutoCaptionInput
    output: SchemaAutoCaptionOutput
  }
  'fal-ai/dubbing': {
    input: SchemaDubbingInput
    output: SchemaDubbingOutput
  }
  'fal-ai/video-upscaler': {
    input: SchemaVideoUpscalerInput
    output: SchemaVideoUpscalerOutput
  }
  'fal-ai/cogvideox-5b/video-to-video': {
    input: SchemaCogvideox5bVideoToVideoInput
    output: SchemaCogvideox5bVideoToVideoOutput
  }
  'fal-ai/controlnext': {
    input: SchemaControlnextInput
    output: SchemaControlnextOutput
  }
  'fal-ai/sam2/video': {
    input: SchemaSam2VideoInput
    output: SchemaSam2VideoOutput
  }
  'fal-ai/amt-interpolation': {
    input: SchemaAmtInterpolationInput
    output: SchemaAmtInterpolationOutput
  }
  'fal-ai/fast-animatediff/turbo/video-to-video': {
    input: SchemaFastAnimatediffTurboVideoToVideoInput
    output: SchemaFastAnimatediffTurboVideoToVideoOutput
  }
  'fal-ai/fast-animatediff/video-to-video': {
    input: SchemaFastAnimatediffVideoToVideoInput
    output: SchemaFastAnimatediffVideoToVideoOutput
  }
}

/** Union type of all video-to-video model endpoint IDs */
export type VideoToVideoModel = keyof VideoToVideoEndpointMap

export const VideoToVideoSchemaMap: Record<
  VideoToVideoModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ['bria/video/background-removal']: {
    input: zSchemaVideoBackgroundRemovalInput,
    output: zSchemaVideoBackgroundRemovalOutput,
  },
  ['fal-ai/mmaudio-v2']: {
    input: zSchemaMmaudioV2Input,
    output: zSchemaMmaudioV2Output,
  },
  ['half-moon-ai/ai-face-swap/faceswapvideo']: {
    input: zSchemaAiFaceSwapFaceswapvideoInput,
    output: zSchemaAiFaceSwapFaceswapvideoOutput,
  },
  ['fal-ai/ltx-2-19b/distilled/video-to-video/lora']: {
    input: zSchemaLtx219bDistilledVideoToVideoLoraInput,
    output: zSchemaLtx219bDistilledVideoToVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/distilled/video-to-video']: {
    input: zSchemaLtx219bDistilledVideoToVideoInput,
    output: zSchemaLtx219bDistilledVideoToVideoOutput,
  },
  ['fal-ai/ltx-2-19b/video-to-video/lora']: {
    input: zSchemaLtx219bVideoToVideoLoraInput,
    output: zSchemaLtx219bVideoToVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/video-to-video']: {
    input: zSchemaLtx219bVideoToVideoInput,
    output: zSchemaLtx219bVideoToVideoOutput,
  },
  ['fal-ai/ltx-2-19b/distilled/extend-video/lora']: {
    input: zSchemaLtx219bDistilledExtendVideoLoraInput,
    output: zSchemaLtx219bDistilledExtendVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/distilled/extend-video']: {
    input: zSchemaLtx219bDistilledExtendVideoInput,
    output: zSchemaLtx219bDistilledExtendVideoOutput,
  },
  ['fal-ai/ltx-2-19b/extend-video/lora']: {
    input: zSchemaLtx219bExtendVideoLoraInput,
    output: zSchemaLtx219bExtendVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/extend-video']: {
    input: zSchemaLtx219bExtendVideoInput,
    output: zSchemaLtx219bExtendVideoOutput,
  },
  ['bria/video/erase/keypoints']: {
    input: zSchemaVideoEraseKeypointsInput,
    output: zSchemaVideoEraseKeypointsOutput,
  },
  ['bria/video/erase/prompt']: {
    input: zSchemaVideoErasePromptInput,
    output: zSchemaVideoErasePromptOutput,
  },
  ['bria/video/erase/mask']: {
    input: zSchemaVideoEraseMaskInput,
    output: zSchemaVideoEraseMaskOutput,
  },
  ['fal-ai/lightx/relight']: {
    input: zSchemaLightxRelightInput,
    output: zSchemaLightxRelightOutput,
  },
  ['fal-ai/lightx/recamera']: {
    input: zSchemaLightxRecameraInput,
    output: zSchemaLightxRecameraOutput,
  },
  ['fal-ai/kling-video/v2.6/standard/motion-control']: {
    input: zSchemaKlingVideoV26StandardMotionControlInput,
    output: zSchemaKlingVideoV26StandardMotionControlOutput,
  },
  ['fal-ai/kling-video/v2.6/pro/motion-control']: {
    input: zSchemaKlingVideoV26ProMotionControlInput,
    output: zSchemaKlingVideoV26ProMotionControlOutput,
  },
  ['decart/lucy-restyle']: {
    input: zSchemaLucyRestyleInput,
    output: zSchemaLucyRestyleOutput,
  },
  ['fal-ai/scail']: {
    input: zSchemaScailInput,
    output: zSchemaScailOutput,
  },
  ['clarityai/crystal-video-upscaler']: {
    input: zSchemaCrystalVideoUpscalerInput,
    output: zSchemaCrystalVideoUpscalerOutput,
  },
  ['bria/bria_video_eraser/erase/mask']: {
    input: zSchemaBriaVideoEraserEraseMaskInput,
    output: zSchemaBriaVideoEraserEraseMaskOutput,
  },
  ['bria/bria_video_eraser/erase/keypoints']: {
    input: zSchemaBriaVideoEraserEraseKeypointsInput,
    output: zSchemaBriaVideoEraserEraseKeypointsOutput,
  },
  ['bria/bria_video_eraser/erase/prompt']: {
    input: zSchemaBriaVideoEraserErasePromptInput,
    output: zSchemaBriaVideoEraserErasePromptOutput,
  },
  ['wan/v2.6/reference-to-video']: {
    input: zSchemaV26ReferenceToVideoInput,
    output: zSchemaV26ReferenceToVideoOutput,
  },
  ['fal-ai/veo3.1/fast/extend-video']: {
    input: zSchemaVeo31FastExtendVideoInput,
    output: zSchemaVeo31FastExtendVideoOutput,
  },
  ['fal-ai/veo3.1/extend-video']: {
    input: zSchemaVeo31ExtendVideoInput,
    output: zSchemaVeo31ExtendVideoOutput,
  },
  ['fal-ai/kling-video/o1/standard/video-to-video/reference']: {
    input: zSchemaKlingVideoO1StandardVideoToVideoReferenceInput,
    output: zSchemaKlingVideoO1StandardVideoToVideoReferenceOutput,
  },
  ['fal-ai/kling-video/o1/standard/video-to-video/edit']: {
    input: zSchemaKlingVideoO1StandardVideoToVideoEditInput,
    output: zSchemaKlingVideoO1StandardVideoToVideoEditOutput,
  },
  ['fal-ai/steady-dancer']: {
    input: zSchemaSteadyDancerInput,
    output: zSchemaSteadyDancerOutput,
  },
  ['fal-ai/one-to-all-animation/1.3b']: {
    input: zSchemaOneToAllAnimation13bInput,
    output: zSchemaOneToAllAnimation13bOutput,
  },
  ['fal-ai/one-to-all-animation/14b']: {
    input: zSchemaOneToAllAnimation14bInput,
    output: zSchemaOneToAllAnimation14bOutput,
  },
  ['fal-ai/wan-vision-enhancer']: {
    input: zSchemaWanVisionEnhancerInput,
    output: zSchemaWanVisionEnhancerOutput,
  },
  ['fal-ai/sync-lipsync/react-1']: {
    input: zSchemaSyncLipsyncReact1Input,
    output: zSchemaSyncLipsyncReact1Output,
  },
  ['veed/video-background-removal/fast']: {
    input: zSchemaVideoBackgroundRemovalFastInput,
    output: zSchemaVideoBackgroundRemovalFastOutput,
  },
  ['fal-ai/kling-video/o1/video-to-video/edit']: {
    input: zSchemaKlingVideoO1VideoToVideoEditInput,
    output: zSchemaKlingVideoO1VideoToVideoEditOutput,
  },
  ['fal-ai/kling-video/o1/video-to-video/reference']: {
    input: zSchemaKlingVideoO1VideoToVideoReferenceInput,
    output: zSchemaKlingVideoO1VideoToVideoReferenceOutput,
  },
  ['veed/video-background-removal']: {
    input: zSchemaVideoBackgroundRemovalInput,
    output: zSchemaVideoBackgroundRemovalOutput,
  },
  ['veed/video-background-removal/green-screen']: {
    input: zSchemaVideoBackgroundRemovalGreenScreenInput,
    output: zSchemaVideoBackgroundRemovalGreenScreenOutput,
  },
  ['fal-ai/ltx-2/retake-video']: {
    input: zSchemaLtx2RetakeVideoInput,
    output: zSchemaLtx2RetakeVideoOutput,
  },
  ['decart/lucy-edit/fast']: {
    input: zSchemaLucyEditFastInput,
    output: zSchemaLucyEditFastOutput,
  },
  ['fal-ai/sam-3/video-rle']: {
    input: zSchemaSam3VideoRleInput,
    output: zSchemaSam3VideoRleOutput,
  },
  ['fal-ai/sam-3/video']: {
    input: zSchemaSam3VideoInput,
    output: zSchemaSam3VideoOutput,
  },
  ['fal-ai/editto']: {
    input: zSchemaEdittoInput,
    output: zSchemaEdittoOutput,
  },
  ['fal-ai/flashvsr/upscale/video']: {
    input: zSchemaFlashvsrUpscaleVideoInput,
    output: zSchemaFlashvsrUpscaleVideoOutput,
  },
  ['fal-ai/workflow-utilities/auto-subtitle']: {
    input: zSchemaWorkflowUtilitiesAutoSubtitleInput,
    output: zSchemaWorkflowUtilitiesAutoSubtitleOutput,
  },
  ['fal-ai/bytedance-upscaler/upscale/video']: {
    input: zSchemaBytedanceUpscalerUpscaleVideoInput,
    output: zSchemaBytedanceUpscalerUpscaleVideoOutput,
  },
  ['fal-ai/video-as-prompt']: {
    input: zSchemaVideoAsPromptInput,
    output: zSchemaVideoAsPromptOutput,
  },
  ['fal-ai/birefnet/v2/video']: {
    input: zSchemaBirefnetV2VideoInput,
    output: zSchemaBirefnetV2VideoOutput,
  },
  ['fal-ai/vidu/q2/video-extension/pro']: {
    input: zSchemaViduQ2VideoExtensionProInput,
    output: zSchemaViduQ2VideoExtensionProOutput,
  },
  ['mirelo-ai/sfx-v1.5/video-to-video']: {
    input: zSchemaSfxV15VideoToVideoInput,
    output: zSchemaSfxV15VideoToVideoOutput,
  },
  ['fal-ai/krea-wan-14b/video-to-video']: {
    input: zSchemaKreaWan14bVideoToVideoInput,
    output: zSchemaKreaWan14bVideoToVideoOutput,
  },
  ['fal-ai/sora-2/video-to-video/remix']: {
    input: zSchemaSora2VideoToVideoRemixInput,
    output: zSchemaSora2VideoToVideoRemixOutput,
  },
  ['fal-ai/wan-vace-apps/long-reframe']: {
    input: zSchemaWanVaceAppsLongReframeInput,
    output: zSchemaWanVaceAppsLongReframeOutput,
  },
  ['fal-ai/infinitalk/video-to-video']: {
    input: zSchemaInfinitalkVideoToVideoInput,
    output: zSchemaInfinitalkVideoToVideoOutput,
  },
  ['fal-ai/seedvr/upscale/video']: {
    input: zSchemaSeedvrUpscaleVideoInput,
    output: zSchemaSeedvrUpscaleVideoOutput,
  },
  ['fal-ai/wan-vace-apps/video-edit']: {
    input: zSchemaWanVaceAppsVideoEditInput,
    output: zSchemaWanVaceAppsVideoEditOutput,
  },
  ['fal-ai/wan/v2.2-14b/animate/replace']: {
    input: zSchemaWanV2214bAnimateReplaceInput,
    output: zSchemaWanV2214bAnimateReplaceOutput,
  },
  ['fal-ai/wan/v2.2-14b/animate/move']: {
    input: zSchemaWanV2214bAnimateMoveInput,
    output: zSchemaWanV2214bAnimateMoveOutput,
  },
  ['decart/lucy-edit/pro']: {
    input: zSchemaLucyEditProInput,
    output: zSchemaLucyEditProOutput,
  },
  ['decart/lucy-edit/dev']: {
    input: zSchemaLucyEditDevInput,
    output: zSchemaLucyEditDevOutput,
  },
  ['fal-ai/wan-22-vace-fun-a14b/reframe']: {
    input: zSchemaWan22VaceFunA14bReframeInput,
    output: zSchemaWan22VaceFunA14bReframeOutput,
  },
  ['fal-ai/wan-22-vace-fun-a14b/outpainting']: {
    input: zSchemaWan22VaceFunA14bOutpaintingInput,
    output: zSchemaWan22VaceFunA14bOutpaintingOutput,
  },
  ['fal-ai/wan-22-vace-fun-a14b/inpainting']: {
    input: zSchemaWan22VaceFunA14bInpaintingInput,
    output: zSchemaWan22VaceFunA14bInpaintingOutput,
  },
  ['fal-ai/wan-22-vace-fun-a14b/depth']: {
    input: zSchemaWan22VaceFunA14bDepthInput,
    output: zSchemaWan22VaceFunA14bDepthOutput,
  },
  ['fal-ai/wan-22-vace-fun-a14b/pose']: {
    input: zSchemaWan22VaceFunA14bPoseInput,
    output: zSchemaWan22VaceFunA14bPoseOutput,
  },
  ['fal-ai/hunyuan-video-foley']: {
    input: zSchemaHunyuanVideoFoleyInput,
    output: zSchemaHunyuanVideoFoleyOutput,
  },
  ['fal-ai/sync-lipsync/v2/pro']: {
    input: zSchemaSyncLipsyncV2ProInput,
    output: zSchemaSyncLipsyncV2ProOutput,
  },
  ['fal-ai/wan-fun-control']: {
    input: zSchemaWanFunControlInput,
    output: zSchemaWanFunControlOutput,
  },
  ['bria/video/increase-resolution']: {
    input: zSchemaVideoIncreaseResolutionInput,
    output: zSchemaVideoIncreaseResolutionOutput,
  },
  ['fal-ai/infinitalk']: {
    input: zSchemaInfinitalkInput,
    output: zSchemaInfinitalkOutput,
  },
  ['mirelo-ai/sfx-v1/video-to-video']: {
    input: zSchemaSfxV1VideoToVideoInput,
    output: zSchemaSfxV1VideoToVideoOutput,
  },
  ['moonvalley/marey/pose-transfer']: {
    input: zSchemaMareyPoseTransferInput,
    output: zSchemaMareyPoseTransferOutput,
  },
  ['moonvalley/marey/motion-transfer']: {
    input: zSchemaMareyMotionTransferInput,
    output: zSchemaMareyMotionTransferOutput,
  },
  ['fal-ai/ffmpeg-api/merge-videos']: {
    input: zSchemaFfmpegApiMergeVideosInput,
    output: zSchemaFfmpegApiMergeVideosOutput,
  },
  ['fal-ai/wan/v2.2-a14b/video-to-video']: {
    input: zSchemaWanV22A14bVideoToVideoInput,
    output: zSchemaWanV22A14bVideoToVideoOutput,
  },
  ['fal-ai/ltxv-13b-098-distilled/extend']: {
    input: zSchemaLtxv13B098DistilledExtendInput,
    output: zSchemaLtxv13B098DistilledExtendOutput,
  },
  ['fal-ai/rife/video']: {
    input: zSchemaRifeVideoInput,
    output: zSchemaRifeVideoOutput,
  },
  ['fal-ai/film/video']: {
    input: zSchemaFilmVideoInput,
    output: zSchemaFilmVideoOutput,
  },
  ['fal-ai/luma-dream-machine/ray-2-flash/modify']: {
    input: zSchemaLumaDreamMachineRay2FlashModifyInput,
    output: zSchemaLumaDreamMachineRay2FlashModifyOutput,
  },
  ['fal-ai/ltxv-13b-098-distilled/multiconditioning']: {
    input: zSchemaLtxv13B098DistilledMulticonditioningInput,
    output: zSchemaLtxv13B098DistilledMulticonditioningOutput,
  },
  ['fal-ai/pixverse/sound-effects']: {
    input: zSchemaPixverseSoundEffectsInput,
    output: zSchemaPixverseSoundEffectsOutput,
  },
  ['fal-ai/thinksound/audio']: {
    input: zSchemaThinksoundAudioInput,
    output: zSchemaThinksoundAudioOutput,
  },
  ['fal-ai/thinksound']: {
    input: zSchemaThinksoundInput,
    output: zSchemaThinksoundOutput,
  },
  ['fal-ai/pixverse/extend/fast']: {
    input: zSchemaPixverseExtendFastInput,
    output: zSchemaPixverseExtendFastOutput,
  },
  ['fal-ai/pixverse/extend']: {
    input: zSchemaPixverseExtendInput,
    output: zSchemaPixverseExtendOutput,
  },
  ['fal-ai/pixverse/lipsync']: {
    input: zSchemaPixverseLipsyncInput,
    output: zSchemaPixverseLipsyncOutput,
  },
  ['fal-ai/luma-dream-machine/ray-2/modify']: {
    input: zSchemaLumaDreamMachineRay2ModifyInput,
    output: zSchemaLumaDreamMachineRay2ModifyOutput,
  },
  ['fal-ai/wan-vace-14b/reframe']: {
    input: zSchemaWanVace14bReframeInput,
    output: zSchemaWanVace14bReframeOutput,
  },
  ['fal-ai/wan-vace-14b/outpainting']: {
    input: zSchemaWanVace14bOutpaintingInput,
    output: zSchemaWanVace14bOutpaintingOutput,
  },
  ['fal-ai/wan-vace-14b/inpainting']: {
    input: zSchemaWanVace14bInpaintingInput,
    output: zSchemaWanVace14bInpaintingOutput,
  },
  ['fal-ai/wan-vace-14b/pose']: {
    input: zSchemaWanVace14bPoseInput,
    output: zSchemaWanVace14bPoseOutput,
  },
  ['fal-ai/wan-vace-14b/depth']: {
    input: zSchemaWanVace14bDepthInput,
    output: zSchemaWanVace14bDepthOutput,
  },
  ['fal-ai/dwpose/video']: {
    input: zSchemaDwposeVideoInput,
    output: zSchemaDwposeVideoOutput,
  },
  ['fal-ai/ffmpeg-api/merge-audio-video']: {
    input: zSchemaFfmpegApiMergeAudioVideoInput,
    output: zSchemaFfmpegApiMergeAudioVideoOutput,
  },
  ['fal-ai/wan-vace-1-3b']: {
    input: zSchemaWanVace13bInput,
    output: zSchemaWanVace13bOutput,
  },
  ['fal-ai/luma-dream-machine/ray-2-flash/reframe']: {
    input: zSchemaLumaDreamMachineRay2FlashReframeInput,
    output: zSchemaLumaDreamMachineRay2FlashReframeOutput,
  },
  ['fal-ai/luma-dream-machine/ray-2/reframe']: {
    input: zSchemaLumaDreamMachineRay2ReframeInput,
    output: zSchemaLumaDreamMachineRay2ReframeOutput,
  },
  ['veed/lipsync']: {
    input: zSchemaLipsyncInput,
    output: zSchemaLipsyncOutput,
  },
  ['fal-ai/wan-vace-14b']: {
    input: zSchemaWanVace14bInput,
    output: zSchemaWanVace14bOutput,
  },
  ['fal-ai/ltx-video-13b-distilled/extend']: {
    input: zSchemaLtxVideo13bDistilledExtendInput,
    output: zSchemaLtxVideo13bDistilledExtendOutput,
  },
  ['fal-ai/ltx-video-13b-distilled/multiconditioning']: {
    input: zSchemaLtxVideo13bDistilledMulticonditioningInput,
    output: zSchemaLtxVideo13bDistilledMulticonditioningOutput,
  },
  ['fal-ai/ltx-video-13b-dev/multiconditioning']: {
    input: zSchemaLtxVideo13bDevMulticonditioningInput,
    output: zSchemaLtxVideo13bDevMulticonditioningOutput,
  },
  ['fal-ai/ltx-video-13b-dev/extend']: {
    input: zSchemaLtxVideo13bDevExtendInput,
    output: zSchemaLtxVideo13bDevExtendOutput,
  },
  ['fal-ai/ltx-video-lora/multiconditioning']: {
    input: zSchemaLtxVideoLoraMulticonditioningInput,
    output: zSchemaLtxVideoLoraMulticonditioningOutput,
  },
  ['fal-ai/magi/extend-video']: {
    input: zSchemaMagiExtendVideoInput,
    output: zSchemaMagiExtendVideoOutput,
  },
  ['fal-ai/magi-distilled/extend-video']: {
    input: zSchemaMagiDistilledExtendVideoInput,
    output: zSchemaMagiDistilledExtendVideoOutput,
  },
  ['fal-ai/wan-vace']: {
    input: zSchemaWanVaceInput,
    output: zSchemaWanVaceOutput,
  },
  ['cassetteai/video-sound-effects-generator']: {
    input: zSchemaVideoSoundEffectsGeneratorInput,
    output: zSchemaVideoSoundEffectsGeneratorOutput,
  },
  ['fal-ai/sync-lipsync/v2']: {
    input: zSchemaSyncLipsyncV2Input,
    output: zSchemaSyncLipsyncV2Output,
  },
  ['fal-ai/latentsync']: {
    input: zSchemaLatentsyncInput,
    output: zSchemaLatentsyncOutput,
  },
  ['fal-ai/pika/v2/pikadditions']: {
    input: zSchemaPikaV2PikadditionsInput,
    output: zSchemaPikaV2PikadditionsOutput,
  },
  ['fal-ai/ltx-video-v095/multiconditioning']: {
    input: zSchemaLtxVideoV095MulticonditioningInput,
    output: zSchemaLtxVideoV095MulticonditioningOutput,
  },
  ['fal-ai/ltx-video-v095/extend']: {
    input: zSchemaLtxVideoV095ExtendInput,
    output: zSchemaLtxVideoV095ExtendOutput,
  },
  ['fal-ai/topaz/upscale/video']: {
    input: zSchemaTopazUpscaleVideoInput,
    output: zSchemaTopazUpscaleVideoOutput,
  },
  ['fal-ai/ben/v2/video']: {
    input: zSchemaBenV2VideoInput,
    output: zSchemaBenV2VideoOutput,
  },
  ['fal-ai/hunyuan-video/video-to-video']: {
    input: zSchemaHunyuanVideoVideoToVideoInput,
    output: zSchemaHunyuanVideoVideoToVideoOutput,
  },
  ['fal-ai/hunyuan-video-lora/video-to-video']: {
    input: zSchemaHunyuanVideoLoraVideoToVideoInput,
    output: zSchemaHunyuanVideoLoraVideoToVideoOutput,
  },
  ['fal-ai/ffmpeg-api/compose']: {
    input: zSchemaFfmpegApiComposeInput,
    output: zSchemaFfmpegApiComposeOutput,
  },
  ['fal-ai/sync-lipsync']: {
    input: zSchemaSyncLipsyncInput,
    output: zSchemaSyncLipsyncOutput,
  },
  ['fal-ai/auto-caption']: {
    input: zSchemaAutoCaptionInput,
    output: zSchemaAutoCaptionOutput,
  },
  ['fal-ai/dubbing']: {
    input: zSchemaDubbingInput,
    output: zSchemaDubbingOutput,
  },
  ['fal-ai/video-upscaler']: {
    input: zSchemaVideoUpscalerInput,
    output: zSchemaVideoUpscalerOutput,
  },
  ['fal-ai/cogvideox-5b/video-to-video']: {
    input: zSchemaCogvideox5bVideoToVideoInput,
    output: zSchemaCogvideox5bVideoToVideoOutput,
  },
  ['fal-ai/controlnext']: {
    input: zSchemaControlnextInput,
    output: zSchemaControlnextOutput,
  },
  ['fal-ai/sam2/video']: {
    input: zSchemaSam2VideoInput,
    output: zSchemaSam2VideoOutput,
  },
  ['fal-ai/amt-interpolation']: {
    input: zSchemaAmtInterpolationInput,
    output: zSchemaAmtInterpolationOutput,
  },
  ['fal-ai/fast-animatediff/turbo/video-to-video']: {
    input: zSchemaFastAnimatediffTurboVideoToVideoInput,
    output: zSchemaFastAnimatediffTurboVideoToVideoOutput,
  },
  ['fal-ai/fast-animatediff/video-to-video']: {
    input: zSchemaFastAnimatediffVideoToVideoInput,
    output: zSchemaFastAnimatediffVideoToVideoOutput,
  },
} as const

/** Get the input type for a specific video-to-video model */
export type VideoToVideoModelInput<T extends VideoToVideoModel> =
  VideoToVideoEndpointMap[T]['input']

/** Get the output type for a specific video-to-video model */
export type VideoToVideoModelOutput<T extends VideoToVideoModel> =
  VideoToVideoEndpointMap[T]['output']
