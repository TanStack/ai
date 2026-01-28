// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaAiAvatarInput,
  zSchemaAiAvatarMultiInput,
  zSchemaAiAvatarMultiOutput,
  zSchemaAiAvatarMultiTextInput,
  zSchemaAiAvatarMultiTextOutput,
  zSchemaAiAvatarOutput,
  zSchemaAiAvatarSingleTextInput,
  zSchemaAiAvatarSingleTextOutput,
  zSchemaAmtInterpolationFrameInterpolationInput,
  zSchemaAmtInterpolationFrameInterpolationOutput,
  zSchemaBytedanceOmnihumanInput,
  zSchemaBytedanceOmnihumanOutput,
  zSchemaBytedanceOmnihumanV15Input,
  zSchemaBytedanceOmnihumanV15Output,
  zSchemaBytedanceSeedanceV15ProImageToVideoInput,
  zSchemaBytedanceSeedanceV15ProImageToVideoOutput,
  zSchemaBytedanceSeedanceV1LiteImageToVideoInput,
  zSchemaBytedanceSeedanceV1LiteImageToVideoOutput,
  zSchemaBytedanceSeedanceV1LiteReferenceToVideoInput,
  zSchemaBytedanceSeedanceV1LiteReferenceToVideoOutput,
  zSchemaBytedanceSeedanceV1ProFastImageToVideoInput,
  zSchemaBytedanceSeedanceV1ProFastImageToVideoOutput,
  zSchemaBytedanceSeedanceV1ProImageToVideoInput,
  zSchemaBytedanceSeedanceV1ProImageToVideoOutput,
  zSchemaBytedanceVideoStylizeInput,
  zSchemaBytedanceVideoStylizeOutput,
  zSchemaCogvideox5bImageToVideoInput,
  zSchemaCogvideox5bImageToVideoOutput,
  zSchemaCreatifyAuroraInput,
  zSchemaCreatifyAuroraOutput,
  zSchemaDecartLucy5bImageToVideoInput,
  zSchemaDecartLucy5bImageToVideoOutput,
  zSchemaFabric10FastInput,
  zSchemaFabric10FastOutput,
  zSchemaFabric10Input,
  zSchemaFabric10Output,
  zSchemaFastSvdLcmInput,
  zSchemaFastSvdLcmOutput,
  zSchemaFramepackF1Input,
  zSchemaFramepackF1Output,
  zSchemaFramepackFlf2vInput,
  zSchemaFramepackFlf2vOutput,
  zSchemaFramepackInput,
  zSchemaFramepackOutput,
  zSchemaHunyuanAvatarInput,
  zSchemaHunyuanAvatarOutput,
  zSchemaHunyuanCustomInput,
  zSchemaHunyuanCustomOutput,
  zSchemaHunyuanPortraitInput,
  zSchemaHunyuanPortraitOutput,
  zSchemaHunyuanVideoImageToVideoInput,
  zSchemaHunyuanVideoImageToVideoOutput,
  zSchemaHunyuanVideoImg2VidLoraInput,
  zSchemaHunyuanVideoImg2VidLoraOutput,
  zSchemaHunyuanVideoV15ImageToVideoInput,
  zSchemaHunyuanVideoV15ImageToVideoOutput,
  zSchemaKandinsky5ProImageToVideoInput,
  zSchemaKandinsky5ProImageToVideoOutput,
  zSchemaKlingVideoAiAvatarV2ProInput,
  zSchemaKlingVideoAiAvatarV2ProOutput,
  zSchemaKlingVideoAiAvatarV2StandardInput,
  zSchemaKlingVideoAiAvatarV2StandardOutput,
  zSchemaKlingVideoO1ImageToVideoInput,
  zSchemaKlingVideoO1ImageToVideoOutput,
  zSchemaKlingVideoO1ReferenceToVideoInput,
  zSchemaKlingVideoO1ReferenceToVideoOutput,
  zSchemaKlingVideoO1StandardImageToVideoInput,
  zSchemaKlingVideoO1StandardImageToVideoOutput,
  zSchemaKlingVideoO1StandardReferenceToVideoInput,
  zSchemaKlingVideoO1StandardReferenceToVideoOutput,
  zSchemaKlingVideoV15ProImageToVideoInput,
  zSchemaKlingVideoV15ProImageToVideoOutput,
  zSchemaKlingVideoV16ProElementsInput,
  zSchemaKlingVideoV16ProElementsOutput,
  zSchemaKlingVideoV16ProImageToVideoInput,
  zSchemaKlingVideoV16ProImageToVideoOutput,
  zSchemaKlingVideoV16StandardElementsInput,
  zSchemaKlingVideoV16StandardElementsOutput,
  zSchemaKlingVideoV16StandardImageToVideoInput,
  zSchemaKlingVideoV16StandardImageToVideoOutput,
  zSchemaKlingVideoV1ProAiAvatarInput,
  zSchemaKlingVideoV1ProAiAvatarOutput,
  zSchemaKlingVideoV1StandardAiAvatarInput,
  zSchemaKlingVideoV1StandardAiAvatarOutput,
  zSchemaKlingVideoV1StandardImageToVideoInput,
  zSchemaKlingVideoV1StandardImageToVideoOutput,
  zSchemaKlingVideoV21MasterImageToVideoInput,
  zSchemaKlingVideoV21MasterImageToVideoOutput,
  zSchemaKlingVideoV21ProImageToVideoInput,
  zSchemaKlingVideoV21ProImageToVideoOutput,
  zSchemaKlingVideoV21StandardImageToVideoInput,
  zSchemaKlingVideoV21StandardImageToVideoOutput,
  zSchemaKlingVideoV25TurboProImageToVideoInput,
  zSchemaKlingVideoV25TurboProImageToVideoOutput,
  zSchemaKlingVideoV25TurboStandardImageToVideoInput,
  zSchemaKlingVideoV25TurboStandardImageToVideoOutput,
  zSchemaKlingVideoV26ProImageToVideoInput,
  zSchemaKlingVideoV26ProImageToVideoOutput,
  zSchemaKlingVideoV2MasterImageToVideoInput,
  zSchemaKlingVideoV2MasterImageToVideoOutput,
  zSchemaLiveAvatarInput,
  zSchemaLiveAvatarOutput,
  zSchemaLivePortraitInput,
  zSchemaLivePortraitOutput,
  zSchemaLongcatVideoDistilledImageToVideo480pInput,
  zSchemaLongcatVideoDistilledImageToVideo480pOutput,
  zSchemaLongcatVideoDistilledImageToVideo720pInput,
  zSchemaLongcatVideoDistilledImageToVideo720pOutput,
  zSchemaLongcatVideoImageToVideo480pInput,
  zSchemaLongcatVideoImageToVideo480pOutput,
  zSchemaLongcatVideoImageToVideo720pInput,
  zSchemaLongcatVideoImageToVideo720pOutput,
  zSchemaLtx219bDistilledImageToVideoInput,
  zSchemaLtx219bDistilledImageToVideoLoraInput,
  zSchemaLtx219bDistilledImageToVideoLoraOutput,
  zSchemaLtx219bDistilledImageToVideoOutput,
  zSchemaLtx219bImageToVideoInput,
  zSchemaLtx219bImageToVideoLoraInput,
  zSchemaLtx219bImageToVideoLoraOutput,
  zSchemaLtx219bImageToVideoOutput,
  zSchemaLtx2ImageToVideoFastInput,
  zSchemaLtx2ImageToVideoFastOutput,
  zSchemaLtx2ImageToVideoInput,
  zSchemaLtx2ImageToVideoOutput,
  zSchemaLtxVideo13bDevImageToVideoInput,
  zSchemaLtxVideo13bDevImageToVideoOutput,
  zSchemaLtxVideo13bDistilledImageToVideoInput,
  zSchemaLtxVideo13bDistilledImageToVideoOutput,
  zSchemaLtxVideoImageToVideoInput,
  zSchemaLtxVideoImageToVideoOutput,
  zSchemaLtxVideoLoraImageToVideoInput,
  zSchemaLtxVideoLoraImageToVideoOutput,
  zSchemaLtxv13B098DistilledImageToVideoInput,
  zSchemaLtxv13B098DistilledImageToVideoOutput,
  zSchemaLucy14bImageToVideoInput,
  zSchemaLucy14bImageToVideoOutput,
  zSchemaLumaDreamMachineRay2FlashImageToVideoInput,
  zSchemaLumaDreamMachineRay2FlashImageToVideoOutput,
  zSchemaLumaDreamMachineRay2ImageToVideoInput,
  zSchemaLumaDreamMachineRay2ImageToVideoOutput,
  zSchemaLynxInput,
  zSchemaLynxOutput,
  zSchemaMagiDistilledImageToVideoInput,
  zSchemaMagiDistilledImageToVideoOutput,
  zSchemaMagiImageToVideoInput,
  zSchemaMagiImageToVideoOutput,
  zSchemaMareyI2vInput,
  zSchemaMareyI2vOutput,
  zSchemaMinimaxHailuo02FastImageToVideoInput,
  zSchemaMinimaxHailuo02FastImageToVideoOutput,
  zSchemaMinimaxHailuo02ProImageToVideoInput,
  zSchemaMinimaxHailuo02ProImageToVideoOutput,
  zSchemaMinimaxHailuo02StandardImageToVideoInput,
  zSchemaMinimaxHailuo02StandardImageToVideoOutput,
  zSchemaMinimaxHailuo23FastProImageToVideoInput,
  zSchemaMinimaxHailuo23FastProImageToVideoOutput,
  zSchemaMinimaxHailuo23FastStandardImageToVideoInput,
  zSchemaMinimaxHailuo23FastStandardImageToVideoOutput,
  zSchemaMinimaxHailuo23ProImageToVideoInput,
  zSchemaMinimaxHailuo23ProImageToVideoOutput,
  zSchemaMinimaxHailuo23StandardImageToVideoInput,
  zSchemaMinimaxHailuo23StandardImageToVideoOutput,
  zSchemaMinimaxVideo01DirectorImageToVideoInput,
  zSchemaMinimaxVideo01DirectorImageToVideoOutput,
  zSchemaMinimaxVideo01ImageToVideoInput,
  zSchemaMinimaxVideo01ImageToVideoOutput,
  zSchemaMinimaxVideo01LiveImageToVideoInput,
  zSchemaMinimaxVideo01LiveImageToVideoOutput,
  zSchemaMinimaxVideo01SubjectReferenceInput,
  zSchemaMinimaxVideo01SubjectReferenceOutput,
  zSchemaMusetalkInput,
  zSchemaMusetalkOutput,
  zSchemaOviImageToVideoInput,
  zSchemaOviImageToVideoOutput,
  zSchemaPikaV15PikaffectsInput,
  zSchemaPikaV15PikaffectsOutput,
  zSchemaPikaV21ImageToVideoInput,
  zSchemaPikaV21ImageToVideoOutput,
  zSchemaPikaV22ImageToVideoInput,
  zSchemaPikaV22ImageToVideoOutput,
  zSchemaPikaV22PikaframesInput,
  zSchemaPikaV22PikaframesOutput,
  zSchemaPikaV22PikascenesInput,
  zSchemaPikaV22PikascenesOutput,
  zSchemaPikaV2TurboImageToVideoInput,
  zSchemaPikaV2TurboImageToVideoOutput,
  zSchemaPixverseSwapInput,
  zSchemaPixverseSwapOutput,
  zSchemaPixverseV35EffectsInput,
  zSchemaPixverseV35EffectsOutput,
  zSchemaPixverseV35ImageToVideoFastInput,
  zSchemaPixverseV35ImageToVideoFastOutput,
  zSchemaPixverseV35ImageToVideoInput,
  zSchemaPixverseV35ImageToVideoOutput,
  zSchemaPixverseV35TransitionInput,
  zSchemaPixverseV35TransitionOutput,
  zSchemaPixverseV45EffectsInput,
  zSchemaPixverseV45EffectsOutput,
  zSchemaPixverseV45ImageToVideoFastInput,
  zSchemaPixverseV45ImageToVideoFastOutput,
  zSchemaPixverseV45ImageToVideoInput,
  zSchemaPixverseV45ImageToVideoOutput,
  zSchemaPixverseV45TransitionInput,
  zSchemaPixverseV45TransitionOutput,
  zSchemaPixverseV4EffectsInput,
  zSchemaPixverseV4EffectsOutput,
  zSchemaPixverseV4ImageToVideoFastInput,
  zSchemaPixverseV4ImageToVideoFastOutput,
  zSchemaPixverseV4ImageToVideoInput,
  zSchemaPixverseV4ImageToVideoOutput,
  zSchemaPixverseV55EffectsInput,
  zSchemaPixverseV55EffectsOutput,
  zSchemaPixverseV55ImageToVideoInput,
  zSchemaPixverseV55ImageToVideoOutput,
  zSchemaPixverseV55TransitionInput,
  zSchemaPixverseV55TransitionOutput,
  zSchemaPixverseV56ImageToVideoInput,
  zSchemaPixverseV56ImageToVideoOutput,
  zSchemaPixverseV56TransitionInput,
  zSchemaPixverseV56TransitionOutput,
  zSchemaPixverseV5EffectsInput,
  zSchemaPixverseV5EffectsOutput,
  zSchemaPixverseV5ImageToVideoInput,
  zSchemaPixverseV5ImageToVideoOutput,
  zSchemaPixverseV5TransitionInput,
  zSchemaPixverseV5TransitionOutput,
  zSchemaSadtalkerInput,
  zSchemaSadtalkerOutput,
  zSchemaSadtalkerReferenceInput,
  zSchemaSadtalkerReferenceOutput,
  zSchemaSkyreelsI2vInput,
  zSchemaSkyreelsI2vOutput,
  zSchemaSora2ImageToVideoInput,
  zSchemaSora2ImageToVideoOutput,
  zSchemaSora2ImageToVideoProInput,
  zSchemaSora2ImageToVideoProOutput,
  zSchemaStableVideoInput,
  zSchemaStableVideoOutput,
  zSchemaV26ImageToVideoFlashInput,
  zSchemaV26ImageToVideoFlashOutput,
  zSchemaV26ImageToVideoInput,
  zSchemaV26ImageToVideoOutput,
  zSchemaVeo2ImageToVideoInput,
  zSchemaVeo2ImageToVideoOutput,
  zSchemaVeo31FastFirstLastFrameToVideoInput,
  zSchemaVeo31FastFirstLastFrameToVideoOutput,
  zSchemaVeo31FastImageToVideoInput,
  zSchemaVeo31FastImageToVideoOutput,
  zSchemaVeo31FirstLastFrameToVideoInput,
  zSchemaVeo31FirstLastFrameToVideoOutput,
  zSchemaVeo31ImageToVideoInput,
  zSchemaVeo31ImageToVideoOutput,
  zSchemaVeo31ReferenceToVideoInput,
  zSchemaVeo31ReferenceToVideoOutput,
  zSchemaVeo3FastImageToVideoInput,
  zSchemaVeo3FastImageToVideoOutput,
  zSchemaVeo3ImageToVideoInput,
  zSchemaVeo3ImageToVideoOutput,
  zSchemaViduImageToVideoInput,
  zSchemaViduImageToVideoOutput,
  zSchemaViduQ1ImageToVideoInput,
  zSchemaViduQ1ImageToVideoOutput,
  zSchemaViduQ1ReferenceToVideoInput,
  zSchemaViduQ1ReferenceToVideoOutput,
  zSchemaViduQ1StartEndToVideoInput,
  zSchemaViduQ1StartEndToVideoOutput,
  zSchemaViduQ2ImageToVideoProInput,
  zSchemaViduQ2ImageToVideoProOutput,
  zSchemaViduQ2ImageToVideoTurboInput,
  zSchemaViduQ2ImageToVideoTurboOutput,
  zSchemaViduQ2ReferenceToVideoProInput,
  zSchemaViduQ2ReferenceToVideoProOutput,
  zSchemaViduReferenceToVideoInput,
  zSchemaViduReferenceToVideoOutput,
  zSchemaViduStartEndToVideoInput,
  zSchemaViduStartEndToVideoOutput,
  zSchemaViduTemplateToVideoInput,
  zSchemaViduTemplateToVideoOutput,
  zSchemaWan25PreviewImageToVideoInput,
  zSchemaWan25PreviewImageToVideoOutput,
  zSchemaWanAtiInput,
  zSchemaWanAtiOutput,
  zSchemaWanEffectsInput,
  zSchemaWanEffectsOutput,
  zSchemaWanFlf2vInput,
  zSchemaWanFlf2vOutput,
  zSchemaWanI2vInput,
  zSchemaWanI2vLoraInput,
  zSchemaWanI2vLoraOutput,
  zSchemaWanI2vOutput,
  zSchemaWanMoveInput,
  zSchemaWanMoveOutput,
  zSchemaWanProImageToVideoInput,
  zSchemaWanProImageToVideoOutput,
  zSchemaWanV225bImageToVideoInput,
  zSchemaWanV225bImageToVideoOutput,
  zSchemaWanV22A14bImageToVideoInput,
  zSchemaWanV22A14bImageToVideoLoraInput,
  zSchemaWanV22A14bImageToVideoLoraOutput,
  zSchemaWanV22A14bImageToVideoOutput,
  zSchemaWanV22A14bImageToVideoTurboInput,
  zSchemaWanV22A14bImageToVideoTurboOutput,
} from './zod.gen'

import type {
  SchemaAiAvatarInput,
  SchemaAiAvatarMultiInput,
  SchemaAiAvatarMultiOutput,
  SchemaAiAvatarMultiTextInput,
  SchemaAiAvatarMultiTextOutput,
  SchemaAiAvatarOutput,
  SchemaAiAvatarSingleTextInput,
  SchemaAiAvatarSingleTextOutput,
  SchemaAmtInterpolationFrameInterpolationInput,
  SchemaAmtInterpolationFrameInterpolationOutput,
  SchemaBytedanceOmnihumanInput,
  SchemaBytedanceOmnihumanOutput,
  SchemaBytedanceOmnihumanV15Input,
  SchemaBytedanceOmnihumanV15Output,
  SchemaBytedanceSeedanceV15ProImageToVideoInput,
  SchemaBytedanceSeedanceV15ProImageToVideoOutput,
  SchemaBytedanceSeedanceV1LiteImageToVideoInput,
  SchemaBytedanceSeedanceV1LiteImageToVideoOutput,
  SchemaBytedanceSeedanceV1LiteReferenceToVideoInput,
  SchemaBytedanceSeedanceV1LiteReferenceToVideoOutput,
  SchemaBytedanceSeedanceV1ProFastImageToVideoInput,
  SchemaBytedanceSeedanceV1ProFastImageToVideoOutput,
  SchemaBytedanceSeedanceV1ProImageToVideoInput,
  SchemaBytedanceSeedanceV1ProImageToVideoOutput,
  SchemaBytedanceVideoStylizeInput,
  SchemaBytedanceVideoStylizeOutput,
  SchemaCogvideox5bImageToVideoInput,
  SchemaCogvideox5bImageToVideoOutput,
  SchemaCreatifyAuroraInput,
  SchemaCreatifyAuroraOutput,
  SchemaDecartLucy5bImageToVideoInput,
  SchemaDecartLucy5bImageToVideoOutput,
  SchemaFabric10FastInput,
  SchemaFabric10FastOutput,
  SchemaFabric10Input,
  SchemaFabric10Output,
  SchemaFastSvdLcmInput,
  SchemaFastSvdLcmOutput,
  SchemaFramepackF1Input,
  SchemaFramepackF1Output,
  SchemaFramepackFlf2vInput,
  SchemaFramepackFlf2vOutput,
  SchemaFramepackInput,
  SchemaFramepackOutput,
  SchemaHunyuanAvatarInput,
  SchemaHunyuanAvatarOutput,
  SchemaHunyuanCustomInput,
  SchemaHunyuanCustomOutput,
  SchemaHunyuanPortraitInput,
  SchemaHunyuanPortraitOutput,
  SchemaHunyuanVideoImageToVideoInput,
  SchemaHunyuanVideoImageToVideoOutput,
  SchemaHunyuanVideoImg2VidLoraInput,
  SchemaHunyuanVideoImg2VidLoraOutput,
  SchemaHunyuanVideoV15ImageToVideoInput,
  SchemaHunyuanVideoV15ImageToVideoOutput,
  SchemaKandinsky5ProImageToVideoInput,
  SchemaKandinsky5ProImageToVideoOutput,
  SchemaKlingVideoAiAvatarV2ProInput,
  SchemaKlingVideoAiAvatarV2ProOutput,
  SchemaKlingVideoAiAvatarV2StandardInput,
  SchemaKlingVideoAiAvatarV2StandardOutput,
  SchemaKlingVideoO1ImageToVideoInput,
  SchemaKlingVideoO1ImageToVideoOutput,
  SchemaKlingVideoO1ReferenceToVideoInput,
  SchemaKlingVideoO1ReferenceToVideoOutput,
  SchemaKlingVideoO1StandardImageToVideoInput,
  SchemaKlingVideoO1StandardImageToVideoOutput,
  SchemaKlingVideoO1StandardReferenceToVideoInput,
  SchemaKlingVideoO1StandardReferenceToVideoOutput,
  SchemaKlingVideoV15ProImageToVideoInput,
  SchemaKlingVideoV15ProImageToVideoOutput,
  SchemaKlingVideoV16ProElementsInput,
  SchemaKlingVideoV16ProElementsOutput,
  SchemaKlingVideoV16ProImageToVideoInput,
  SchemaKlingVideoV16ProImageToVideoOutput,
  SchemaKlingVideoV16StandardElementsInput,
  SchemaKlingVideoV16StandardElementsOutput,
  SchemaKlingVideoV16StandardImageToVideoInput,
  SchemaKlingVideoV16StandardImageToVideoOutput,
  SchemaKlingVideoV1ProAiAvatarInput,
  SchemaKlingVideoV1ProAiAvatarOutput,
  SchemaKlingVideoV1StandardAiAvatarInput,
  SchemaKlingVideoV1StandardAiAvatarOutput,
  SchemaKlingVideoV1StandardImageToVideoInput,
  SchemaKlingVideoV1StandardImageToVideoOutput,
  SchemaKlingVideoV21MasterImageToVideoInput,
  SchemaKlingVideoV21MasterImageToVideoOutput,
  SchemaKlingVideoV21ProImageToVideoInput,
  SchemaKlingVideoV21ProImageToVideoOutput,
  SchemaKlingVideoV21StandardImageToVideoInput,
  SchemaKlingVideoV21StandardImageToVideoOutput,
  SchemaKlingVideoV25TurboProImageToVideoInput,
  SchemaKlingVideoV25TurboProImageToVideoOutput,
  SchemaKlingVideoV25TurboStandardImageToVideoInput,
  SchemaKlingVideoV25TurboStandardImageToVideoOutput,
  SchemaKlingVideoV26ProImageToVideoInput,
  SchemaKlingVideoV26ProImageToVideoOutput,
  SchemaKlingVideoV2MasterImageToVideoInput,
  SchemaKlingVideoV2MasterImageToVideoOutput,
  SchemaLiveAvatarInput,
  SchemaLiveAvatarOutput,
  SchemaLivePortraitInput,
  SchemaLivePortraitOutput,
  SchemaLongcatVideoDistilledImageToVideo480pInput,
  SchemaLongcatVideoDistilledImageToVideo480pOutput,
  SchemaLongcatVideoDistilledImageToVideo720pInput,
  SchemaLongcatVideoDistilledImageToVideo720pOutput,
  SchemaLongcatVideoImageToVideo480pInput,
  SchemaLongcatVideoImageToVideo480pOutput,
  SchemaLongcatVideoImageToVideo720pInput,
  SchemaLongcatVideoImageToVideo720pOutput,
  SchemaLtx219bDistilledImageToVideoInput,
  SchemaLtx219bDistilledImageToVideoLoraInput,
  SchemaLtx219bDistilledImageToVideoLoraOutput,
  SchemaLtx219bDistilledImageToVideoOutput,
  SchemaLtx219bImageToVideoInput,
  SchemaLtx219bImageToVideoLoraInput,
  SchemaLtx219bImageToVideoLoraOutput,
  SchemaLtx219bImageToVideoOutput,
  SchemaLtx2ImageToVideoFastInput,
  SchemaLtx2ImageToVideoFastOutput,
  SchemaLtx2ImageToVideoInput,
  SchemaLtx2ImageToVideoOutput,
  SchemaLtxVideo13bDevImageToVideoInput,
  SchemaLtxVideo13bDevImageToVideoOutput,
  SchemaLtxVideo13bDistilledImageToVideoInput,
  SchemaLtxVideo13bDistilledImageToVideoOutput,
  SchemaLtxVideoImageToVideoInput,
  SchemaLtxVideoImageToVideoOutput,
  SchemaLtxVideoLoraImageToVideoInput,
  SchemaLtxVideoLoraImageToVideoOutput,
  SchemaLtxv13B098DistilledImageToVideoInput,
  SchemaLtxv13B098DistilledImageToVideoOutput,
  SchemaLucy14bImageToVideoInput,
  SchemaLucy14bImageToVideoOutput,
  SchemaLumaDreamMachineRay2FlashImageToVideoInput,
  SchemaLumaDreamMachineRay2FlashImageToVideoOutput,
  SchemaLumaDreamMachineRay2ImageToVideoInput,
  SchemaLumaDreamMachineRay2ImageToVideoOutput,
  SchemaLynxInput,
  SchemaLynxOutput,
  SchemaMagiDistilledImageToVideoInput,
  SchemaMagiDistilledImageToVideoOutput,
  SchemaMagiImageToVideoInput,
  SchemaMagiImageToVideoOutput,
  SchemaMareyI2vInput,
  SchemaMareyI2vOutput,
  SchemaMinimaxHailuo02FastImageToVideoInput,
  SchemaMinimaxHailuo02FastImageToVideoOutput,
  SchemaMinimaxHailuo02ProImageToVideoInput,
  SchemaMinimaxHailuo02ProImageToVideoOutput,
  SchemaMinimaxHailuo02StandardImageToVideoInput,
  SchemaMinimaxHailuo02StandardImageToVideoOutput,
  SchemaMinimaxHailuo23FastProImageToVideoInput,
  SchemaMinimaxHailuo23FastProImageToVideoOutput,
  SchemaMinimaxHailuo23FastStandardImageToVideoInput,
  SchemaMinimaxHailuo23FastStandardImageToVideoOutput,
  SchemaMinimaxHailuo23ProImageToVideoInput,
  SchemaMinimaxHailuo23ProImageToVideoOutput,
  SchemaMinimaxHailuo23StandardImageToVideoInput,
  SchemaMinimaxHailuo23StandardImageToVideoOutput,
  SchemaMinimaxVideo01DirectorImageToVideoInput,
  SchemaMinimaxVideo01DirectorImageToVideoOutput,
  SchemaMinimaxVideo01ImageToVideoInput,
  SchemaMinimaxVideo01ImageToVideoOutput,
  SchemaMinimaxVideo01LiveImageToVideoInput,
  SchemaMinimaxVideo01LiveImageToVideoOutput,
  SchemaMinimaxVideo01SubjectReferenceInput,
  SchemaMinimaxVideo01SubjectReferenceOutput,
  SchemaMusetalkInput,
  SchemaMusetalkOutput,
  SchemaOviImageToVideoInput,
  SchemaOviImageToVideoOutput,
  SchemaPikaV15PikaffectsInput,
  SchemaPikaV15PikaffectsOutput,
  SchemaPikaV21ImageToVideoInput,
  SchemaPikaV21ImageToVideoOutput,
  SchemaPikaV22ImageToVideoInput,
  SchemaPikaV22ImageToVideoOutput,
  SchemaPikaV22PikaframesInput,
  SchemaPikaV22PikaframesOutput,
  SchemaPikaV22PikascenesInput,
  SchemaPikaV22PikascenesOutput,
  SchemaPikaV2TurboImageToVideoInput,
  SchemaPikaV2TurboImageToVideoOutput,
  SchemaPixverseSwapInput,
  SchemaPixverseSwapOutput,
  SchemaPixverseV35EffectsInput,
  SchemaPixverseV35EffectsOutput,
  SchemaPixverseV35ImageToVideoFastInput,
  SchemaPixverseV35ImageToVideoFastOutput,
  SchemaPixverseV35ImageToVideoInput,
  SchemaPixverseV35ImageToVideoOutput,
  SchemaPixverseV35TransitionInput,
  SchemaPixverseV35TransitionOutput,
  SchemaPixverseV45EffectsInput,
  SchemaPixverseV45EffectsOutput,
  SchemaPixverseV45ImageToVideoFastInput,
  SchemaPixverseV45ImageToVideoFastOutput,
  SchemaPixverseV45ImageToVideoInput,
  SchemaPixverseV45ImageToVideoOutput,
  SchemaPixverseV45TransitionInput,
  SchemaPixverseV45TransitionOutput,
  SchemaPixverseV4EffectsInput,
  SchemaPixverseV4EffectsOutput,
  SchemaPixverseV4ImageToVideoFastInput,
  SchemaPixverseV4ImageToVideoFastOutput,
  SchemaPixverseV4ImageToVideoInput,
  SchemaPixverseV4ImageToVideoOutput,
  SchemaPixverseV55EffectsInput,
  SchemaPixverseV55EffectsOutput,
  SchemaPixverseV55ImageToVideoInput,
  SchemaPixverseV55ImageToVideoOutput,
  SchemaPixverseV55TransitionInput,
  SchemaPixverseV55TransitionOutput,
  SchemaPixverseV56ImageToVideoInput,
  SchemaPixverseV56ImageToVideoOutput,
  SchemaPixverseV56TransitionInput,
  SchemaPixverseV56TransitionOutput,
  SchemaPixverseV5EffectsInput,
  SchemaPixverseV5EffectsOutput,
  SchemaPixverseV5ImageToVideoInput,
  SchemaPixverseV5ImageToVideoOutput,
  SchemaPixverseV5TransitionInput,
  SchemaPixverseV5TransitionOutput,
  SchemaSadtalkerInput,
  SchemaSadtalkerOutput,
  SchemaSadtalkerReferenceInput,
  SchemaSadtalkerReferenceOutput,
  SchemaSkyreelsI2vInput,
  SchemaSkyreelsI2vOutput,
  SchemaSora2ImageToVideoInput,
  SchemaSora2ImageToVideoOutput,
  SchemaSora2ImageToVideoProInput,
  SchemaSora2ImageToVideoProOutput,
  SchemaStableVideoInput,
  SchemaStableVideoOutput,
  SchemaV26ImageToVideoFlashInput,
  SchemaV26ImageToVideoFlashOutput,
  SchemaV26ImageToVideoInput,
  SchemaV26ImageToVideoOutput,
  SchemaVeo2ImageToVideoInput,
  SchemaVeo2ImageToVideoOutput,
  SchemaVeo31FastFirstLastFrameToVideoInput,
  SchemaVeo31FastFirstLastFrameToVideoOutput,
  SchemaVeo31FastImageToVideoInput,
  SchemaVeo31FastImageToVideoOutput,
  SchemaVeo31FirstLastFrameToVideoInput,
  SchemaVeo31FirstLastFrameToVideoOutput,
  SchemaVeo31ImageToVideoInput,
  SchemaVeo31ImageToVideoOutput,
  SchemaVeo31ReferenceToVideoInput,
  SchemaVeo31ReferenceToVideoOutput,
  SchemaVeo3FastImageToVideoInput,
  SchemaVeo3FastImageToVideoOutput,
  SchemaVeo3ImageToVideoInput,
  SchemaVeo3ImageToVideoOutput,
  SchemaViduImageToVideoInput,
  SchemaViduImageToVideoOutput,
  SchemaViduQ1ImageToVideoInput,
  SchemaViduQ1ImageToVideoOutput,
  SchemaViduQ1ReferenceToVideoInput,
  SchemaViduQ1ReferenceToVideoOutput,
  SchemaViduQ1StartEndToVideoInput,
  SchemaViduQ1StartEndToVideoOutput,
  SchemaViduQ2ImageToVideoProInput,
  SchemaViduQ2ImageToVideoProOutput,
  SchemaViduQ2ImageToVideoTurboInput,
  SchemaViduQ2ImageToVideoTurboOutput,
  SchemaViduQ2ReferenceToVideoProInput,
  SchemaViduQ2ReferenceToVideoProOutput,
  SchemaViduReferenceToVideoInput,
  SchemaViduReferenceToVideoOutput,
  SchemaViduStartEndToVideoInput,
  SchemaViduStartEndToVideoOutput,
  SchemaViduTemplateToVideoInput,
  SchemaViduTemplateToVideoOutput,
  SchemaWan25PreviewImageToVideoInput,
  SchemaWan25PreviewImageToVideoOutput,
  SchemaWanAtiInput,
  SchemaWanAtiOutput,
  SchemaWanEffectsInput,
  SchemaWanEffectsOutput,
  SchemaWanFlf2vInput,
  SchemaWanFlf2vOutput,
  SchemaWanI2vInput,
  SchemaWanI2vLoraInput,
  SchemaWanI2vLoraOutput,
  SchemaWanI2vOutput,
  SchemaWanMoveInput,
  SchemaWanMoveOutput,
  SchemaWanProImageToVideoInput,
  SchemaWanProImageToVideoOutput,
  SchemaWanV225bImageToVideoInput,
  SchemaWanV225bImageToVideoOutput,
  SchemaWanV22A14bImageToVideoInput,
  SchemaWanV22A14bImageToVideoLoraInput,
  SchemaWanV22A14bImageToVideoLoraOutput,
  SchemaWanV22A14bImageToVideoOutput,
  SchemaWanV22A14bImageToVideoTurboInput,
  SchemaWanV22A14bImageToVideoTurboOutput,
} from './types.gen'

export type ImageToVideoEndpointMap = {
  'fal-ai/wan-effects': {
    input: SchemaWanEffectsInput
    output: SchemaWanEffectsOutput
  }
  'fal-ai/wan-pro/image-to-video': {
    input: SchemaWanProImageToVideoInput
    output: SchemaWanProImageToVideoOutput
  }
  'fal-ai/veo2/image-to-video': {
    input: SchemaVeo2ImageToVideoInput
    output: SchemaVeo2ImageToVideoOutput
  }
  'fal-ai/kling-video/v1.6/pro/image-to-video': {
    input: SchemaKlingVideoV16ProImageToVideoInput
    output: SchemaKlingVideoV16ProImageToVideoOutput
  }
  'fal-ai/minimax/video-01/image-to-video': {
    input: SchemaMinimaxVideo01ImageToVideoInput
    output: SchemaMinimaxVideo01ImageToVideoOutput
  }
  'fal-ai/minimax/hailuo-2.3/pro/image-to-video': {
    input: SchemaMinimaxHailuo23ProImageToVideoInput
    output: SchemaMinimaxHailuo23ProImageToVideoOutput
  }
  'fal-ai/wan-25-preview/image-to-video': {
    input: SchemaWan25PreviewImageToVideoInput
    output: SchemaWan25PreviewImageToVideoOutput
  }
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': {
    input: SchemaKlingVideoV25TurboProImageToVideoInput
    output: SchemaKlingVideoV25TurboProImageToVideoOutput
  }
  'fal-ai/minimax/hailuo-02/standard/image-to-video': {
    input: SchemaMinimaxHailuo02StandardImageToVideoInput
    output: SchemaMinimaxHailuo02StandardImageToVideoOutput
  }
  'fal-ai/bytedance/seedance/v1/pro/image-to-video': {
    input: SchemaBytedanceSeedanceV1ProImageToVideoInput
    output: SchemaBytedanceSeedanceV1ProImageToVideoOutput
  }
  'fal-ai/kling-video/v2.1/master/image-to-video': {
    input: SchemaKlingVideoV21MasterImageToVideoInput
    output: SchemaKlingVideoV21MasterImageToVideoOutput
  }
  'fal-ai/kling-video/v2.1/standard/image-to-video': {
    input: SchemaKlingVideoV21StandardImageToVideoInput
    output: SchemaKlingVideoV21StandardImageToVideoOutput
  }
  'fal-ai/pixverse/v4.5/image-to-video': {
    input: SchemaPixverseV45ImageToVideoInput
    output: SchemaPixverseV45ImageToVideoOutput
  }
  'fal-ai/kling-video/v2/master/image-to-video': {
    input: SchemaKlingVideoV2MasterImageToVideoInput
    output: SchemaKlingVideoV2MasterImageToVideoOutput
  }
  'fal-ai/wan-i2v': {
    input: SchemaWanI2vInput
    output: SchemaWanI2vOutput
  }
  'fal-ai/pixverse/v5.6/transition': {
    input: SchemaPixverseV56TransitionInput
    output: SchemaPixverseV56TransitionOutput
  }
  'fal-ai/pixverse/v5.6/image-to-video': {
    input: SchemaPixverseV56ImageToVideoInput
    output: SchemaPixverseV56ImageToVideoOutput
  }
  'fal-ai/vidu/q2/reference-to-video/pro': {
    input: SchemaViduQ2ReferenceToVideoProInput
    output: SchemaViduQ2ReferenceToVideoProOutput
  }
  'wan/v2.6/image-to-video/flash': {
    input: SchemaV26ImageToVideoFlashInput
    output: SchemaV26ImageToVideoFlashOutput
  }
  'fal-ai/ltx-2-19b/distilled/image-to-video/lora': {
    input: SchemaLtx219bDistilledImageToVideoLoraInput
    output: SchemaLtx219bDistilledImageToVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/distilled/image-to-video': {
    input: SchemaLtx219bDistilledImageToVideoInput
    output: SchemaLtx219bDistilledImageToVideoOutput
  }
  'fal-ai/ltx-2-19b/image-to-video/lora': {
    input: SchemaLtx219bImageToVideoLoraInput
    output: SchemaLtx219bImageToVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/image-to-video': {
    input: SchemaLtx219bImageToVideoInput
    output: SchemaLtx219bImageToVideoOutput
  }
  'fal-ai/wan-move': {
    input: SchemaWanMoveInput
    output: SchemaWanMoveOutput
  }
  'fal-ai/kandinsky5-pro/image-to-video': {
    input: SchemaKandinsky5ProImageToVideoInput
    output: SchemaKandinsky5ProImageToVideoOutput
  }
  'fal-ai/bytedance/seedance/v1.5/pro/image-to-video': {
    input: SchemaBytedanceSeedanceV15ProImageToVideoInput
    output: SchemaBytedanceSeedanceV15ProImageToVideoOutput
  }
  'fal-ai/live-avatar': {
    input: SchemaLiveAvatarInput
    output: SchemaLiveAvatarOutput
  }
  'fal-ai/hunyuan-video-v1.5/image-to-video': {
    input: SchemaHunyuanVideoV15ImageToVideoInput
    output: SchemaHunyuanVideoV15ImageToVideoOutput
  }
  'wan/v2.6/image-to-video': {
    input: SchemaV26ImageToVideoInput
    output: SchemaV26ImageToVideoOutput
  }
  'fal-ai/kling-video/o1/standard/reference-to-video': {
    input: SchemaKlingVideoO1StandardReferenceToVideoInput
    output: SchemaKlingVideoO1StandardReferenceToVideoOutput
  }
  'fal-ai/kling-video/o1/standard/image-to-video': {
    input: SchemaKlingVideoO1StandardImageToVideoInput
    output: SchemaKlingVideoO1StandardImageToVideoOutput
  }
  'fal-ai/creatify/aurora': {
    input: SchemaCreatifyAuroraInput
    output: SchemaCreatifyAuroraOutput
  }
  'fal-ai/kling-video/ai-avatar/v2/pro': {
    input: SchemaKlingVideoAiAvatarV2ProInput
    output: SchemaKlingVideoAiAvatarV2ProOutput
  }
  'fal-ai/kling-video/ai-avatar/v2/standard': {
    input: SchemaKlingVideoAiAvatarV2StandardInput
    output: SchemaKlingVideoAiAvatarV2StandardOutput
  }
  'fal-ai/kling-video/v2.6/pro/image-to-video': {
    input: SchemaKlingVideoV26ProImageToVideoInput
    output: SchemaKlingVideoV26ProImageToVideoOutput
  }
  'fal-ai/pixverse/v5.5/effects': {
    input: SchemaPixverseV55EffectsInput
    output: SchemaPixverseV55EffectsOutput
  }
  'fal-ai/pixverse/v5.5/transition': {
    input: SchemaPixverseV55TransitionInput
    output: SchemaPixverseV55TransitionOutput
  }
  'fal-ai/pixverse/v5.5/image-to-video': {
    input: SchemaPixverseV55ImageToVideoInput
    output: SchemaPixverseV55ImageToVideoOutput
  }
  'fal-ai/kling-video/o1/image-to-video': {
    input: SchemaKlingVideoO1ImageToVideoInput
    output: SchemaKlingVideoO1ImageToVideoOutput
  }
  'fal-ai/kling-video/o1/reference-to-video': {
    input: SchemaKlingVideoO1ReferenceToVideoInput
    output: SchemaKlingVideoO1ReferenceToVideoOutput
  }
  'fal-ai/ltx-2/image-to-video/fast': {
    input: SchemaLtx2ImageToVideoFastInput
    output: SchemaLtx2ImageToVideoFastOutput
  }
  'fal-ai/ltx-2/image-to-video': {
    input: SchemaLtx2ImageToVideoInput
    output: SchemaLtx2ImageToVideoOutput
  }
  'bytedance/lynx': {
    input: SchemaLynxInput
    output: SchemaLynxOutput
  }
  'fal-ai/pixverse/swap': {
    input: SchemaPixverseSwapInput
    output: SchemaPixverseSwapOutput
  }
  'fal-ai/pika/v2.2/pikaframes': {
    input: SchemaPikaV22PikaframesInput
    output: SchemaPikaV22PikaframesOutput
  }
  'fal-ai/longcat-video/image-to-video/720p': {
    input: SchemaLongcatVideoImageToVideo720pInput
    output: SchemaLongcatVideoImageToVideo720pOutput
  }
  'fal-ai/longcat-video/image-to-video/480p': {
    input: SchemaLongcatVideoImageToVideo480pInput
    output: SchemaLongcatVideoImageToVideo480pOutput
  }
  'fal-ai/longcat-video/distilled/image-to-video/720p': {
    input: SchemaLongcatVideoDistilledImageToVideo720pInput
    output: SchemaLongcatVideoDistilledImageToVideo720pOutput
  }
  'fal-ai/longcat-video/distilled/image-to-video/480p': {
    input: SchemaLongcatVideoDistilledImageToVideo480pInput
    output: SchemaLongcatVideoDistilledImageToVideo480pOutput
  }
  'fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video': {
    input: SchemaMinimaxHailuo23FastStandardImageToVideoInput
    output: SchemaMinimaxHailuo23FastStandardImageToVideoOutput
  }
  'fal-ai/minimax/hailuo-2.3/standard/image-to-video': {
    input: SchemaMinimaxHailuo23StandardImageToVideoInput
    output: SchemaMinimaxHailuo23StandardImageToVideoOutput
  }
  'fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video': {
    input: SchemaMinimaxHailuo23FastProImageToVideoInput
    output: SchemaMinimaxHailuo23FastProImageToVideoOutput
  }
  'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video': {
    input: SchemaBytedanceSeedanceV1ProFastImageToVideoInput
    output: SchemaBytedanceSeedanceV1ProFastImageToVideoOutput
  }
  'fal-ai/vidu/q2/image-to-video/turbo': {
    input: SchemaViduQ2ImageToVideoTurboInput
    output: SchemaViduQ2ImageToVideoTurboOutput
  }
  'fal-ai/vidu/q2/image-to-video/pro': {
    input: SchemaViduQ2ImageToVideoProInput
    output: SchemaViduQ2ImageToVideoProOutput
  }
  'fal-ai/kling-video/v2.5-turbo/standard/image-to-video': {
    input: SchemaKlingVideoV25TurboStandardImageToVideoInput
    output: SchemaKlingVideoV25TurboStandardImageToVideoOutput
  }
  'fal-ai/veo3.1/fast/first-last-frame-to-video': {
    input: SchemaVeo31FastFirstLastFrameToVideoInput
    output: SchemaVeo31FastFirstLastFrameToVideoOutput
  }
  'fal-ai/veo3.1/first-last-frame-to-video': {
    input: SchemaVeo31FirstLastFrameToVideoInput
    output: SchemaVeo31FirstLastFrameToVideoOutput
  }
  'fal-ai/veo3.1/reference-to-video': {
    input: SchemaVeo31ReferenceToVideoInput
    output: SchemaVeo31ReferenceToVideoOutput
  }
  'fal-ai/veo3.1/fast/image-to-video': {
    input: SchemaVeo31FastImageToVideoInput
    output: SchemaVeo31FastImageToVideoOutput
  }
  'fal-ai/veo3.1/image-to-video': {
    input: SchemaVeo31ImageToVideoInput
    output: SchemaVeo31ImageToVideoOutput
  }
  'fal-ai/sora-2/image-to-video/pro': {
    input: SchemaSora2ImageToVideoProInput
    output: SchemaSora2ImageToVideoProOutput
  }
  'fal-ai/sora-2/image-to-video': {
    input: SchemaSora2ImageToVideoInput
    output: SchemaSora2ImageToVideoOutput
  }
  'fal-ai/ovi/image-to-video': {
    input: SchemaOviImageToVideoInput
    output: SchemaOviImageToVideoOutput
  }
  'veed/fabric-1.0/fast': {
    input: SchemaFabric10FastInput
    output: SchemaFabric10FastOutput
  }
  'fal-ai/bytedance/omnihuman/v1.5': {
    input: SchemaBytedanceOmnihumanV15Input
    output: SchemaBytedanceOmnihumanV15Output
  }
  'veed/fabric-1.0': {
    input: SchemaFabric10Input
    output: SchemaFabric10Output
  }
  'fal-ai/kling-video/v1/standard/ai-avatar': {
    input: SchemaKlingVideoV1StandardAiAvatarInput
    output: SchemaKlingVideoV1StandardAiAvatarOutput
  }
  'fal-ai/kling-video/v1/pro/ai-avatar': {
    input: SchemaKlingVideoV1ProAiAvatarInput
    output: SchemaKlingVideoV1ProAiAvatarOutput
  }
  'decart/lucy-14b/image-to-video': {
    input: SchemaLucy14bImageToVideoInput
    output: SchemaLucy14bImageToVideoOutput
  }
  'fal-ai/bytedance/seedance/v1/lite/reference-to-video': {
    input: SchemaBytedanceSeedanceV1LiteReferenceToVideoInput
    output: SchemaBytedanceSeedanceV1LiteReferenceToVideoOutput
  }
  'fal-ai/wan-ati': {
    input: SchemaWanAtiInput
    output: SchemaWanAtiOutput
  }
  'fal-ai/decart/lucy-5b/image-to-video': {
    input: SchemaDecartLucy5bImageToVideoInput
    output: SchemaDecartLucy5bImageToVideoOutput
  }
  'fal-ai/pixverse/v5/transition': {
    input: SchemaPixverseV5TransitionInput
    output: SchemaPixverseV5TransitionOutput
  }
  'fal-ai/pixverse/v5/effects': {
    input: SchemaPixverseV5EffectsInput
    output: SchemaPixverseV5EffectsOutput
  }
  'fal-ai/pixverse/v5/image-to-video': {
    input: SchemaPixverseV5ImageToVideoInput
    output: SchemaPixverseV5ImageToVideoOutput
  }
  'moonvalley/marey/i2v': {
    input: SchemaMareyI2vInput
    output: SchemaMareyI2vOutput
  }
  'fal-ai/bytedance/video-stylize': {
    input: SchemaBytedanceVideoStylizeInput
    output: SchemaBytedanceVideoStylizeOutput
  }
  'fal-ai/wan/v2.2-a14b/image-to-video/lora': {
    input: SchemaWanV22A14bImageToVideoLoraInput
    output: SchemaWanV22A14bImageToVideoLoraOutput
  }
  'fal-ai/minimax/hailuo-02-fast/image-to-video': {
    input: SchemaMinimaxHailuo02FastImageToVideoInput
    output: SchemaMinimaxHailuo02FastImageToVideoOutput
  }
  'fal-ai/veo3/image-to-video': {
    input: SchemaVeo3ImageToVideoInput
    output: SchemaVeo3ImageToVideoOutput
  }
  'fal-ai/wan/v2.2-a14b/image-to-video/turbo': {
    input: SchemaWanV22A14bImageToVideoTurboInput
    output: SchemaWanV22A14bImageToVideoTurboOutput
  }
  'fal-ai/wan/v2.2-5b/image-to-video': {
    input: SchemaWanV225bImageToVideoInput
    output: SchemaWanV225bImageToVideoOutput
  }
  'fal-ai/wan/v2.2-a14b/image-to-video': {
    input: SchemaWanV22A14bImageToVideoInput
    output: SchemaWanV22A14bImageToVideoOutput
  }
  'fal-ai/bytedance/omnihuman': {
    input: SchemaBytedanceOmnihumanInput
    output: SchemaBytedanceOmnihumanOutput
  }
  'fal-ai/ltxv-13b-098-distilled/image-to-video': {
    input: SchemaLtxv13B098DistilledImageToVideoInput
    output: SchemaLtxv13B098DistilledImageToVideoOutput
  }
  'fal-ai/veo3/fast/image-to-video': {
    input: SchemaVeo3FastImageToVideoInput
    output: SchemaVeo3FastImageToVideoOutput
  }
  'fal-ai/vidu/q1/reference-to-video': {
    input: SchemaViduQ1ReferenceToVideoInput
    output: SchemaViduQ1ReferenceToVideoOutput
  }
  'fal-ai/ai-avatar/single-text': {
    input: SchemaAiAvatarSingleTextInput
    output: SchemaAiAvatarSingleTextOutput
  }
  'fal-ai/ai-avatar': {
    input: SchemaAiAvatarInput
    output: SchemaAiAvatarOutput
  }
  'fal-ai/ai-avatar/multi-text': {
    input: SchemaAiAvatarMultiTextInput
    output: SchemaAiAvatarMultiTextOutput
  }
  'fal-ai/ai-avatar/multi': {
    input: SchemaAiAvatarMultiInput
    output: SchemaAiAvatarMultiOutput
  }
  'fal-ai/minimax/hailuo-02/pro/image-to-video': {
    input: SchemaMinimaxHailuo02ProImageToVideoInput
    output: SchemaMinimaxHailuo02ProImageToVideoOutput
  }
  'fal-ai/bytedance/seedance/v1/lite/image-to-video': {
    input: SchemaBytedanceSeedanceV1LiteImageToVideoInput
    output: SchemaBytedanceSeedanceV1LiteImageToVideoOutput
  }
  'fal-ai/hunyuan-avatar': {
    input: SchemaHunyuanAvatarInput
    output: SchemaHunyuanAvatarOutput
  }
  'fal-ai/kling-video/v2.1/pro/image-to-video': {
    input: SchemaKlingVideoV21ProImageToVideoInput
    output: SchemaKlingVideoV21ProImageToVideoOutput
  }
  'fal-ai/hunyuan-portrait': {
    input: SchemaHunyuanPortraitInput
    output: SchemaHunyuanPortraitOutput
  }
  'fal-ai/kling-video/v1.6/standard/elements': {
    input: SchemaKlingVideoV16StandardElementsInput
    output: SchemaKlingVideoV16StandardElementsOutput
  }
  'fal-ai/kling-video/v1.6/pro/elements': {
    input: SchemaKlingVideoV16ProElementsInput
    output: SchemaKlingVideoV16ProElementsOutput
  }
  'fal-ai/ltx-video-13b-distilled/image-to-video': {
    input: SchemaLtxVideo13bDistilledImageToVideoInput
    output: SchemaLtxVideo13bDistilledImageToVideoOutput
  }
  'fal-ai/ltx-video-13b-dev/image-to-video': {
    input: SchemaLtxVideo13bDevImageToVideoInput
    output: SchemaLtxVideo13bDevImageToVideoOutput
  }
  'fal-ai/ltx-video-lora/image-to-video': {
    input: SchemaLtxVideoLoraImageToVideoInput
    output: SchemaLtxVideoLoraImageToVideoOutput
  }
  'fal-ai/pixverse/v4.5/transition': {
    input: SchemaPixverseV45TransitionInput
    output: SchemaPixverseV45TransitionOutput
  }
  'fal-ai/pixverse/v4.5/image-to-video/fast': {
    input: SchemaPixverseV45ImageToVideoFastInput
    output: SchemaPixverseV45ImageToVideoFastOutput
  }
  'fal-ai/pixverse/v4.5/effects': {
    input: SchemaPixverseV45EffectsInput
    output: SchemaPixverseV45EffectsOutput
  }
  'fal-ai/hunyuan-custom': {
    input: SchemaHunyuanCustomInput
    output: SchemaHunyuanCustomOutput
  }
  'fal-ai/framepack/f1': {
    input: SchemaFramepackF1Input
    output: SchemaFramepackF1Output
  }
  'fal-ai/vidu/q1/start-end-to-video': {
    input: SchemaViduQ1StartEndToVideoInput
    output: SchemaViduQ1StartEndToVideoOutput
  }
  'fal-ai/vidu/q1/image-to-video': {
    input: SchemaViduQ1ImageToVideoInput
    output: SchemaViduQ1ImageToVideoOutput
  }
  'fal-ai/magi/image-to-video': {
    input: SchemaMagiImageToVideoInput
    output: SchemaMagiImageToVideoOutput
  }
  'fal-ai/pixverse/v4/effects': {
    input: SchemaPixverseV4EffectsInput
    output: SchemaPixverseV4EffectsOutput
  }
  'fal-ai/magi-distilled/image-to-video': {
    input: SchemaMagiDistilledImageToVideoInput
    output: SchemaMagiDistilledImageToVideoOutput
  }
  'fal-ai/framepack/flf2v': {
    input: SchemaFramepackFlf2vInput
    output: SchemaFramepackFlf2vOutput
  }
  'fal-ai/wan-flf2v': {
    input: SchemaWanFlf2vInput
    output: SchemaWanFlf2vOutput
  }
  'fal-ai/framepack': {
    input: SchemaFramepackInput
    output: SchemaFramepackOutput
  }
  'fal-ai/pixverse/v4/image-to-video/fast': {
    input: SchemaPixverseV4ImageToVideoFastInput
    output: SchemaPixverseV4ImageToVideoFastOutput
  }
  'fal-ai/pixverse/v4/image-to-video': {
    input: SchemaPixverseV4ImageToVideoInput
    output: SchemaPixverseV4ImageToVideoOutput
  }
  'fal-ai/pixverse/v3.5/effects': {
    input: SchemaPixverseV35EffectsInput
    output: SchemaPixverseV35EffectsOutput
  }
  'fal-ai/pixverse/v3.5/transition': {
    input: SchemaPixverseV35TransitionInput
    output: SchemaPixverseV35TransitionOutput
  }
  'fal-ai/luma-dream-machine/ray-2-flash/image-to-video': {
    input: SchemaLumaDreamMachineRay2FlashImageToVideoInput
    output: SchemaLumaDreamMachineRay2FlashImageToVideoOutput
  }
  'fal-ai/pika/v1.5/pikaffects': {
    input: SchemaPikaV15PikaffectsInput
    output: SchemaPikaV15PikaffectsOutput
  }
  'fal-ai/pika/v2/turbo/image-to-video': {
    input: SchemaPikaV2TurboImageToVideoInput
    output: SchemaPikaV2TurboImageToVideoOutput
  }
  'fal-ai/pika/v2.2/pikascenes': {
    input: SchemaPikaV22PikascenesInput
    output: SchemaPikaV22PikascenesOutput
  }
  'fal-ai/pika/v2.2/image-to-video': {
    input: SchemaPikaV22ImageToVideoInput
    output: SchemaPikaV22ImageToVideoOutput
  }
  'fal-ai/pika/v2.1/image-to-video': {
    input: SchemaPikaV21ImageToVideoInput
    output: SchemaPikaV21ImageToVideoOutput
  }
  'fal-ai/vidu/image-to-video': {
    input: SchemaViduImageToVideoInput
    output: SchemaViduImageToVideoOutput
  }
  'fal-ai/vidu/start-end-to-video': {
    input: SchemaViduStartEndToVideoInput
    output: SchemaViduStartEndToVideoOutput
  }
  'fal-ai/vidu/reference-to-video': {
    input: SchemaViduReferenceToVideoInput
    output: SchemaViduReferenceToVideoOutput
  }
  'fal-ai/vidu/template-to-video': {
    input: SchemaViduTemplateToVideoInput
    output: SchemaViduTemplateToVideoOutput
  }
  'fal-ai/wan-i2v-lora': {
    input: SchemaWanI2vLoraInput
    output: SchemaWanI2vLoraOutput
  }
  'fal-ai/hunyuan-video-image-to-video': {
    input: SchemaHunyuanVideoImageToVideoInput
    output: SchemaHunyuanVideoImageToVideoOutput
  }
  'fal-ai/minimax/video-01-director/image-to-video': {
    input: SchemaMinimaxVideo01DirectorImageToVideoInput
    output: SchemaMinimaxVideo01DirectorImageToVideoOutput
  }
  'fal-ai/skyreels-i2v': {
    input: SchemaSkyreelsI2vInput
    output: SchemaSkyreelsI2vOutput
  }
  'fal-ai/luma-dream-machine/ray-2/image-to-video': {
    input: SchemaLumaDreamMachineRay2ImageToVideoInput
    output: SchemaLumaDreamMachineRay2ImageToVideoOutput
  }
  'fal-ai/hunyuan-video-img2vid-lora': {
    input: SchemaHunyuanVideoImg2VidLoraInput
    output: SchemaHunyuanVideoImg2VidLoraOutput
  }
  'fal-ai/pixverse/v3.5/image-to-video/fast': {
    input: SchemaPixverseV35ImageToVideoFastInput
    output: SchemaPixverseV35ImageToVideoFastOutput
  }
  'fal-ai/pixverse/v3.5/image-to-video': {
    input: SchemaPixverseV35ImageToVideoInput
    output: SchemaPixverseV35ImageToVideoOutput
  }
  'fal-ai/minimax/video-01-subject-reference': {
    input: SchemaMinimaxVideo01SubjectReferenceInput
    output: SchemaMinimaxVideo01SubjectReferenceOutput
  }
  'fal-ai/kling-video/v1.6/standard/image-to-video': {
    input: SchemaKlingVideoV16StandardImageToVideoInput
    output: SchemaKlingVideoV16StandardImageToVideoOutput
  }
  'fal-ai/sadtalker/reference': {
    input: SchemaSadtalkerReferenceInput
    output: SchemaSadtalkerReferenceOutput
  }
  'fal-ai/minimax/video-01-live/image-to-video': {
    input: SchemaMinimaxVideo01LiveImageToVideoInput
    output: SchemaMinimaxVideo01LiveImageToVideoOutput
  }
  'fal-ai/ltx-video/image-to-video': {
    input: SchemaLtxVideoImageToVideoInput
    output: SchemaLtxVideoImageToVideoOutput
  }
  'fal-ai/cogvideox-5b/image-to-video': {
    input: SchemaCogvideox5bImageToVideoInput
    output: SchemaCogvideox5bImageToVideoOutput
  }
  'fal-ai/kling-video/v1.5/pro/image-to-video': {
    input: SchemaKlingVideoV15ProImageToVideoInput
    output: SchemaKlingVideoV15ProImageToVideoOutput
  }
  'fal-ai/kling-video/v1/standard/image-to-video': {
    input: SchemaKlingVideoV1StandardImageToVideoInput
    output: SchemaKlingVideoV1StandardImageToVideoOutput
  }
  'fal-ai/stable-video': {
    input: SchemaStableVideoInput
    output: SchemaStableVideoOutput
  }
  'fal-ai/amt-interpolation/frame-interpolation': {
    input: SchemaAmtInterpolationFrameInterpolationInput
    output: SchemaAmtInterpolationFrameInterpolationOutput
  }
  'fal-ai/live-portrait': {
    input: SchemaLivePortraitInput
    output: SchemaLivePortraitOutput
  }
  'fal-ai/musetalk': {
    input: SchemaMusetalkInput
    output: SchemaMusetalkOutput
  }
  'fal-ai/sadtalker': {
    input: SchemaSadtalkerInput
    output: SchemaSadtalkerOutput
  }
  'fal-ai/fast-svd-lcm': {
    input: SchemaFastSvdLcmInput
    output: SchemaFastSvdLcmOutput
  }
}

export const ImageToVideoSchemaMap = {
  ['fal-ai/wan-effects']: {
    input: zSchemaWanEffectsInput,
    output: zSchemaWanEffectsOutput,
  },
  ['fal-ai/wan-pro/image-to-video']: {
    input: zSchemaWanProImageToVideoInput,
    output: zSchemaWanProImageToVideoOutput,
  },
  ['fal-ai/veo2/image-to-video']: {
    input: zSchemaVeo2ImageToVideoInput,
    output: zSchemaVeo2ImageToVideoOutput,
  },
  ['fal-ai/kling-video/v1.6/pro/image-to-video']: {
    input: zSchemaKlingVideoV16ProImageToVideoInput,
    output: zSchemaKlingVideoV16ProImageToVideoOutput,
  },
  ['fal-ai/minimax/video-01/image-to-video']: {
    input: zSchemaMinimaxVideo01ImageToVideoInput,
    output: zSchemaMinimaxVideo01ImageToVideoOutput,
  },
  ['fal-ai/minimax/hailuo-2.3/pro/image-to-video']: {
    input: zSchemaMinimaxHailuo23ProImageToVideoInput,
    output: zSchemaMinimaxHailuo23ProImageToVideoOutput,
  },
  ['fal-ai/wan-25-preview/image-to-video']: {
    input: zSchemaWan25PreviewImageToVideoInput,
    output: zSchemaWan25PreviewImageToVideoOutput,
  },
  ['fal-ai/kling-video/v2.5-turbo/pro/image-to-video']: {
    input: zSchemaKlingVideoV25TurboProImageToVideoInput,
    output: zSchemaKlingVideoV25TurboProImageToVideoOutput,
  },
  ['fal-ai/minimax/hailuo-02/standard/image-to-video']: {
    input: zSchemaMinimaxHailuo02StandardImageToVideoInput,
    output: zSchemaMinimaxHailuo02StandardImageToVideoOutput,
  },
  ['fal-ai/bytedance/seedance/v1/pro/image-to-video']: {
    input: zSchemaBytedanceSeedanceV1ProImageToVideoInput,
    output: zSchemaBytedanceSeedanceV1ProImageToVideoOutput,
  },
  ['fal-ai/kling-video/v2.1/master/image-to-video']: {
    input: zSchemaKlingVideoV21MasterImageToVideoInput,
    output: zSchemaKlingVideoV21MasterImageToVideoOutput,
  },
  ['fal-ai/kling-video/v2.1/standard/image-to-video']: {
    input: zSchemaKlingVideoV21StandardImageToVideoInput,
    output: zSchemaKlingVideoV21StandardImageToVideoOutput,
  },
  ['fal-ai/pixverse/v4.5/image-to-video']: {
    input: zSchemaPixverseV45ImageToVideoInput,
    output: zSchemaPixverseV45ImageToVideoOutput,
  },
  ['fal-ai/kling-video/v2/master/image-to-video']: {
    input: zSchemaKlingVideoV2MasterImageToVideoInput,
    output: zSchemaKlingVideoV2MasterImageToVideoOutput,
  },
  ['fal-ai/wan-i2v']: {
    input: zSchemaWanI2vInput,
    output: zSchemaWanI2vOutput,
  },
  ['fal-ai/pixverse/v5.6/transition']: {
    input: zSchemaPixverseV56TransitionInput,
    output: zSchemaPixverseV56TransitionOutput,
  },
  ['fal-ai/pixverse/v5.6/image-to-video']: {
    input: zSchemaPixverseV56ImageToVideoInput,
    output: zSchemaPixverseV56ImageToVideoOutput,
  },
  ['fal-ai/vidu/q2/reference-to-video/pro']: {
    input: zSchemaViduQ2ReferenceToVideoProInput,
    output: zSchemaViduQ2ReferenceToVideoProOutput,
  },
  ['wan/v2.6/image-to-video/flash']: {
    input: zSchemaV26ImageToVideoFlashInput,
    output: zSchemaV26ImageToVideoFlashOutput,
  },
  ['fal-ai/ltx-2-19b/distilled/image-to-video/lora']: {
    input: zSchemaLtx219bDistilledImageToVideoLoraInput,
    output: zSchemaLtx219bDistilledImageToVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/distilled/image-to-video']: {
    input: zSchemaLtx219bDistilledImageToVideoInput,
    output: zSchemaLtx219bDistilledImageToVideoOutput,
  },
  ['fal-ai/ltx-2-19b/image-to-video/lora']: {
    input: zSchemaLtx219bImageToVideoLoraInput,
    output: zSchemaLtx219bImageToVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/image-to-video']: {
    input: zSchemaLtx219bImageToVideoInput,
    output: zSchemaLtx219bImageToVideoOutput,
  },
  ['fal-ai/wan-move']: {
    input: zSchemaWanMoveInput,
    output: zSchemaWanMoveOutput,
  },
  ['fal-ai/kandinsky5-pro/image-to-video']: {
    input: zSchemaKandinsky5ProImageToVideoInput,
    output: zSchemaKandinsky5ProImageToVideoOutput,
  },
  ['fal-ai/bytedance/seedance/v1.5/pro/image-to-video']: {
    input: zSchemaBytedanceSeedanceV15ProImageToVideoInput,
    output: zSchemaBytedanceSeedanceV15ProImageToVideoOutput,
  },
  ['fal-ai/live-avatar']: {
    input: zSchemaLiveAvatarInput,
    output: zSchemaLiveAvatarOutput,
  },
  ['fal-ai/hunyuan-video-v1.5/image-to-video']: {
    input: zSchemaHunyuanVideoV15ImageToVideoInput,
    output: zSchemaHunyuanVideoV15ImageToVideoOutput,
  },
  ['wan/v2.6/image-to-video']: {
    input: zSchemaV26ImageToVideoInput,
    output: zSchemaV26ImageToVideoOutput,
  },
  ['fal-ai/kling-video/o1/standard/reference-to-video']: {
    input: zSchemaKlingVideoO1StandardReferenceToVideoInput,
    output: zSchemaKlingVideoO1StandardReferenceToVideoOutput,
  },
  ['fal-ai/kling-video/o1/standard/image-to-video']: {
    input: zSchemaKlingVideoO1StandardImageToVideoInput,
    output: zSchemaKlingVideoO1StandardImageToVideoOutput,
  },
  ['fal-ai/creatify/aurora']: {
    input: zSchemaCreatifyAuroraInput,
    output: zSchemaCreatifyAuroraOutput,
  },
  ['fal-ai/kling-video/ai-avatar/v2/pro']: {
    input: zSchemaKlingVideoAiAvatarV2ProInput,
    output: zSchemaKlingVideoAiAvatarV2ProOutput,
  },
  ['fal-ai/kling-video/ai-avatar/v2/standard']: {
    input: zSchemaKlingVideoAiAvatarV2StandardInput,
    output: zSchemaKlingVideoAiAvatarV2StandardOutput,
  },
  ['fal-ai/kling-video/v2.6/pro/image-to-video']: {
    input: zSchemaKlingVideoV26ProImageToVideoInput,
    output: zSchemaKlingVideoV26ProImageToVideoOutput,
  },
  ['fal-ai/pixverse/v5.5/effects']: {
    input: zSchemaPixverseV55EffectsInput,
    output: zSchemaPixverseV55EffectsOutput,
  },
  ['fal-ai/pixverse/v5.5/transition']: {
    input: zSchemaPixverseV55TransitionInput,
    output: zSchemaPixverseV55TransitionOutput,
  },
  ['fal-ai/pixverse/v5.5/image-to-video']: {
    input: zSchemaPixverseV55ImageToVideoInput,
    output: zSchemaPixverseV55ImageToVideoOutput,
  },
  ['fal-ai/kling-video/o1/image-to-video']: {
    input: zSchemaKlingVideoO1ImageToVideoInput,
    output: zSchemaKlingVideoO1ImageToVideoOutput,
  },
  ['fal-ai/kling-video/o1/reference-to-video']: {
    input: zSchemaKlingVideoO1ReferenceToVideoInput,
    output: zSchemaKlingVideoO1ReferenceToVideoOutput,
  },
  ['fal-ai/ltx-2/image-to-video/fast']: {
    input: zSchemaLtx2ImageToVideoFastInput,
    output: zSchemaLtx2ImageToVideoFastOutput,
  },
  ['fal-ai/ltx-2/image-to-video']: {
    input: zSchemaLtx2ImageToVideoInput,
    output: zSchemaLtx2ImageToVideoOutput,
  },
  ['bytedance/lynx']: {
    input: zSchemaLynxInput,
    output: zSchemaLynxOutput,
  },
  ['fal-ai/pixverse/swap']: {
    input: zSchemaPixverseSwapInput,
    output: zSchemaPixverseSwapOutput,
  },
  ['fal-ai/pika/v2.2/pikaframes']: {
    input: zSchemaPikaV22PikaframesInput,
    output: zSchemaPikaV22PikaframesOutput,
  },
  ['fal-ai/longcat-video/image-to-video/720p']: {
    input: zSchemaLongcatVideoImageToVideo720pInput,
    output: zSchemaLongcatVideoImageToVideo720pOutput,
  },
  ['fal-ai/longcat-video/image-to-video/480p']: {
    input: zSchemaLongcatVideoImageToVideo480pInput,
    output: zSchemaLongcatVideoImageToVideo480pOutput,
  },
  ['fal-ai/longcat-video/distilled/image-to-video/720p']: {
    input: zSchemaLongcatVideoDistilledImageToVideo720pInput,
    output: zSchemaLongcatVideoDistilledImageToVideo720pOutput,
  },
  ['fal-ai/longcat-video/distilled/image-to-video/480p']: {
    input: zSchemaLongcatVideoDistilledImageToVideo480pInput,
    output: zSchemaLongcatVideoDistilledImageToVideo480pOutput,
  },
  ['fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video']: {
    input: zSchemaMinimaxHailuo23FastStandardImageToVideoInput,
    output: zSchemaMinimaxHailuo23FastStandardImageToVideoOutput,
  },
  ['fal-ai/minimax/hailuo-2.3/standard/image-to-video']: {
    input: zSchemaMinimaxHailuo23StandardImageToVideoInput,
    output: zSchemaMinimaxHailuo23StandardImageToVideoOutput,
  },
  ['fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video']: {
    input: zSchemaMinimaxHailuo23FastProImageToVideoInput,
    output: zSchemaMinimaxHailuo23FastProImageToVideoOutput,
  },
  ['fal-ai/bytedance/seedance/v1/pro/fast/image-to-video']: {
    input: zSchemaBytedanceSeedanceV1ProFastImageToVideoInput,
    output: zSchemaBytedanceSeedanceV1ProFastImageToVideoOutput,
  },
  ['fal-ai/vidu/q2/image-to-video/turbo']: {
    input: zSchemaViduQ2ImageToVideoTurboInput,
    output: zSchemaViduQ2ImageToVideoTurboOutput,
  },
  ['fal-ai/vidu/q2/image-to-video/pro']: {
    input: zSchemaViduQ2ImageToVideoProInput,
    output: zSchemaViduQ2ImageToVideoProOutput,
  },
  ['fal-ai/kling-video/v2.5-turbo/standard/image-to-video']: {
    input: zSchemaKlingVideoV25TurboStandardImageToVideoInput,
    output: zSchemaKlingVideoV25TurboStandardImageToVideoOutput,
  },
  ['fal-ai/veo3.1/fast/first-last-frame-to-video']: {
    input: zSchemaVeo31FastFirstLastFrameToVideoInput,
    output: zSchemaVeo31FastFirstLastFrameToVideoOutput,
  },
  ['fal-ai/veo3.1/first-last-frame-to-video']: {
    input: zSchemaVeo31FirstLastFrameToVideoInput,
    output: zSchemaVeo31FirstLastFrameToVideoOutput,
  },
  ['fal-ai/veo3.1/reference-to-video']: {
    input: zSchemaVeo31ReferenceToVideoInput,
    output: zSchemaVeo31ReferenceToVideoOutput,
  },
  ['fal-ai/veo3.1/fast/image-to-video']: {
    input: zSchemaVeo31FastImageToVideoInput,
    output: zSchemaVeo31FastImageToVideoOutput,
  },
  ['fal-ai/veo3.1/image-to-video']: {
    input: zSchemaVeo31ImageToVideoInput,
    output: zSchemaVeo31ImageToVideoOutput,
  },
  ['fal-ai/sora-2/image-to-video/pro']: {
    input: zSchemaSora2ImageToVideoProInput,
    output: zSchemaSora2ImageToVideoProOutput,
  },
  ['fal-ai/sora-2/image-to-video']: {
    input: zSchemaSora2ImageToVideoInput,
    output: zSchemaSora2ImageToVideoOutput,
  },
  ['fal-ai/ovi/image-to-video']: {
    input: zSchemaOviImageToVideoInput,
    output: zSchemaOviImageToVideoOutput,
  },
  ['veed/fabric-1.0/fast']: {
    input: zSchemaFabric10FastInput,
    output: zSchemaFabric10FastOutput,
  },
  ['fal-ai/bytedance/omnihuman/v1.5']: {
    input: zSchemaBytedanceOmnihumanV15Input,
    output: zSchemaBytedanceOmnihumanV15Output,
  },
  ['veed/fabric-1.0']: {
    input: zSchemaFabric10Input,
    output: zSchemaFabric10Output,
  },
  ['fal-ai/kling-video/v1/standard/ai-avatar']: {
    input: zSchemaKlingVideoV1StandardAiAvatarInput,
    output: zSchemaKlingVideoV1StandardAiAvatarOutput,
  },
  ['fal-ai/kling-video/v1/pro/ai-avatar']: {
    input: zSchemaKlingVideoV1ProAiAvatarInput,
    output: zSchemaKlingVideoV1ProAiAvatarOutput,
  },
  ['decart/lucy-14b/image-to-video']: {
    input: zSchemaLucy14bImageToVideoInput,
    output: zSchemaLucy14bImageToVideoOutput,
  },
  ['fal-ai/bytedance/seedance/v1/lite/reference-to-video']: {
    input: zSchemaBytedanceSeedanceV1LiteReferenceToVideoInput,
    output: zSchemaBytedanceSeedanceV1LiteReferenceToVideoOutput,
  },
  ['fal-ai/wan-ati']: {
    input: zSchemaWanAtiInput,
    output: zSchemaWanAtiOutput,
  },
  ['fal-ai/decart/lucy-5b/image-to-video']: {
    input: zSchemaDecartLucy5bImageToVideoInput,
    output: zSchemaDecartLucy5bImageToVideoOutput,
  },
  ['fal-ai/pixverse/v5/transition']: {
    input: zSchemaPixverseV5TransitionInput,
    output: zSchemaPixverseV5TransitionOutput,
  },
  ['fal-ai/pixverse/v5/effects']: {
    input: zSchemaPixverseV5EffectsInput,
    output: zSchemaPixverseV5EffectsOutput,
  },
  ['fal-ai/pixverse/v5/image-to-video']: {
    input: zSchemaPixverseV5ImageToVideoInput,
    output: zSchemaPixverseV5ImageToVideoOutput,
  },
  ['moonvalley/marey/i2v']: {
    input: zSchemaMareyI2vInput,
    output: zSchemaMareyI2vOutput,
  },
  ['fal-ai/bytedance/video-stylize']: {
    input: zSchemaBytedanceVideoStylizeInput,
    output: zSchemaBytedanceVideoStylizeOutput,
  },
  ['fal-ai/wan/v2.2-a14b/image-to-video/lora']: {
    input: zSchemaWanV22A14bImageToVideoLoraInput,
    output: zSchemaWanV22A14bImageToVideoLoraOutput,
  },
  ['fal-ai/minimax/hailuo-02-fast/image-to-video']: {
    input: zSchemaMinimaxHailuo02FastImageToVideoInput,
    output: zSchemaMinimaxHailuo02FastImageToVideoOutput,
  },
  ['fal-ai/veo3/image-to-video']: {
    input: zSchemaVeo3ImageToVideoInput,
    output: zSchemaVeo3ImageToVideoOutput,
  },
  ['fal-ai/wan/v2.2-a14b/image-to-video/turbo']: {
    input: zSchemaWanV22A14bImageToVideoTurboInput,
    output: zSchemaWanV22A14bImageToVideoTurboOutput,
  },
  ['fal-ai/wan/v2.2-5b/image-to-video']: {
    input: zSchemaWanV225bImageToVideoInput,
    output: zSchemaWanV225bImageToVideoOutput,
  },
  ['fal-ai/wan/v2.2-a14b/image-to-video']: {
    input: zSchemaWanV22A14bImageToVideoInput,
    output: zSchemaWanV22A14bImageToVideoOutput,
  },
  ['fal-ai/bytedance/omnihuman']: {
    input: zSchemaBytedanceOmnihumanInput,
    output: zSchemaBytedanceOmnihumanOutput,
  },
  ['fal-ai/ltxv-13b-098-distilled/image-to-video']: {
    input: zSchemaLtxv13B098DistilledImageToVideoInput,
    output: zSchemaLtxv13B098DistilledImageToVideoOutput,
  },
  ['fal-ai/veo3/fast/image-to-video']: {
    input: zSchemaVeo3FastImageToVideoInput,
    output: zSchemaVeo3FastImageToVideoOutput,
  },
  ['fal-ai/vidu/q1/reference-to-video']: {
    input: zSchemaViduQ1ReferenceToVideoInput,
    output: zSchemaViduQ1ReferenceToVideoOutput,
  },
  ['fal-ai/ai-avatar/single-text']: {
    input: zSchemaAiAvatarSingleTextInput,
    output: zSchemaAiAvatarSingleTextOutput,
  },
  ['fal-ai/ai-avatar']: {
    input: zSchemaAiAvatarInput,
    output: zSchemaAiAvatarOutput,
  },
  ['fal-ai/ai-avatar/multi-text']: {
    input: zSchemaAiAvatarMultiTextInput,
    output: zSchemaAiAvatarMultiTextOutput,
  },
  ['fal-ai/ai-avatar/multi']: {
    input: zSchemaAiAvatarMultiInput,
    output: zSchemaAiAvatarMultiOutput,
  },
  ['fal-ai/minimax/hailuo-02/pro/image-to-video']: {
    input: zSchemaMinimaxHailuo02ProImageToVideoInput,
    output: zSchemaMinimaxHailuo02ProImageToVideoOutput,
  },
  ['fal-ai/bytedance/seedance/v1/lite/image-to-video']: {
    input: zSchemaBytedanceSeedanceV1LiteImageToVideoInput,
    output: zSchemaBytedanceSeedanceV1LiteImageToVideoOutput,
  },
  ['fal-ai/hunyuan-avatar']: {
    input: zSchemaHunyuanAvatarInput,
    output: zSchemaHunyuanAvatarOutput,
  },
  ['fal-ai/kling-video/v2.1/pro/image-to-video']: {
    input: zSchemaKlingVideoV21ProImageToVideoInput,
    output: zSchemaKlingVideoV21ProImageToVideoOutput,
  },
  ['fal-ai/hunyuan-portrait']: {
    input: zSchemaHunyuanPortraitInput,
    output: zSchemaHunyuanPortraitOutput,
  },
  ['fal-ai/kling-video/v1.6/standard/elements']: {
    input: zSchemaKlingVideoV16StandardElementsInput,
    output: zSchemaKlingVideoV16StandardElementsOutput,
  },
  ['fal-ai/kling-video/v1.6/pro/elements']: {
    input: zSchemaKlingVideoV16ProElementsInput,
    output: zSchemaKlingVideoV16ProElementsOutput,
  },
  ['fal-ai/ltx-video-13b-distilled/image-to-video']: {
    input: zSchemaLtxVideo13bDistilledImageToVideoInput,
    output: zSchemaLtxVideo13bDistilledImageToVideoOutput,
  },
  ['fal-ai/ltx-video-13b-dev/image-to-video']: {
    input: zSchemaLtxVideo13bDevImageToVideoInput,
    output: zSchemaLtxVideo13bDevImageToVideoOutput,
  },
  ['fal-ai/ltx-video-lora/image-to-video']: {
    input: zSchemaLtxVideoLoraImageToVideoInput,
    output: zSchemaLtxVideoLoraImageToVideoOutput,
  },
  ['fal-ai/pixverse/v4.5/transition']: {
    input: zSchemaPixverseV45TransitionInput,
    output: zSchemaPixverseV45TransitionOutput,
  },
  ['fal-ai/pixverse/v4.5/image-to-video/fast']: {
    input: zSchemaPixverseV45ImageToVideoFastInput,
    output: zSchemaPixverseV45ImageToVideoFastOutput,
  },
  ['fal-ai/pixverse/v4.5/effects']: {
    input: zSchemaPixverseV45EffectsInput,
    output: zSchemaPixverseV45EffectsOutput,
  },
  ['fal-ai/hunyuan-custom']: {
    input: zSchemaHunyuanCustomInput,
    output: zSchemaHunyuanCustomOutput,
  },
  ['fal-ai/framepack/f1']: {
    input: zSchemaFramepackF1Input,
    output: zSchemaFramepackF1Output,
  },
  ['fal-ai/vidu/q1/start-end-to-video']: {
    input: zSchemaViduQ1StartEndToVideoInput,
    output: zSchemaViduQ1StartEndToVideoOutput,
  },
  ['fal-ai/vidu/q1/image-to-video']: {
    input: zSchemaViduQ1ImageToVideoInput,
    output: zSchemaViduQ1ImageToVideoOutput,
  },
  ['fal-ai/magi/image-to-video']: {
    input: zSchemaMagiImageToVideoInput,
    output: zSchemaMagiImageToVideoOutput,
  },
  ['fal-ai/pixverse/v4/effects']: {
    input: zSchemaPixverseV4EffectsInput,
    output: zSchemaPixverseV4EffectsOutput,
  },
  ['fal-ai/magi-distilled/image-to-video']: {
    input: zSchemaMagiDistilledImageToVideoInput,
    output: zSchemaMagiDistilledImageToVideoOutput,
  },
  ['fal-ai/framepack/flf2v']: {
    input: zSchemaFramepackFlf2vInput,
    output: zSchemaFramepackFlf2vOutput,
  },
  ['fal-ai/wan-flf2v']: {
    input: zSchemaWanFlf2vInput,
    output: zSchemaWanFlf2vOutput,
  },
  ['fal-ai/framepack']: {
    input: zSchemaFramepackInput,
    output: zSchemaFramepackOutput,
  },
  ['fal-ai/pixverse/v4/image-to-video/fast']: {
    input: zSchemaPixverseV4ImageToVideoFastInput,
    output: zSchemaPixverseV4ImageToVideoFastOutput,
  },
  ['fal-ai/pixverse/v4/image-to-video']: {
    input: zSchemaPixverseV4ImageToVideoInput,
    output: zSchemaPixverseV4ImageToVideoOutput,
  },
  ['fal-ai/pixverse/v3.5/effects']: {
    input: zSchemaPixverseV35EffectsInput,
    output: zSchemaPixverseV35EffectsOutput,
  },
  ['fal-ai/pixverse/v3.5/transition']: {
    input: zSchemaPixverseV35TransitionInput,
    output: zSchemaPixverseV35TransitionOutput,
  },
  ['fal-ai/luma-dream-machine/ray-2-flash/image-to-video']: {
    input: zSchemaLumaDreamMachineRay2FlashImageToVideoInput,
    output: zSchemaLumaDreamMachineRay2FlashImageToVideoOutput,
  },
  ['fal-ai/pika/v1.5/pikaffects']: {
    input: zSchemaPikaV15PikaffectsInput,
    output: zSchemaPikaV15PikaffectsOutput,
  },
  ['fal-ai/pika/v2/turbo/image-to-video']: {
    input: zSchemaPikaV2TurboImageToVideoInput,
    output: zSchemaPikaV2TurboImageToVideoOutput,
  },
  ['fal-ai/pika/v2.2/pikascenes']: {
    input: zSchemaPikaV22PikascenesInput,
    output: zSchemaPikaV22PikascenesOutput,
  },
  ['fal-ai/pika/v2.2/image-to-video']: {
    input: zSchemaPikaV22ImageToVideoInput,
    output: zSchemaPikaV22ImageToVideoOutput,
  },
  ['fal-ai/pika/v2.1/image-to-video']: {
    input: zSchemaPikaV21ImageToVideoInput,
    output: zSchemaPikaV21ImageToVideoOutput,
  },
  ['fal-ai/vidu/image-to-video']: {
    input: zSchemaViduImageToVideoInput,
    output: zSchemaViduImageToVideoOutput,
  },
  ['fal-ai/vidu/start-end-to-video']: {
    input: zSchemaViduStartEndToVideoInput,
    output: zSchemaViduStartEndToVideoOutput,
  },
  ['fal-ai/vidu/reference-to-video']: {
    input: zSchemaViduReferenceToVideoInput,
    output: zSchemaViduReferenceToVideoOutput,
  },
  ['fal-ai/vidu/template-to-video']: {
    input: zSchemaViduTemplateToVideoInput,
    output: zSchemaViduTemplateToVideoOutput,
  },
  ['fal-ai/wan-i2v-lora']: {
    input: zSchemaWanI2vLoraInput,
    output: zSchemaWanI2vLoraOutput,
  },
  ['fal-ai/hunyuan-video-image-to-video']: {
    input: zSchemaHunyuanVideoImageToVideoInput,
    output: zSchemaHunyuanVideoImageToVideoOutput,
  },
  ['fal-ai/minimax/video-01-director/image-to-video']: {
    input: zSchemaMinimaxVideo01DirectorImageToVideoInput,
    output: zSchemaMinimaxVideo01DirectorImageToVideoOutput,
  },
  ['fal-ai/skyreels-i2v']: {
    input: zSchemaSkyreelsI2vInput,
    output: zSchemaSkyreelsI2vOutput,
  },
  ['fal-ai/luma-dream-machine/ray-2/image-to-video']: {
    input: zSchemaLumaDreamMachineRay2ImageToVideoInput,
    output: zSchemaLumaDreamMachineRay2ImageToVideoOutput,
  },
  ['fal-ai/hunyuan-video-img2vid-lora']: {
    input: zSchemaHunyuanVideoImg2VidLoraInput,
    output: zSchemaHunyuanVideoImg2VidLoraOutput,
  },
  ['fal-ai/pixverse/v3.5/image-to-video/fast']: {
    input: zSchemaPixverseV35ImageToVideoFastInput,
    output: zSchemaPixverseV35ImageToVideoFastOutput,
  },
  ['fal-ai/pixverse/v3.5/image-to-video']: {
    input: zSchemaPixverseV35ImageToVideoInput,
    output: zSchemaPixverseV35ImageToVideoOutput,
  },
  ['fal-ai/minimax/video-01-subject-reference']: {
    input: zSchemaMinimaxVideo01SubjectReferenceInput,
    output: zSchemaMinimaxVideo01SubjectReferenceOutput,
  },
  ['fal-ai/kling-video/v1.6/standard/image-to-video']: {
    input: zSchemaKlingVideoV16StandardImageToVideoInput,
    output: zSchemaKlingVideoV16StandardImageToVideoOutput,
  },
  ['fal-ai/sadtalker/reference']: {
    input: zSchemaSadtalkerReferenceInput,
    output: zSchemaSadtalkerReferenceOutput,
  },
  ['fal-ai/minimax/video-01-live/image-to-video']: {
    input: zSchemaMinimaxVideo01LiveImageToVideoInput,
    output: zSchemaMinimaxVideo01LiveImageToVideoOutput,
  },
  ['fal-ai/ltx-video/image-to-video']: {
    input: zSchemaLtxVideoImageToVideoInput,
    output: zSchemaLtxVideoImageToVideoOutput,
  },
  ['fal-ai/cogvideox-5b/image-to-video']: {
    input: zSchemaCogvideox5bImageToVideoInput,
    output: zSchemaCogvideox5bImageToVideoOutput,
  },
  ['fal-ai/kling-video/v1.5/pro/image-to-video']: {
    input: zSchemaKlingVideoV15ProImageToVideoInput,
    output: zSchemaKlingVideoV15ProImageToVideoOutput,
  },
  ['fal-ai/kling-video/v1/standard/image-to-video']: {
    input: zSchemaKlingVideoV1StandardImageToVideoInput,
    output: zSchemaKlingVideoV1StandardImageToVideoOutput,
  },
  ['fal-ai/stable-video']: {
    input: zSchemaStableVideoInput,
    output: zSchemaStableVideoOutput,
  },
  ['fal-ai/amt-interpolation/frame-interpolation']: {
    input: zSchemaAmtInterpolationFrameInterpolationInput,
    output: zSchemaAmtInterpolationFrameInterpolationOutput,
  },
  ['fal-ai/live-portrait']: {
    input: zSchemaLivePortraitInput,
    output: zSchemaLivePortraitOutput,
  },
  ['fal-ai/musetalk']: {
    input: zSchemaMusetalkInput,
    output: zSchemaMusetalkOutput,
  },
  ['fal-ai/sadtalker']: {
    input: zSchemaSadtalkerInput,
    output: zSchemaSadtalkerOutput,
  },
  ['fal-ai/fast-svd-lcm']: {
    input: zSchemaFastSvdLcmInput,
    output: zSchemaFastSvdLcmOutput,
  },
} as const

/** Union type of all image-to-video model endpoint IDs */
export type ImageToVideoModel = keyof ImageToVideoEndpointMap

/** Get the input type for a specific image-to-video model */
export type ImageToVideoModelInput<T extends ImageToVideoModel> = ImageToVideoEndpointMap[T]['input']

/** Get the output type for a specific image-to-video model */
export type ImageToVideoModelOutput<T extends ImageToVideoModel> = ImageToVideoEndpointMap[T]['output']
