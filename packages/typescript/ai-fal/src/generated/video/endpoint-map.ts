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
  zSchemaAiFaceSwapFaceswapvideoInput,
  zSchemaAiFaceSwapFaceswapvideoOutput,
  zSchemaAmtInterpolationFrameInterpolationInput,
  zSchemaAmtInterpolationFrameInterpolationOutput,
  zSchemaAmtInterpolationInput,
  zSchemaAmtInterpolationOutput,
  zSchemaAnimatediffSparsectrlLcmInput,
  zSchemaAnimatediffSparsectrlLcmOutput,
  zSchemaAutoCaptionInput,
  zSchemaAutoCaptionOutput,
  zSchemaAvatarsAudioToVideoInput,
  zSchemaAvatarsAudioToVideoOutput,
  zSchemaAvatarsTextToVideoInput,
  zSchemaAvatarsTextToVideoOutput,
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
  zSchemaBytedanceOmnihumanInput,
  zSchemaBytedanceOmnihumanOutput,
  zSchemaBytedanceOmnihumanV15Input,
  zSchemaBytedanceOmnihumanV15Output,
  zSchemaBytedanceSeedanceV15ProImageToVideoInput,
  zSchemaBytedanceSeedanceV15ProImageToVideoOutput,
  zSchemaBytedanceSeedanceV15ProTextToVideoInput,
  zSchemaBytedanceSeedanceV15ProTextToVideoOutput,
  zSchemaBytedanceSeedanceV1LiteImageToVideoInput,
  zSchemaBytedanceSeedanceV1LiteImageToVideoOutput,
  zSchemaBytedanceSeedanceV1LiteReferenceToVideoInput,
  zSchemaBytedanceSeedanceV1LiteReferenceToVideoOutput,
  zSchemaBytedanceSeedanceV1LiteTextToVideoInput,
  zSchemaBytedanceSeedanceV1LiteTextToVideoOutput,
  zSchemaBytedanceSeedanceV1ProFastImageToVideoInput,
  zSchemaBytedanceSeedanceV1ProFastImageToVideoOutput,
  zSchemaBytedanceSeedanceV1ProFastTextToVideoInput,
  zSchemaBytedanceSeedanceV1ProFastTextToVideoOutput,
  zSchemaBytedanceSeedanceV1ProImageToVideoInput,
  zSchemaBytedanceSeedanceV1ProImageToVideoOutput,
  zSchemaBytedanceSeedanceV1ProTextToVideoInput,
  zSchemaBytedanceSeedanceV1ProTextToVideoOutput,
  zSchemaBytedanceUpscalerUpscaleVideoInput,
  zSchemaBytedanceUpscalerUpscaleVideoOutput,
  zSchemaBytedanceVideoStylizeInput,
  zSchemaBytedanceVideoStylizeOutput,
  zSchemaCogvideox5bImageToVideoInput,
  zSchemaCogvideox5bImageToVideoOutput,
  zSchemaCogvideox5bInput,
  zSchemaCogvideox5bOutput,
  zSchemaCogvideox5bVideoToVideoInput,
  zSchemaCogvideox5bVideoToVideoOutput,
  zSchemaControlnextInput,
  zSchemaControlnextOutput,
  zSchemaCreatifyAuroraInput,
  zSchemaCreatifyAuroraOutput,
  zSchemaCrystalVideoUpscalerInput,
  zSchemaCrystalVideoUpscalerOutput,
  zSchemaDecartLucy5bImageToVideoInput,
  zSchemaDecartLucy5bImageToVideoOutput,
  zSchemaDubbingInput,
  zSchemaDubbingOutput,
  zSchemaDwposeVideoInput,
  zSchemaDwposeVideoOutput,
  zSchemaEchomimicV3Input,
  zSchemaEchomimicV3Output,
  zSchemaEdittoInput,
  zSchemaEdittoOutput,
  zSchemaElevenlabsDubbingInput,
  zSchemaElevenlabsDubbingOutput,
  zSchemaFabric10FastInput,
  zSchemaFabric10FastOutput,
  zSchemaFabric10Input,
  zSchemaFabric10Output,
  zSchemaFabric10TextInput,
  zSchemaFabric10TextOutput,
  zSchemaFastAnimatediffTextToVideoInput,
  zSchemaFastAnimatediffTextToVideoOutput,
  zSchemaFastAnimatediffTurboTextToVideoInput,
  zSchemaFastAnimatediffTurboTextToVideoOutput,
  zSchemaFastAnimatediffTurboVideoToVideoInput,
  zSchemaFastAnimatediffTurboVideoToVideoOutput,
  zSchemaFastAnimatediffVideoToVideoInput,
  zSchemaFastAnimatediffVideoToVideoOutput,
  zSchemaFastSvdLcmInput,
  zSchemaFastSvdLcmOutput,
  zSchemaFastSvdLcmTextToVideoInput,
  zSchemaFastSvdLcmTextToVideoOutput,
  zSchemaFastSvdTextToVideoInput,
  zSchemaFastSvdTextToVideoOutput,
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
  zSchemaHunyuanVideoFoleyInput,
  zSchemaHunyuanVideoFoleyOutput,
  zSchemaHunyuanVideoImageToVideoInput,
  zSchemaHunyuanVideoImageToVideoOutput,
  zSchemaHunyuanVideoImg2VidLoraInput,
  zSchemaHunyuanVideoImg2VidLoraOutput,
  zSchemaHunyuanVideoInput,
  zSchemaHunyuanVideoLoraInput,
  zSchemaHunyuanVideoLoraOutput,
  zSchemaHunyuanVideoLoraVideoToVideoInput,
  zSchemaHunyuanVideoLoraVideoToVideoOutput,
  zSchemaHunyuanVideoOutput,
  zSchemaHunyuanVideoV15ImageToVideoInput,
  zSchemaHunyuanVideoV15ImageToVideoOutput,
  zSchemaHunyuanVideoV15TextToVideoInput,
  zSchemaHunyuanVideoV15TextToVideoOutput,
  zSchemaHunyuanVideoVideoToVideoInput,
  zSchemaHunyuanVideoVideoToVideoOutput,
  zSchemaInfinitalkInput,
  zSchemaInfinitalkOutput,
  zSchemaInfinitalkSingleTextInput,
  zSchemaInfinitalkSingleTextOutput,
  zSchemaInfinitalkVideoToVideoInput,
  zSchemaInfinitalkVideoToVideoOutput,
  zSchemaInfinityStarTextToVideoInput,
  zSchemaInfinityStarTextToVideoOutput,
  zSchemaKandinsky5ProImageToVideoInput,
  zSchemaKandinsky5ProImageToVideoOutput,
  zSchemaKandinsky5ProTextToVideoInput,
  zSchemaKandinsky5ProTextToVideoOutput,
  zSchemaKandinsky5TextToVideoDistillInput,
  zSchemaKandinsky5TextToVideoDistillOutput,
  zSchemaKandinsky5TextToVideoInput,
  zSchemaKandinsky5TextToVideoOutput,
  zSchemaKlingVideoAiAvatarV2ProInput,
  zSchemaKlingVideoAiAvatarV2ProOutput,
  zSchemaKlingVideoAiAvatarV2StandardInput,
  zSchemaKlingVideoAiAvatarV2StandardOutput,
  zSchemaKlingVideoLipsyncAudioToVideoInput,
  zSchemaKlingVideoLipsyncAudioToVideoOutput,
  zSchemaKlingVideoLipsyncTextToVideoInput,
  zSchemaKlingVideoLipsyncTextToVideoOutput,
  zSchemaKlingVideoO1ImageToVideoInput,
  zSchemaKlingVideoO1ImageToVideoOutput,
  zSchemaKlingVideoO1ReferenceToVideoInput,
  zSchemaKlingVideoO1ReferenceToVideoOutput,
  zSchemaKlingVideoO1StandardImageToVideoInput,
  zSchemaKlingVideoO1StandardImageToVideoOutput,
  zSchemaKlingVideoO1StandardReferenceToVideoInput,
  zSchemaKlingVideoO1StandardReferenceToVideoOutput,
  zSchemaKlingVideoO1StandardVideoToVideoEditInput,
  zSchemaKlingVideoO1StandardVideoToVideoEditOutput,
  zSchemaKlingVideoO1StandardVideoToVideoReferenceInput,
  zSchemaKlingVideoO1StandardVideoToVideoReferenceOutput,
  zSchemaKlingVideoO1VideoToVideoEditInput,
  zSchemaKlingVideoO1VideoToVideoEditOutput,
  zSchemaKlingVideoO1VideoToVideoReferenceInput,
  zSchemaKlingVideoO1VideoToVideoReferenceOutput,
  zSchemaKlingVideoV15ProEffectsInput,
  zSchemaKlingVideoV15ProEffectsOutput,
  zSchemaKlingVideoV15ProImageToVideoInput,
  zSchemaKlingVideoV15ProImageToVideoOutput,
  zSchemaKlingVideoV15ProTextToVideoInput,
  zSchemaKlingVideoV15ProTextToVideoOutput,
  zSchemaKlingVideoV16ProEffectsInput,
  zSchemaKlingVideoV16ProEffectsOutput,
  zSchemaKlingVideoV16ProElementsInput,
  zSchemaKlingVideoV16ProElementsOutput,
  zSchemaKlingVideoV16ProImageToVideoInput,
  zSchemaKlingVideoV16ProImageToVideoOutput,
  zSchemaKlingVideoV16ProTextToVideoInput,
  zSchemaKlingVideoV16ProTextToVideoOutput,
  zSchemaKlingVideoV16StandardEffectsInput,
  zSchemaKlingVideoV16StandardEffectsOutput,
  zSchemaKlingVideoV16StandardElementsInput,
  zSchemaKlingVideoV16StandardElementsOutput,
  zSchemaKlingVideoV16StandardImageToVideoInput,
  zSchemaKlingVideoV16StandardImageToVideoOutput,
  zSchemaKlingVideoV16StandardTextToVideoInput,
  zSchemaKlingVideoV16StandardTextToVideoOutput,
  zSchemaKlingVideoV1ProAiAvatarInput,
  zSchemaKlingVideoV1ProAiAvatarOutput,
  zSchemaKlingVideoV1StandardAiAvatarInput,
  zSchemaKlingVideoV1StandardAiAvatarOutput,
  zSchemaKlingVideoV1StandardEffectsInput,
  zSchemaKlingVideoV1StandardEffectsOutput,
  zSchemaKlingVideoV1StandardImageToVideoInput,
  zSchemaKlingVideoV1StandardImageToVideoOutput,
  zSchemaKlingVideoV1StandardTextToVideoInput,
  zSchemaKlingVideoV1StandardTextToVideoOutput,
  zSchemaKlingVideoV21MasterImageToVideoInput,
  zSchemaKlingVideoV21MasterImageToVideoOutput,
  zSchemaKlingVideoV21MasterTextToVideoInput,
  zSchemaKlingVideoV21MasterTextToVideoOutput,
  zSchemaKlingVideoV21ProImageToVideoInput,
  zSchemaKlingVideoV21ProImageToVideoOutput,
  zSchemaKlingVideoV21StandardImageToVideoInput,
  zSchemaKlingVideoV21StandardImageToVideoOutput,
  zSchemaKlingVideoV25TurboProImageToVideoInput,
  zSchemaKlingVideoV25TurboProImageToVideoOutput,
  zSchemaKlingVideoV25TurboProTextToVideoInput,
  zSchemaKlingVideoV25TurboProTextToVideoOutput,
  zSchemaKlingVideoV25TurboStandardImageToVideoInput,
  zSchemaKlingVideoV25TurboStandardImageToVideoOutput,
  zSchemaKlingVideoV26ProImageToVideoInput,
  zSchemaKlingVideoV26ProImageToVideoOutput,
  zSchemaKlingVideoV26ProMotionControlInput,
  zSchemaKlingVideoV26ProMotionControlOutput,
  zSchemaKlingVideoV26ProTextToVideoInput,
  zSchemaKlingVideoV26ProTextToVideoOutput,
  zSchemaKlingVideoV26StandardMotionControlInput,
  zSchemaKlingVideoV26StandardMotionControlOutput,
  zSchemaKlingVideoV2MasterImageToVideoInput,
  zSchemaKlingVideoV2MasterImageToVideoOutput,
  zSchemaKlingVideoV2MasterTextToVideoInput,
  zSchemaKlingVideoV2MasterTextToVideoOutput,
  zSchemaKreaWan14bTextToVideoInput,
  zSchemaKreaWan14bTextToVideoOutput,
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
  zSchemaLiveAvatarInput,
  zSchemaLiveAvatarOutput,
  zSchemaLivePortraitInput,
  zSchemaLivePortraitOutput,
  zSchemaLongcatMultiAvatarImageAudioToVideoInput,
  zSchemaLongcatMultiAvatarImageAudioToVideoOutput,
  zSchemaLongcatSingleAvatarAudioToVideoInput,
  zSchemaLongcatSingleAvatarAudioToVideoOutput,
  zSchemaLongcatSingleAvatarImageAudioToVideoInput,
  zSchemaLongcatSingleAvatarImageAudioToVideoOutput,
  zSchemaLongcatVideoDistilledImageToVideo480pInput,
  zSchemaLongcatVideoDistilledImageToVideo480pOutput,
  zSchemaLongcatVideoDistilledImageToVideo720pInput,
  zSchemaLongcatVideoDistilledImageToVideo720pOutput,
  zSchemaLongcatVideoDistilledTextToVideo480pInput,
  zSchemaLongcatVideoDistilledTextToVideo480pOutput,
  zSchemaLongcatVideoDistilledTextToVideo720pInput,
  zSchemaLongcatVideoDistilledTextToVideo720pOutput,
  zSchemaLongcatVideoImageToVideo480pInput,
  zSchemaLongcatVideoImageToVideo480pOutput,
  zSchemaLongcatVideoImageToVideo720pInput,
  zSchemaLongcatVideoImageToVideo720pOutput,
  zSchemaLongcatVideoTextToVideo480pInput,
  zSchemaLongcatVideoTextToVideo480pOutput,
  zSchemaLongcatVideoTextToVideo720pInput,
  zSchemaLongcatVideoTextToVideo720pOutput,
  zSchemaLtx219bAudioToVideoInput,
  zSchemaLtx219bAudioToVideoLoraInput,
  zSchemaLtx219bAudioToVideoLoraOutput,
  zSchemaLtx219bAudioToVideoOutput,
  zSchemaLtx219bDistilledAudioToVideoInput,
  zSchemaLtx219bDistilledAudioToVideoLoraInput,
  zSchemaLtx219bDistilledAudioToVideoLoraOutput,
  zSchemaLtx219bDistilledAudioToVideoOutput,
  zSchemaLtx219bDistilledExtendVideoInput,
  zSchemaLtx219bDistilledExtendVideoLoraInput,
  zSchemaLtx219bDistilledExtendVideoLoraOutput,
  zSchemaLtx219bDistilledExtendVideoOutput,
  zSchemaLtx219bDistilledImageToVideoInput,
  zSchemaLtx219bDistilledImageToVideoLoraInput,
  zSchemaLtx219bDistilledImageToVideoLoraOutput,
  zSchemaLtx219bDistilledImageToVideoOutput,
  zSchemaLtx219bDistilledTextToVideoInput,
  zSchemaLtx219bDistilledTextToVideoLoraInput,
  zSchemaLtx219bDistilledTextToVideoLoraOutput,
  zSchemaLtx219bDistilledTextToVideoOutput,
  zSchemaLtx219bDistilledVideoToVideoInput,
  zSchemaLtx219bDistilledVideoToVideoLoraInput,
  zSchemaLtx219bDistilledVideoToVideoLoraOutput,
  zSchemaLtx219bDistilledVideoToVideoOutput,
  zSchemaLtx219bExtendVideoInput,
  zSchemaLtx219bExtendVideoLoraInput,
  zSchemaLtx219bExtendVideoLoraOutput,
  zSchemaLtx219bExtendVideoOutput,
  zSchemaLtx219bImageToVideoInput,
  zSchemaLtx219bImageToVideoLoraInput,
  zSchemaLtx219bImageToVideoLoraOutput,
  zSchemaLtx219bImageToVideoOutput,
  zSchemaLtx219bTextToVideoInput,
  zSchemaLtx219bTextToVideoLoraInput,
  zSchemaLtx219bTextToVideoLoraOutput,
  zSchemaLtx219bTextToVideoOutput,
  zSchemaLtx219bVideoToVideoInput,
  zSchemaLtx219bVideoToVideoLoraInput,
  zSchemaLtx219bVideoToVideoLoraOutput,
  zSchemaLtx219bVideoToVideoOutput,
  zSchemaLtx2ImageToVideoFastInput,
  zSchemaLtx2ImageToVideoFastOutput,
  zSchemaLtx2ImageToVideoInput,
  zSchemaLtx2ImageToVideoOutput,
  zSchemaLtx2RetakeVideoInput,
  zSchemaLtx2RetakeVideoOutput,
  zSchemaLtx2TextToVideoFastInput,
  zSchemaLtx2TextToVideoFastOutput,
  zSchemaLtx2TextToVideoInput,
  zSchemaLtx2TextToVideoOutput,
  zSchemaLtxVideo13bDevExtendInput,
  zSchemaLtxVideo13bDevExtendOutput,
  zSchemaLtxVideo13bDevImageToVideoInput,
  zSchemaLtxVideo13bDevImageToVideoOutput,
  zSchemaLtxVideo13bDevInput,
  zSchemaLtxVideo13bDevMulticonditioningInput,
  zSchemaLtxVideo13bDevMulticonditioningOutput,
  zSchemaLtxVideo13bDevOutput,
  zSchemaLtxVideo13bDistilledExtendInput,
  zSchemaLtxVideo13bDistilledExtendOutput,
  zSchemaLtxVideo13bDistilledImageToVideoInput,
  zSchemaLtxVideo13bDistilledImageToVideoOutput,
  zSchemaLtxVideo13bDistilledInput,
  zSchemaLtxVideo13bDistilledMulticonditioningInput,
  zSchemaLtxVideo13bDistilledMulticonditioningOutput,
  zSchemaLtxVideo13bDistilledOutput,
  zSchemaLtxVideoImageToVideoInput,
  zSchemaLtxVideoImageToVideoOutput,
  zSchemaLtxVideoInput,
  zSchemaLtxVideoLoraImageToVideoInput,
  zSchemaLtxVideoLoraImageToVideoOutput,
  zSchemaLtxVideoLoraMulticonditioningInput,
  zSchemaLtxVideoLoraMulticonditioningOutput,
  zSchemaLtxVideoOutput,
  zSchemaLtxVideoV095ExtendInput,
  zSchemaLtxVideoV095ExtendOutput,
  zSchemaLtxVideoV095Input,
  zSchemaLtxVideoV095MulticonditioningInput,
  zSchemaLtxVideoV095MulticonditioningOutput,
  zSchemaLtxVideoV095Output,
  zSchemaLtxv13B098DistilledExtendInput,
  zSchemaLtxv13B098DistilledExtendOutput,
  zSchemaLtxv13B098DistilledImageToVideoInput,
  zSchemaLtxv13B098DistilledImageToVideoOutput,
  zSchemaLtxv13B098DistilledInput,
  zSchemaLtxv13B098DistilledMulticonditioningInput,
  zSchemaLtxv13B098DistilledMulticonditioningOutput,
  zSchemaLtxv13B098DistilledOutput,
  zSchemaLucy14bImageToVideoInput,
  zSchemaLucy14bImageToVideoOutput,
  zSchemaLucyEditDevInput,
  zSchemaLucyEditDevOutput,
  zSchemaLucyEditFastInput,
  zSchemaLucyEditFastOutput,
  zSchemaLucyEditProInput,
  zSchemaLucyEditProOutput,
  zSchemaLucyRestyleInput,
  zSchemaLucyRestyleOutput,
  zSchemaLumaDreamMachineRay2FlashImageToVideoInput,
  zSchemaLumaDreamMachineRay2FlashImageToVideoOutput,
  zSchemaLumaDreamMachineRay2FlashInput,
  zSchemaLumaDreamMachineRay2FlashModifyInput,
  zSchemaLumaDreamMachineRay2FlashModifyOutput,
  zSchemaLumaDreamMachineRay2FlashOutput,
  zSchemaLumaDreamMachineRay2FlashReframeInput,
  zSchemaLumaDreamMachineRay2FlashReframeOutput,
  zSchemaLumaDreamMachineRay2ImageToVideoInput,
  zSchemaLumaDreamMachineRay2ImageToVideoOutput,
  zSchemaLumaDreamMachineRay2Input,
  zSchemaLumaDreamMachineRay2ModifyInput,
  zSchemaLumaDreamMachineRay2ModifyOutput,
  zSchemaLumaDreamMachineRay2Output,
  zSchemaLumaDreamMachineRay2ReframeInput,
  zSchemaLumaDreamMachineRay2ReframeOutput,
  zSchemaLynxInput,
  zSchemaLynxOutput,
  zSchemaMagiDistilledExtendVideoInput,
  zSchemaMagiDistilledExtendVideoOutput,
  zSchemaMagiDistilledImageToVideoInput,
  zSchemaMagiDistilledImageToVideoOutput,
  zSchemaMagiDistilledInput,
  zSchemaMagiDistilledOutput,
  zSchemaMagiExtendVideoInput,
  zSchemaMagiExtendVideoOutput,
  zSchemaMagiImageToVideoInput,
  zSchemaMagiImageToVideoOutput,
  zSchemaMagiInput,
  zSchemaMagiOutput,
  zSchemaMareyI2vInput,
  zSchemaMareyI2vOutput,
  zSchemaMareyMotionTransferInput,
  zSchemaMareyMotionTransferOutput,
  zSchemaMareyPoseTransferInput,
  zSchemaMareyPoseTransferOutput,
  zSchemaMareyT2vInput,
  zSchemaMareyT2vOutput,
  zSchemaMinimaxHailuo02FastImageToVideoInput,
  zSchemaMinimaxHailuo02FastImageToVideoOutput,
  zSchemaMinimaxHailuo02ProImageToVideoInput,
  zSchemaMinimaxHailuo02ProImageToVideoOutput,
  zSchemaMinimaxHailuo02ProTextToVideoInput,
  zSchemaMinimaxHailuo02ProTextToVideoOutput,
  zSchemaMinimaxHailuo02StandardImageToVideoInput,
  zSchemaMinimaxHailuo02StandardImageToVideoOutput,
  zSchemaMinimaxHailuo02StandardTextToVideoInput,
  zSchemaMinimaxHailuo02StandardTextToVideoOutput,
  zSchemaMinimaxHailuo23FastProImageToVideoInput,
  zSchemaMinimaxHailuo23FastProImageToVideoOutput,
  zSchemaMinimaxHailuo23FastStandardImageToVideoInput,
  zSchemaMinimaxHailuo23FastStandardImageToVideoOutput,
  zSchemaMinimaxHailuo23ProImageToVideoInput,
  zSchemaMinimaxHailuo23ProImageToVideoOutput,
  zSchemaMinimaxHailuo23ProTextToVideoInput,
  zSchemaMinimaxHailuo23ProTextToVideoOutput,
  zSchemaMinimaxHailuo23StandardImageToVideoInput,
  zSchemaMinimaxHailuo23StandardImageToVideoOutput,
  zSchemaMinimaxHailuo23StandardTextToVideoInput,
  zSchemaMinimaxHailuo23StandardTextToVideoOutput,
  zSchemaMinimaxVideo01DirectorImageToVideoInput,
  zSchemaMinimaxVideo01DirectorImageToVideoOutput,
  zSchemaMinimaxVideo01DirectorInput,
  zSchemaMinimaxVideo01DirectorOutput,
  zSchemaMinimaxVideo01ImageToVideoInput,
  zSchemaMinimaxVideo01ImageToVideoOutput,
  zSchemaMinimaxVideo01Input,
  zSchemaMinimaxVideo01LiveImageToVideoInput,
  zSchemaMinimaxVideo01LiveImageToVideoOutput,
  zSchemaMinimaxVideo01LiveInput,
  zSchemaMinimaxVideo01LiveOutput,
  zSchemaMinimaxVideo01Output,
  zSchemaMinimaxVideo01SubjectReferenceInput,
  zSchemaMinimaxVideo01SubjectReferenceOutput,
  zSchemaMmaudioV2Input,
  zSchemaMmaudioV2Output,
  zSchemaMochiV1Input,
  zSchemaMochiV1Output,
  zSchemaMusetalkInput,
  zSchemaMusetalkOutput,
  zSchemaOneToAllAnimation13bInput,
  zSchemaOneToAllAnimation13bOutput,
  zSchemaOneToAllAnimation14bInput,
  zSchemaOneToAllAnimation14bOutput,
  zSchemaOviImageToVideoInput,
  zSchemaOviImageToVideoOutput,
  zSchemaOviInput,
  zSchemaOviOutput,
  zSchemaPikaV15PikaffectsInput,
  zSchemaPikaV15PikaffectsOutput,
  zSchemaPikaV21ImageToVideoInput,
  zSchemaPikaV21ImageToVideoOutput,
  zSchemaPikaV21TextToVideoInput,
  zSchemaPikaV21TextToVideoOutput,
  zSchemaPikaV22ImageToVideoInput,
  zSchemaPikaV22ImageToVideoOutput,
  zSchemaPikaV22PikaframesInput,
  zSchemaPikaV22PikaframesOutput,
  zSchemaPikaV22PikascenesInput,
  zSchemaPikaV22PikascenesOutput,
  zSchemaPikaV22TextToVideoInput,
  zSchemaPikaV22TextToVideoOutput,
  zSchemaPikaV2PikadditionsInput,
  zSchemaPikaV2PikadditionsOutput,
  zSchemaPikaV2TurboImageToVideoInput,
  zSchemaPikaV2TurboImageToVideoOutput,
  zSchemaPikaV2TurboTextToVideoInput,
  zSchemaPikaV2TurboTextToVideoOutput,
  zSchemaPixverseExtendFastInput,
  zSchemaPixverseExtendFastOutput,
  zSchemaPixverseExtendInput,
  zSchemaPixverseExtendOutput,
  zSchemaPixverseLipsyncInput,
  zSchemaPixverseLipsyncOutput,
  zSchemaPixverseSoundEffectsInput,
  zSchemaPixverseSoundEffectsOutput,
  zSchemaPixverseSwapInput,
  zSchemaPixverseSwapOutput,
  zSchemaPixverseV35EffectsInput,
  zSchemaPixverseV35EffectsOutput,
  zSchemaPixverseV35ImageToVideoFastInput,
  zSchemaPixverseV35ImageToVideoFastOutput,
  zSchemaPixverseV35ImageToVideoInput,
  zSchemaPixverseV35ImageToVideoOutput,
  zSchemaPixverseV35TextToVideoFastInput,
  zSchemaPixverseV35TextToVideoFastOutput,
  zSchemaPixverseV35TextToVideoInput,
  zSchemaPixverseV35TextToVideoOutput,
  zSchemaPixverseV35TransitionInput,
  zSchemaPixverseV35TransitionOutput,
  zSchemaPixverseV45EffectsInput,
  zSchemaPixverseV45EffectsOutput,
  zSchemaPixverseV45ImageToVideoFastInput,
  zSchemaPixverseV45ImageToVideoFastOutput,
  zSchemaPixverseV45ImageToVideoInput,
  zSchemaPixverseV45ImageToVideoOutput,
  zSchemaPixverseV45TextToVideoFastInput,
  zSchemaPixverseV45TextToVideoFastOutput,
  zSchemaPixverseV45TextToVideoInput,
  zSchemaPixverseV45TextToVideoOutput,
  zSchemaPixverseV45TransitionInput,
  zSchemaPixverseV45TransitionOutput,
  zSchemaPixverseV4EffectsInput,
  zSchemaPixverseV4EffectsOutput,
  zSchemaPixverseV4ImageToVideoFastInput,
  zSchemaPixverseV4ImageToVideoFastOutput,
  zSchemaPixverseV4ImageToVideoInput,
  zSchemaPixverseV4ImageToVideoOutput,
  zSchemaPixverseV4TextToVideoFastInput,
  zSchemaPixverseV4TextToVideoFastOutput,
  zSchemaPixverseV4TextToVideoInput,
  zSchemaPixverseV4TextToVideoOutput,
  zSchemaPixverseV55EffectsInput,
  zSchemaPixverseV55EffectsOutput,
  zSchemaPixverseV55ImageToVideoInput,
  zSchemaPixverseV55ImageToVideoOutput,
  zSchemaPixverseV55TextToVideoInput,
  zSchemaPixverseV55TextToVideoOutput,
  zSchemaPixverseV55TransitionInput,
  zSchemaPixverseV55TransitionOutput,
  zSchemaPixverseV56ImageToVideoInput,
  zSchemaPixverseV56ImageToVideoOutput,
  zSchemaPixverseV56TextToVideoInput,
  zSchemaPixverseV56TextToVideoOutput,
  zSchemaPixverseV56TransitionInput,
  zSchemaPixverseV56TransitionOutput,
  zSchemaPixverseV5EffectsInput,
  zSchemaPixverseV5EffectsOutput,
  zSchemaPixverseV5ImageToVideoInput,
  zSchemaPixverseV5ImageToVideoOutput,
  zSchemaPixverseV5TextToVideoInput,
  zSchemaPixverseV5TextToVideoOutput,
  zSchemaPixverseV5TransitionInput,
  zSchemaPixverseV5TransitionOutput,
  zSchemaRifeVideoInput,
  zSchemaRifeVideoOutput,
  zSchemaSadtalkerInput,
  zSchemaSadtalkerOutput,
  zSchemaSadtalkerReferenceInput,
  zSchemaSadtalkerReferenceOutput,
  zSchemaSam2VideoInput,
  zSchemaSam2VideoOutput,
  zSchemaSam3VideoInput,
  zSchemaSam3VideoOutput,
  zSchemaSam3VideoRleInput,
  zSchemaSam3VideoRleOutput,
  zSchemaSanaVideoInput,
  zSchemaSanaVideoOutput,
  zSchemaScailInput,
  zSchemaScailOutput,
  zSchemaSeedvrUpscaleVideoInput,
  zSchemaSeedvrUpscaleVideoOutput,
  zSchemaSfxV15VideoToVideoInput,
  zSchemaSfxV15VideoToVideoOutput,
  zSchemaSfxV1VideoToVideoInput,
  zSchemaSfxV1VideoToVideoOutput,
  zSchemaSkyreelsI2vInput,
  zSchemaSkyreelsI2vOutput,
  zSchemaSora2ImageToVideoInput,
  zSchemaSora2ImageToVideoOutput,
  zSchemaSora2ImageToVideoProInput,
  zSchemaSora2ImageToVideoProOutput,
  zSchemaSora2TextToVideoInput,
  zSchemaSora2TextToVideoOutput,
  zSchemaSora2TextToVideoProInput,
  zSchemaSora2TextToVideoProOutput,
  zSchemaSora2VideoToVideoRemixInput,
  zSchemaSora2VideoToVideoRemixOutput,
  zSchemaStableAvatarInput,
  zSchemaStableAvatarOutput,
  zSchemaStableVideoInput,
  zSchemaStableVideoOutput,
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
  zSchemaT2vTurboInput,
  zSchemaT2vTurboOutput,
  zSchemaThinksoundAudioInput,
  zSchemaThinksoundAudioOutput,
  zSchemaThinksoundInput,
  zSchemaThinksoundOutput,
  zSchemaTopazUpscaleVideoInput,
  zSchemaTopazUpscaleVideoOutput,
  zSchemaTranspixarInput,
  zSchemaTranspixarOutput,
  zSchemaV26ImageToVideoFlashInput,
  zSchemaV26ImageToVideoFlashOutput,
  zSchemaV26ImageToVideoInput,
  zSchemaV26ImageToVideoOutput,
  zSchemaV26ReferenceToVideoInput,
  zSchemaV26ReferenceToVideoOutput,
  zSchemaV26TextToVideoInput,
  zSchemaV26TextToVideoOutput,
  zSchemaVeo2ImageToVideoInput,
  zSchemaVeo2ImageToVideoOutput,
  zSchemaVeo2Input,
  zSchemaVeo2Output,
  zSchemaVeo31ExtendVideoInput,
  zSchemaVeo31ExtendVideoOutput,
  zSchemaVeo31FastExtendVideoInput,
  zSchemaVeo31FastExtendVideoOutput,
  zSchemaVeo31FastFirstLastFrameToVideoInput,
  zSchemaVeo31FastFirstLastFrameToVideoOutput,
  zSchemaVeo31FastImageToVideoInput,
  zSchemaVeo31FastImageToVideoOutput,
  zSchemaVeo31FastInput,
  zSchemaVeo31FastOutput,
  zSchemaVeo31FirstLastFrameToVideoInput,
  zSchemaVeo31FirstLastFrameToVideoOutput,
  zSchemaVeo31ImageToVideoInput,
  zSchemaVeo31ImageToVideoOutput,
  zSchemaVeo31Input,
  zSchemaVeo31Output,
  zSchemaVeo31ReferenceToVideoInput,
  zSchemaVeo31ReferenceToVideoOutput,
  zSchemaVeo3FastImageToVideoInput,
  zSchemaVeo3FastImageToVideoOutput,
  zSchemaVeo3FastInput,
  zSchemaVeo3FastOutput,
  zSchemaVeo3ImageToVideoInput,
  zSchemaVeo3ImageToVideoOutput,
  zSchemaVeo3Input,
  zSchemaVeo3Output,
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
  zSchemaViduImageToVideoInput,
  zSchemaViduImageToVideoOutput,
  zSchemaViduQ1ImageToVideoInput,
  zSchemaViduQ1ImageToVideoOutput,
  zSchemaViduQ1ReferenceToVideoInput,
  zSchemaViduQ1ReferenceToVideoOutput,
  zSchemaViduQ1StartEndToVideoInput,
  zSchemaViduQ1StartEndToVideoOutput,
  zSchemaViduQ1TextToVideoInput,
  zSchemaViduQ1TextToVideoOutput,
  zSchemaViduQ2ImageToVideoProInput,
  zSchemaViduQ2ImageToVideoProOutput,
  zSchemaViduQ2ImageToVideoTurboInput,
  zSchemaViduQ2ImageToVideoTurboOutput,
  zSchemaViduQ2ReferenceToVideoProInput,
  zSchemaViduQ2ReferenceToVideoProOutput,
  zSchemaViduQ2TextToVideoInput,
  zSchemaViduQ2TextToVideoOutput,
  zSchemaViduQ2VideoExtensionProInput,
  zSchemaViduQ2VideoExtensionProOutput,
  zSchemaViduReferenceToVideoInput,
  zSchemaViduReferenceToVideoOutput,
  zSchemaViduStartEndToVideoInput,
  zSchemaViduStartEndToVideoOutput,
  zSchemaViduTemplateToVideoInput,
  zSchemaViduTemplateToVideoOutput,
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
  zSchemaWan25PreviewImageToVideoInput,
  zSchemaWan25PreviewImageToVideoOutput,
  zSchemaWan25PreviewTextToVideoInput,
  zSchemaWan25PreviewTextToVideoOutput,
  zSchemaWanAlphaInput,
  zSchemaWanAlphaOutput,
  zSchemaWanAtiInput,
  zSchemaWanAtiOutput,
  zSchemaWanEffectsInput,
  zSchemaWanEffectsOutput,
  zSchemaWanFlf2vInput,
  zSchemaWanFlf2vOutput,
  zSchemaWanFunControlInput,
  zSchemaWanFunControlOutput,
  zSchemaWanI2vInput,
  zSchemaWanI2vLoraInput,
  zSchemaWanI2vLoraOutput,
  zSchemaWanI2vOutput,
  zSchemaWanMoveInput,
  zSchemaWanMoveOutput,
  zSchemaWanProImageToVideoInput,
  zSchemaWanProImageToVideoOutput,
  zSchemaWanProTextToVideoInput,
  zSchemaWanProTextToVideoOutput,
  zSchemaWanT2vInput,
  zSchemaWanT2vLoraInput,
  zSchemaWanT2vLoraOutput,
  zSchemaWanT2vOutput,
  zSchemaWanV2214bAnimateMoveInput,
  zSchemaWanV2214bAnimateMoveOutput,
  zSchemaWanV2214bAnimateReplaceInput,
  zSchemaWanV2214bAnimateReplaceOutput,
  zSchemaWanV2214bSpeechToVideoInput,
  zSchemaWanV2214bSpeechToVideoOutput,
  zSchemaWanV225bImageToVideoInput,
  zSchemaWanV225bImageToVideoOutput,
  zSchemaWanV225bTextToVideoDistillInput,
  zSchemaWanV225bTextToVideoDistillOutput,
  zSchemaWanV225bTextToVideoFastWanInput,
  zSchemaWanV225bTextToVideoFastWanOutput,
  zSchemaWanV225bTextToVideoInput,
  zSchemaWanV225bTextToVideoOutput,
  zSchemaWanV22A14bImageToVideoInput,
  zSchemaWanV22A14bImageToVideoLoraInput,
  zSchemaWanV22A14bImageToVideoLoraOutput,
  zSchemaWanV22A14bImageToVideoOutput,
  zSchemaWanV22A14bImageToVideoTurboInput,
  zSchemaWanV22A14bImageToVideoTurboOutput,
  zSchemaWanV22A14bTextToVideoInput,
  zSchemaWanV22A14bTextToVideoLoraInput,
  zSchemaWanV22A14bTextToVideoLoraOutput,
  zSchemaWanV22A14bTextToVideoOutput,
  zSchemaWanV22A14bTextToVideoTurboInput,
  zSchemaWanV22A14bTextToVideoTurboOutput,
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
import type { z } from 'zod'

import type {
  SchemaAiAvatarInput,
  SchemaAiAvatarMultiInput,
  SchemaAiAvatarMultiOutput,
  SchemaAiAvatarMultiTextInput,
  SchemaAiAvatarMultiTextOutput,
  SchemaAiAvatarOutput,
  SchemaAiAvatarSingleTextInput,
  SchemaAiAvatarSingleTextOutput,
  SchemaAiFaceSwapFaceswapvideoInput,
  SchemaAiFaceSwapFaceswapvideoOutput,
  SchemaAmtInterpolationFrameInterpolationInput,
  SchemaAmtInterpolationFrameInterpolationOutput,
  SchemaAmtInterpolationInput,
  SchemaAmtInterpolationOutput,
  SchemaAnimatediffSparsectrlLcmInput,
  SchemaAnimatediffSparsectrlLcmOutput,
  SchemaAutoCaptionInput,
  SchemaAutoCaptionOutput,
  SchemaAvatarsAudioToVideoInput,
  SchemaAvatarsAudioToVideoOutput,
  SchemaAvatarsTextToVideoInput,
  SchemaAvatarsTextToVideoOutput,
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
  SchemaBytedanceOmnihumanInput,
  SchemaBytedanceOmnihumanOutput,
  SchemaBytedanceOmnihumanV15Input,
  SchemaBytedanceOmnihumanV15Output,
  SchemaBytedanceSeedanceV15ProImageToVideoInput,
  SchemaBytedanceSeedanceV15ProImageToVideoOutput,
  SchemaBytedanceSeedanceV15ProTextToVideoInput,
  SchemaBytedanceSeedanceV15ProTextToVideoOutput,
  SchemaBytedanceSeedanceV1LiteImageToVideoInput,
  SchemaBytedanceSeedanceV1LiteImageToVideoOutput,
  SchemaBytedanceSeedanceV1LiteReferenceToVideoInput,
  SchemaBytedanceSeedanceV1LiteReferenceToVideoOutput,
  SchemaBytedanceSeedanceV1LiteTextToVideoInput,
  SchemaBytedanceSeedanceV1LiteTextToVideoOutput,
  SchemaBytedanceSeedanceV1ProFastImageToVideoInput,
  SchemaBytedanceSeedanceV1ProFastImageToVideoOutput,
  SchemaBytedanceSeedanceV1ProFastTextToVideoInput,
  SchemaBytedanceSeedanceV1ProFastTextToVideoOutput,
  SchemaBytedanceSeedanceV1ProImageToVideoInput,
  SchemaBytedanceSeedanceV1ProImageToVideoOutput,
  SchemaBytedanceSeedanceV1ProTextToVideoInput,
  SchemaBytedanceSeedanceV1ProTextToVideoOutput,
  SchemaBytedanceUpscalerUpscaleVideoInput,
  SchemaBytedanceUpscalerUpscaleVideoOutput,
  SchemaBytedanceVideoStylizeInput,
  SchemaBytedanceVideoStylizeOutput,
  SchemaCogvideox5bImageToVideoInput,
  SchemaCogvideox5bImageToVideoOutput,
  SchemaCogvideox5bInput,
  SchemaCogvideox5bOutput,
  SchemaCogvideox5bVideoToVideoInput,
  SchemaCogvideox5bVideoToVideoOutput,
  SchemaControlnextInput,
  SchemaControlnextOutput,
  SchemaCreatifyAuroraInput,
  SchemaCreatifyAuroraOutput,
  SchemaCrystalVideoUpscalerInput,
  SchemaCrystalVideoUpscalerOutput,
  SchemaDecartLucy5bImageToVideoInput,
  SchemaDecartLucy5bImageToVideoOutput,
  SchemaDubbingInput,
  SchemaDubbingOutput,
  SchemaDwposeVideoInput,
  SchemaDwposeVideoOutput,
  SchemaEchomimicV3Input,
  SchemaEchomimicV3Output,
  SchemaEdittoInput,
  SchemaEdittoOutput,
  SchemaElevenlabsDubbingInput,
  SchemaElevenlabsDubbingOutput,
  SchemaFabric10FastInput,
  SchemaFabric10FastOutput,
  SchemaFabric10Input,
  SchemaFabric10Output,
  SchemaFabric10TextInput,
  SchemaFabric10TextOutput,
  SchemaFastAnimatediffTextToVideoInput,
  SchemaFastAnimatediffTextToVideoOutput,
  SchemaFastAnimatediffTurboTextToVideoInput,
  SchemaFastAnimatediffTurboTextToVideoOutput,
  SchemaFastAnimatediffTurboVideoToVideoInput,
  SchemaFastAnimatediffTurboVideoToVideoOutput,
  SchemaFastAnimatediffVideoToVideoInput,
  SchemaFastAnimatediffVideoToVideoOutput,
  SchemaFastSvdLcmInput,
  SchemaFastSvdLcmOutput,
  SchemaFastSvdLcmTextToVideoInput,
  SchemaFastSvdLcmTextToVideoOutput,
  SchemaFastSvdTextToVideoInput,
  SchemaFastSvdTextToVideoOutput,
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
  SchemaHunyuanVideoFoleyInput,
  SchemaHunyuanVideoFoleyOutput,
  SchemaHunyuanVideoImageToVideoInput,
  SchemaHunyuanVideoImageToVideoOutput,
  SchemaHunyuanVideoImg2VidLoraInput,
  SchemaHunyuanVideoImg2VidLoraOutput,
  SchemaHunyuanVideoInput,
  SchemaHunyuanVideoLoraInput,
  SchemaHunyuanVideoLoraOutput,
  SchemaHunyuanVideoLoraVideoToVideoInput,
  SchemaHunyuanVideoLoraVideoToVideoOutput,
  SchemaHunyuanVideoOutput,
  SchemaHunyuanVideoV15ImageToVideoInput,
  SchemaHunyuanVideoV15ImageToVideoOutput,
  SchemaHunyuanVideoV15TextToVideoInput,
  SchemaHunyuanVideoV15TextToVideoOutput,
  SchemaHunyuanVideoVideoToVideoInput,
  SchemaHunyuanVideoVideoToVideoOutput,
  SchemaInfinitalkInput,
  SchemaInfinitalkOutput,
  SchemaInfinitalkSingleTextInput,
  SchemaInfinitalkSingleTextOutput,
  SchemaInfinitalkVideoToVideoInput,
  SchemaInfinitalkVideoToVideoOutput,
  SchemaInfinityStarTextToVideoInput,
  SchemaInfinityStarTextToVideoOutput,
  SchemaKandinsky5ProImageToVideoInput,
  SchemaKandinsky5ProImageToVideoOutput,
  SchemaKandinsky5ProTextToVideoInput,
  SchemaKandinsky5ProTextToVideoOutput,
  SchemaKandinsky5TextToVideoDistillInput,
  SchemaKandinsky5TextToVideoDistillOutput,
  SchemaKandinsky5TextToVideoInput,
  SchemaKandinsky5TextToVideoOutput,
  SchemaKlingVideoAiAvatarV2ProInput,
  SchemaKlingVideoAiAvatarV2ProOutput,
  SchemaKlingVideoAiAvatarV2StandardInput,
  SchemaKlingVideoAiAvatarV2StandardOutput,
  SchemaKlingVideoLipsyncAudioToVideoInput,
  SchemaKlingVideoLipsyncAudioToVideoOutput,
  SchemaKlingVideoLipsyncTextToVideoInput,
  SchemaKlingVideoLipsyncTextToVideoOutput,
  SchemaKlingVideoO1ImageToVideoInput,
  SchemaKlingVideoO1ImageToVideoOutput,
  SchemaKlingVideoO1ReferenceToVideoInput,
  SchemaKlingVideoO1ReferenceToVideoOutput,
  SchemaKlingVideoO1StandardImageToVideoInput,
  SchemaKlingVideoO1StandardImageToVideoOutput,
  SchemaKlingVideoO1StandardReferenceToVideoInput,
  SchemaKlingVideoO1StandardReferenceToVideoOutput,
  SchemaKlingVideoO1StandardVideoToVideoEditInput,
  SchemaKlingVideoO1StandardVideoToVideoEditOutput,
  SchemaKlingVideoO1StandardVideoToVideoReferenceInput,
  SchemaKlingVideoO1StandardVideoToVideoReferenceOutput,
  SchemaKlingVideoO1VideoToVideoEditInput,
  SchemaKlingVideoO1VideoToVideoEditOutput,
  SchemaKlingVideoO1VideoToVideoReferenceInput,
  SchemaKlingVideoO1VideoToVideoReferenceOutput,
  SchemaKlingVideoV15ProEffectsInput,
  SchemaKlingVideoV15ProEffectsOutput,
  SchemaKlingVideoV15ProImageToVideoInput,
  SchemaKlingVideoV15ProImageToVideoOutput,
  SchemaKlingVideoV15ProTextToVideoInput,
  SchemaKlingVideoV15ProTextToVideoOutput,
  SchemaKlingVideoV16ProEffectsInput,
  SchemaKlingVideoV16ProEffectsOutput,
  SchemaKlingVideoV16ProElementsInput,
  SchemaKlingVideoV16ProElementsOutput,
  SchemaKlingVideoV16ProImageToVideoInput,
  SchemaKlingVideoV16ProImageToVideoOutput,
  SchemaKlingVideoV16ProTextToVideoInput,
  SchemaKlingVideoV16ProTextToVideoOutput,
  SchemaKlingVideoV16StandardEffectsInput,
  SchemaKlingVideoV16StandardEffectsOutput,
  SchemaKlingVideoV16StandardElementsInput,
  SchemaKlingVideoV16StandardElementsOutput,
  SchemaKlingVideoV16StandardImageToVideoInput,
  SchemaKlingVideoV16StandardImageToVideoOutput,
  SchemaKlingVideoV16StandardTextToVideoInput,
  SchemaKlingVideoV16StandardTextToVideoOutput,
  SchemaKlingVideoV1ProAiAvatarInput,
  SchemaKlingVideoV1ProAiAvatarOutput,
  SchemaKlingVideoV1StandardAiAvatarInput,
  SchemaKlingVideoV1StandardAiAvatarOutput,
  SchemaKlingVideoV1StandardEffectsInput,
  SchemaKlingVideoV1StandardEffectsOutput,
  SchemaKlingVideoV1StandardImageToVideoInput,
  SchemaKlingVideoV1StandardImageToVideoOutput,
  SchemaKlingVideoV1StandardTextToVideoInput,
  SchemaKlingVideoV1StandardTextToVideoOutput,
  SchemaKlingVideoV21MasterImageToVideoInput,
  SchemaKlingVideoV21MasterImageToVideoOutput,
  SchemaKlingVideoV21MasterTextToVideoInput,
  SchemaKlingVideoV21MasterTextToVideoOutput,
  SchemaKlingVideoV21ProImageToVideoInput,
  SchemaKlingVideoV21ProImageToVideoOutput,
  SchemaKlingVideoV21StandardImageToVideoInput,
  SchemaKlingVideoV21StandardImageToVideoOutput,
  SchemaKlingVideoV25TurboProImageToVideoInput,
  SchemaKlingVideoV25TurboProImageToVideoOutput,
  SchemaKlingVideoV25TurboProTextToVideoInput,
  SchemaKlingVideoV25TurboProTextToVideoOutput,
  SchemaKlingVideoV25TurboStandardImageToVideoInput,
  SchemaKlingVideoV25TurboStandardImageToVideoOutput,
  SchemaKlingVideoV26ProImageToVideoInput,
  SchemaKlingVideoV26ProImageToVideoOutput,
  SchemaKlingVideoV26ProMotionControlInput,
  SchemaKlingVideoV26ProMotionControlOutput,
  SchemaKlingVideoV26ProTextToVideoInput,
  SchemaKlingVideoV26ProTextToVideoOutput,
  SchemaKlingVideoV26StandardMotionControlInput,
  SchemaKlingVideoV26StandardMotionControlOutput,
  SchemaKlingVideoV2MasterImageToVideoInput,
  SchemaKlingVideoV2MasterImageToVideoOutput,
  SchemaKlingVideoV2MasterTextToVideoInput,
  SchemaKlingVideoV2MasterTextToVideoOutput,
  SchemaKreaWan14bTextToVideoInput,
  SchemaKreaWan14bTextToVideoOutput,
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
  SchemaLiveAvatarInput,
  SchemaLiveAvatarOutput,
  SchemaLivePortraitInput,
  SchemaLivePortraitOutput,
  SchemaLongcatMultiAvatarImageAudioToVideoInput,
  SchemaLongcatMultiAvatarImageAudioToVideoOutput,
  SchemaLongcatSingleAvatarAudioToVideoInput,
  SchemaLongcatSingleAvatarAudioToVideoOutput,
  SchemaLongcatSingleAvatarImageAudioToVideoInput,
  SchemaLongcatSingleAvatarImageAudioToVideoOutput,
  SchemaLongcatVideoDistilledImageToVideo480pInput,
  SchemaLongcatVideoDistilledImageToVideo480pOutput,
  SchemaLongcatVideoDistilledImageToVideo720pInput,
  SchemaLongcatVideoDistilledImageToVideo720pOutput,
  SchemaLongcatVideoDistilledTextToVideo480pInput,
  SchemaLongcatVideoDistilledTextToVideo480pOutput,
  SchemaLongcatVideoDistilledTextToVideo720pInput,
  SchemaLongcatVideoDistilledTextToVideo720pOutput,
  SchemaLongcatVideoImageToVideo480pInput,
  SchemaLongcatVideoImageToVideo480pOutput,
  SchemaLongcatVideoImageToVideo720pInput,
  SchemaLongcatVideoImageToVideo720pOutput,
  SchemaLongcatVideoTextToVideo480pInput,
  SchemaLongcatVideoTextToVideo480pOutput,
  SchemaLongcatVideoTextToVideo720pInput,
  SchemaLongcatVideoTextToVideo720pOutput,
  SchemaLtx219bAudioToVideoInput,
  SchemaLtx219bAudioToVideoLoraInput,
  SchemaLtx219bAudioToVideoLoraOutput,
  SchemaLtx219bAudioToVideoOutput,
  SchemaLtx219bDistilledAudioToVideoInput,
  SchemaLtx219bDistilledAudioToVideoLoraInput,
  SchemaLtx219bDistilledAudioToVideoLoraOutput,
  SchemaLtx219bDistilledAudioToVideoOutput,
  SchemaLtx219bDistilledExtendVideoInput,
  SchemaLtx219bDistilledExtendVideoLoraInput,
  SchemaLtx219bDistilledExtendVideoLoraOutput,
  SchemaLtx219bDistilledExtendVideoOutput,
  SchemaLtx219bDistilledImageToVideoInput,
  SchemaLtx219bDistilledImageToVideoLoraInput,
  SchemaLtx219bDistilledImageToVideoLoraOutput,
  SchemaLtx219bDistilledImageToVideoOutput,
  SchemaLtx219bDistilledTextToVideoInput,
  SchemaLtx219bDistilledTextToVideoLoraInput,
  SchemaLtx219bDistilledTextToVideoLoraOutput,
  SchemaLtx219bDistilledTextToVideoOutput,
  SchemaLtx219bDistilledVideoToVideoInput,
  SchemaLtx219bDistilledVideoToVideoLoraInput,
  SchemaLtx219bDistilledVideoToVideoLoraOutput,
  SchemaLtx219bDistilledVideoToVideoOutput,
  SchemaLtx219bExtendVideoInput,
  SchemaLtx219bExtendVideoLoraInput,
  SchemaLtx219bExtendVideoLoraOutput,
  SchemaLtx219bExtendVideoOutput,
  SchemaLtx219bImageToVideoInput,
  SchemaLtx219bImageToVideoLoraInput,
  SchemaLtx219bImageToVideoLoraOutput,
  SchemaLtx219bImageToVideoOutput,
  SchemaLtx219bTextToVideoInput,
  SchemaLtx219bTextToVideoLoraInput,
  SchemaLtx219bTextToVideoLoraOutput,
  SchemaLtx219bTextToVideoOutput,
  SchemaLtx219bVideoToVideoInput,
  SchemaLtx219bVideoToVideoLoraInput,
  SchemaLtx219bVideoToVideoLoraOutput,
  SchemaLtx219bVideoToVideoOutput,
  SchemaLtx2ImageToVideoFastInput,
  SchemaLtx2ImageToVideoFastOutput,
  SchemaLtx2ImageToVideoInput,
  SchemaLtx2ImageToVideoOutput,
  SchemaLtx2RetakeVideoInput,
  SchemaLtx2RetakeVideoOutput,
  SchemaLtx2TextToVideoFastInput,
  SchemaLtx2TextToVideoFastOutput,
  SchemaLtx2TextToVideoInput,
  SchemaLtx2TextToVideoOutput,
  SchemaLtxVideo13bDevExtendInput,
  SchemaLtxVideo13bDevExtendOutput,
  SchemaLtxVideo13bDevImageToVideoInput,
  SchemaLtxVideo13bDevImageToVideoOutput,
  SchemaLtxVideo13bDevInput,
  SchemaLtxVideo13bDevMulticonditioningInput,
  SchemaLtxVideo13bDevMulticonditioningOutput,
  SchemaLtxVideo13bDevOutput,
  SchemaLtxVideo13bDistilledExtendInput,
  SchemaLtxVideo13bDistilledExtendOutput,
  SchemaLtxVideo13bDistilledImageToVideoInput,
  SchemaLtxVideo13bDistilledImageToVideoOutput,
  SchemaLtxVideo13bDistilledInput,
  SchemaLtxVideo13bDistilledMulticonditioningInput,
  SchemaLtxVideo13bDistilledMulticonditioningOutput,
  SchemaLtxVideo13bDistilledOutput,
  SchemaLtxVideoImageToVideoInput,
  SchemaLtxVideoImageToVideoOutput,
  SchemaLtxVideoInput,
  SchemaLtxVideoLoraImageToVideoInput,
  SchemaLtxVideoLoraImageToVideoOutput,
  SchemaLtxVideoLoraMulticonditioningInput,
  SchemaLtxVideoLoraMulticonditioningOutput,
  SchemaLtxVideoOutput,
  SchemaLtxVideoV095ExtendInput,
  SchemaLtxVideoV095ExtendOutput,
  SchemaLtxVideoV095Input,
  SchemaLtxVideoV095MulticonditioningInput,
  SchemaLtxVideoV095MulticonditioningOutput,
  SchemaLtxVideoV095Output,
  SchemaLtxv13B098DistilledExtendInput,
  SchemaLtxv13B098DistilledExtendOutput,
  SchemaLtxv13B098DistilledImageToVideoInput,
  SchemaLtxv13B098DistilledImageToVideoOutput,
  SchemaLtxv13B098DistilledInput,
  SchemaLtxv13B098DistilledMulticonditioningInput,
  SchemaLtxv13B098DistilledMulticonditioningOutput,
  SchemaLtxv13B098DistilledOutput,
  SchemaLucy14bImageToVideoInput,
  SchemaLucy14bImageToVideoOutput,
  SchemaLucyEditDevInput,
  SchemaLucyEditDevOutput,
  SchemaLucyEditFastInput,
  SchemaLucyEditFastOutput,
  SchemaLucyEditProInput,
  SchemaLucyEditProOutput,
  SchemaLucyRestyleInput,
  SchemaLucyRestyleOutput,
  SchemaLumaDreamMachineRay2FlashImageToVideoInput,
  SchemaLumaDreamMachineRay2FlashImageToVideoOutput,
  SchemaLumaDreamMachineRay2FlashInput,
  SchemaLumaDreamMachineRay2FlashModifyInput,
  SchemaLumaDreamMachineRay2FlashModifyOutput,
  SchemaLumaDreamMachineRay2FlashOutput,
  SchemaLumaDreamMachineRay2FlashReframeInput,
  SchemaLumaDreamMachineRay2FlashReframeOutput,
  SchemaLumaDreamMachineRay2ImageToVideoInput,
  SchemaLumaDreamMachineRay2ImageToVideoOutput,
  SchemaLumaDreamMachineRay2Input,
  SchemaLumaDreamMachineRay2ModifyInput,
  SchemaLumaDreamMachineRay2ModifyOutput,
  SchemaLumaDreamMachineRay2Output,
  SchemaLumaDreamMachineRay2ReframeInput,
  SchemaLumaDreamMachineRay2ReframeOutput,
  SchemaLynxInput,
  SchemaLynxOutput,
  SchemaMagiDistilledExtendVideoInput,
  SchemaMagiDistilledExtendVideoOutput,
  SchemaMagiDistilledImageToVideoInput,
  SchemaMagiDistilledImageToVideoOutput,
  SchemaMagiDistilledInput,
  SchemaMagiDistilledOutput,
  SchemaMagiExtendVideoInput,
  SchemaMagiExtendVideoOutput,
  SchemaMagiImageToVideoInput,
  SchemaMagiImageToVideoOutput,
  SchemaMagiInput,
  SchemaMagiOutput,
  SchemaMareyI2vInput,
  SchemaMareyI2vOutput,
  SchemaMareyMotionTransferInput,
  SchemaMareyMotionTransferOutput,
  SchemaMareyPoseTransferInput,
  SchemaMareyPoseTransferOutput,
  SchemaMareyT2vInput,
  SchemaMareyT2vOutput,
  SchemaMinimaxHailuo02FastImageToVideoInput,
  SchemaMinimaxHailuo02FastImageToVideoOutput,
  SchemaMinimaxHailuo02ProImageToVideoInput,
  SchemaMinimaxHailuo02ProImageToVideoOutput,
  SchemaMinimaxHailuo02ProTextToVideoInput,
  SchemaMinimaxHailuo02ProTextToVideoOutput,
  SchemaMinimaxHailuo02StandardImageToVideoInput,
  SchemaMinimaxHailuo02StandardImageToVideoOutput,
  SchemaMinimaxHailuo02StandardTextToVideoInput,
  SchemaMinimaxHailuo02StandardTextToVideoOutput,
  SchemaMinimaxHailuo23FastProImageToVideoInput,
  SchemaMinimaxHailuo23FastProImageToVideoOutput,
  SchemaMinimaxHailuo23FastStandardImageToVideoInput,
  SchemaMinimaxHailuo23FastStandardImageToVideoOutput,
  SchemaMinimaxHailuo23ProImageToVideoInput,
  SchemaMinimaxHailuo23ProImageToVideoOutput,
  SchemaMinimaxHailuo23ProTextToVideoInput,
  SchemaMinimaxHailuo23ProTextToVideoOutput,
  SchemaMinimaxHailuo23StandardImageToVideoInput,
  SchemaMinimaxHailuo23StandardImageToVideoOutput,
  SchemaMinimaxHailuo23StandardTextToVideoInput,
  SchemaMinimaxHailuo23StandardTextToVideoOutput,
  SchemaMinimaxVideo01DirectorImageToVideoInput,
  SchemaMinimaxVideo01DirectorImageToVideoOutput,
  SchemaMinimaxVideo01DirectorInput,
  SchemaMinimaxVideo01DirectorOutput,
  SchemaMinimaxVideo01ImageToVideoInput,
  SchemaMinimaxVideo01ImageToVideoOutput,
  SchemaMinimaxVideo01Input,
  SchemaMinimaxVideo01LiveImageToVideoInput,
  SchemaMinimaxVideo01LiveImageToVideoOutput,
  SchemaMinimaxVideo01LiveInput,
  SchemaMinimaxVideo01LiveOutput,
  SchemaMinimaxVideo01Output,
  SchemaMinimaxVideo01SubjectReferenceInput,
  SchemaMinimaxVideo01SubjectReferenceOutput,
  SchemaMmaudioV2Input,
  SchemaMmaudioV2Output,
  SchemaMochiV1Input,
  SchemaMochiV1Output,
  SchemaMusetalkInput,
  SchemaMusetalkOutput,
  SchemaOneToAllAnimation13bInput,
  SchemaOneToAllAnimation13bOutput,
  SchemaOneToAllAnimation14bInput,
  SchemaOneToAllAnimation14bOutput,
  SchemaOviImageToVideoInput,
  SchemaOviImageToVideoOutput,
  SchemaOviInput,
  SchemaOviOutput,
  SchemaPikaV15PikaffectsInput,
  SchemaPikaV15PikaffectsOutput,
  SchemaPikaV21ImageToVideoInput,
  SchemaPikaV21ImageToVideoOutput,
  SchemaPikaV21TextToVideoInput,
  SchemaPikaV21TextToVideoOutput,
  SchemaPikaV22ImageToVideoInput,
  SchemaPikaV22ImageToVideoOutput,
  SchemaPikaV22PikaframesInput,
  SchemaPikaV22PikaframesOutput,
  SchemaPikaV22PikascenesInput,
  SchemaPikaV22PikascenesOutput,
  SchemaPikaV22TextToVideoInput,
  SchemaPikaV22TextToVideoOutput,
  SchemaPikaV2PikadditionsInput,
  SchemaPikaV2PikadditionsOutput,
  SchemaPikaV2TurboImageToVideoInput,
  SchemaPikaV2TurboImageToVideoOutput,
  SchemaPikaV2TurboTextToVideoInput,
  SchemaPikaV2TurboTextToVideoOutput,
  SchemaPixverseExtendFastInput,
  SchemaPixverseExtendFastOutput,
  SchemaPixverseExtendInput,
  SchemaPixverseExtendOutput,
  SchemaPixverseLipsyncInput,
  SchemaPixverseLipsyncOutput,
  SchemaPixverseSoundEffectsInput,
  SchemaPixverseSoundEffectsOutput,
  SchemaPixverseSwapInput,
  SchemaPixverseSwapOutput,
  SchemaPixverseV35EffectsInput,
  SchemaPixverseV35EffectsOutput,
  SchemaPixverseV35ImageToVideoFastInput,
  SchemaPixverseV35ImageToVideoFastOutput,
  SchemaPixverseV35ImageToVideoInput,
  SchemaPixverseV35ImageToVideoOutput,
  SchemaPixverseV35TextToVideoFastInput,
  SchemaPixverseV35TextToVideoFastOutput,
  SchemaPixverseV35TextToVideoInput,
  SchemaPixverseV35TextToVideoOutput,
  SchemaPixverseV35TransitionInput,
  SchemaPixverseV35TransitionOutput,
  SchemaPixverseV45EffectsInput,
  SchemaPixverseV45EffectsOutput,
  SchemaPixverseV45ImageToVideoFastInput,
  SchemaPixverseV45ImageToVideoFastOutput,
  SchemaPixverseV45ImageToVideoInput,
  SchemaPixverseV45ImageToVideoOutput,
  SchemaPixverseV45TextToVideoFastInput,
  SchemaPixverseV45TextToVideoFastOutput,
  SchemaPixverseV45TextToVideoInput,
  SchemaPixverseV45TextToVideoOutput,
  SchemaPixverseV45TransitionInput,
  SchemaPixverseV45TransitionOutput,
  SchemaPixverseV4EffectsInput,
  SchemaPixverseV4EffectsOutput,
  SchemaPixverseV4ImageToVideoFastInput,
  SchemaPixverseV4ImageToVideoFastOutput,
  SchemaPixverseV4ImageToVideoInput,
  SchemaPixverseV4ImageToVideoOutput,
  SchemaPixverseV4TextToVideoFastInput,
  SchemaPixverseV4TextToVideoFastOutput,
  SchemaPixverseV4TextToVideoInput,
  SchemaPixverseV4TextToVideoOutput,
  SchemaPixverseV55EffectsInput,
  SchemaPixverseV55EffectsOutput,
  SchemaPixverseV55ImageToVideoInput,
  SchemaPixverseV55ImageToVideoOutput,
  SchemaPixverseV55TextToVideoInput,
  SchemaPixverseV55TextToVideoOutput,
  SchemaPixverseV55TransitionInput,
  SchemaPixverseV55TransitionOutput,
  SchemaPixverseV56ImageToVideoInput,
  SchemaPixverseV56ImageToVideoOutput,
  SchemaPixverseV56TextToVideoInput,
  SchemaPixverseV56TextToVideoOutput,
  SchemaPixverseV56TransitionInput,
  SchemaPixverseV56TransitionOutput,
  SchemaPixverseV5EffectsInput,
  SchemaPixverseV5EffectsOutput,
  SchemaPixverseV5ImageToVideoInput,
  SchemaPixverseV5ImageToVideoOutput,
  SchemaPixverseV5TextToVideoInput,
  SchemaPixverseV5TextToVideoOutput,
  SchemaPixverseV5TransitionInput,
  SchemaPixverseV5TransitionOutput,
  SchemaRifeVideoInput,
  SchemaRifeVideoOutput,
  SchemaSadtalkerInput,
  SchemaSadtalkerOutput,
  SchemaSadtalkerReferenceInput,
  SchemaSadtalkerReferenceOutput,
  SchemaSam2VideoInput,
  SchemaSam2VideoOutput,
  SchemaSam3VideoInput,
  SchemaSam3VideoOutput,
  SchemaSam3VideoRleInput,
  SchemaSam3VideoRleOutput,
  SchemaSanaVideoInput,
  SchemaSanaVideoOutput,
  SchemaScailInput,
  SchemaScailOutput,
  SchemaSeedvrUpscaleVideoInput,
  SchemaSeedvrUpscaleVideoOutput,
  SchemaSfxV15VideoToVideoInput,
  SchemaSfxV15VideoToVideoOutput,
  SchemaSfxV1VideoToVideoInput,
  SchemaSfxV1VideoToVideoOutput,
  SchemaSkyreelsI2vInput,
  SchemaSkyreelsI2vOutput,
  SchemaSora2ImageToVideoInput,
  SchemaSora2ImageToVideoOutput,
  SchemaSora2ImageToVideoProInput,
  SchemaSora2ImageToVideoProOutput,
  SchemaSora2TextToVideoInput,
  SchemaSora2TextToVideoOutput,
  SchemaSora2TextToVideoProInput,
  SchemaSora2TextToVideoProOutput,
  SchemaSora2VideoToVideoRemixInput,
  SchemaSora2VideoToVideoRemixOutput,
  SchemaStableAvatarInput,
  SchemaStableAvatarOutput,
  SchemaStableVideoInput,
  SchemaStableVideoOutput,
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
  SchemaT2vTurboInput,
  SchemaT2vTurboOutput,
  SchemaThinksoundAudioInput,
  SchemaThinksoundAudioOutput,
  SchemaThinksoundInput,
  SchemaThinksoundOutput,
  SchemaTopazUpscaleVideoInput,
  SchemaTopazUpscaleVideoOutput,
  SchemaTranspixarInput,
  SchemaTranspixarOutput,
  SchemaV26ImageToVideoFlashInput,
  SchemaV26ImageToVideoFlashOutput,
  SchemaV26ImageToVideoInput,
  SchemaV26ImageToVideoOutput,
  SchemaV26ReferenceToVideoInput,
  SchemaV26ReferenceToVideoOutput,
  SchemaV26TextToVideoInput,
  SchemaV26TextToVideoOutput,
  SchemaVeo2ImageToVideoInput,
  SchemaVeo2ImageToVideoOutput,
  SchemaVeo2Input,
  SchemaVeo2Output,
  SchemaVeo31ExtendVideoInput,
  SchemaVeo31ExtendVideoOutput,
  SchemaVeo31FastExtendVideoInput,
  SchemaVeo31FastExtendVideoOutput,
  SchemaVeo31FastFirstLastFrameToVideoInput,
  SchemaVeo31FastFirstLastFrameToVideoOutput,
  SchemaVeo31FastImageToVideoInput,
  SchemaVeo31FastImageToVideoOutput,
  SchemaVeo31FastInput,
  SchemaVeo31FastOutput,
  SchemaVeo31FirstLastFrameToVideoInput,
  SchemaVeo31FirstLastFrameToVideoOutput,
  SchemaVeo31ImageToVideoInput,
  SchemaVeo31ImageToVideoOutput,
  SchemaVeo31Input,
  SchemaVeo31Output,
  SchemaVeo31ReferenceToVideoInput,
  SchemaVeo31ReferenceToVideoOutput,
  SchemaVeo3FastImageToVideoInput,
  SchemaVeo3FastImageToVideoOutput,
  SchemaVeo3FastInput,
  SchemaVeo3FastOutput,
  SchemaVeo3ImageToVideoInput,
  SchemaVeo3ImageToVideoOutput,
  SchemaVeo3Input,
  SchemaVeo3Output,
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
  SchemaViduImageToVideoInput,
  SchemaViduImageToVideoOutput,
  SchemaViduQ1ImageToVideoInput,
  SchemaViduQ1ImageToVideoOutput,
  SchemaViduQ1ReferenceToVideoInput,
  SchemaViduQ1ReferenceToVideoOutput,
  SchemaViduQ1StartEndToVideoInput,
  SchemaViduQ1StartEndToVideoOutput,
  SchemaViduQ1TextToVideoInput,
  SchemaViduQ1TextToVideoOutput,
  SchemaViduQ2ImageToVideoProInput,
  SchemaViduQ2ImageToVideoProOutput,
  SchemaViduQ2ImageToVideoTurboInput,
  SchemaViduQ2ImageToVideoTurboOutput,
  SchemaViduQ2ReferenceToVideoProInput,
  SchemaViduQ2ReferenceToVideoProOutput,
  SchemaViduQ2TextToVideoInput,
  SchemaViduQ2TextToVideoOutput,
  SchemaViduQ2VideoExtensionProInput,
  SchemaViduQ2VideoExtensionProOutput,
  SchemaViduReferenceToVideoInput,
  SchemaViduReferenceToVideoOutput,
  SchemaViduStartEndToVideoInput,
  SchemaViduStartEndToVideoOutput,
  SchemaViduTemplateToVideoInput,
  SchemaViduTemplateToVideoOutput,
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
  SchemaWan25PreviewImageToVideoInput,
  SchemaWan25PreviewImageToVideoOutput,
  SchemaWan25PreviewTextToVideoInput,
  SchemaWan25PreviewTextToVideoOutput,
  SchemaWanAlphaInput,
  SchemaWanAlphaOutput,
  SchemaWanAtiInput,
  SchemaWanAtiOutput,
  SchemaWanEffectsInput,
  SchemaWanEffectsOutput,
  SchemaWanFlf2vInput,
  SchemaWanFlf2vOutput,
  SchemaWanFunControlInput,
  SchemaWanFunControlOutput,
  SchemaWanI2vInput,
  SchemaWanI2vLoraInput,
  SchemaWanI2vLoraOutput,
  SchemaWanI2vOutput,
  SchemaWanMoveInput,
  SchemaWanMoveOutput,
  SchemaWanProImageToVideoInput,
  SchemaWanProImageToVideoOutput,
  SchemaWanProTextToVideoInput,
  SchemaWanProTextToVideoOutput,
  SchemaWanT2vInput,
  SchemaWanT2vLoraInput,
  SchemaWanT2vLoraOutput,
  SchemaWanT2vOutput,
  SchemaWanV2214bAnimateMoveInput,
  SchemaWanV2214bAnimateMoveOutput,
  SchemaWanV2214bAnimateReplaceInput,
  SchemaWanV2214bAnimateReplaceOutput,
  SchemaWanV2214bSpeechToVideoInput,
  SchemaWanV2214bSpeechToVideoOutput,
  SchemaWanV225bImageToVideoInput,
  SchemaWanV225bImageToVideoOutput,
  SchemaWanV225bTextToVideoDistillInput,
  SchemaWanV225bTextToVideoDistillOutput,
  SchemaWanV225bTextToVideoFastWanInput,
  SchemaWanV225bTextToVideoFastWanOutput,
  SchemaWanV225bTextToVideoInput,
  SchemaWanV225bTextToVideoOutput,
  SchemaWanV22A14bImageToVideoInput,
  SchemaWanV22A14bImageToVideoLoraInput,
  SchemaWanV22A14bImageToVideoLoraOutput,
  SchemaWanV22A14bImageToVideoOutput,
  SchemaWanV22A14bImageToVideoTurboInput,
  SchemaWanV22A14bImageToVideoTurboOutput,
  SchemaWanV22A14bTextToVideoInput,
  SchemaWanV22A14bTextToVideoLoraInput,
  SchemaWanV22A14bTextToVideoLoraOutput,
  SchemaWanV22A14bTextToVideoOutput,
  SchemaWanV22A14bTextToVideoTurboInput,
  SchemaWanV22A14bTextToVideoTurboOutput,
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

export type VideoEndpointMap = {
  'fal-ai/ltx-2-19b/distilled/audio-to-video/lora': {
    input: SchemaLtx219bDistilledAudioToVideoLoraInput
    output: SchemaLtx219bDistilledAudioToVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/audio-to-video/lora': {
    input: SchemaLtx219bAudioToVideoLoraInput
    output: SchemaLtx219bAudioToVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/distilled/audio-to-video': {
    input: SchemaLtx219bDistilledAudioToVideoInput
    output: SchemaLtx219bDistilledAudioToVideoOutput
  }
  'fal-ai/ltx-2-19b/audio-to-video': {
    input: SchemaLtx219bAudioToVideoInput
    output: SchemaLtx219bAudioToVideoOutput
  }
  'fal-ai/elevenlabs/dubbing': {
    input: SchemaElevenlabsDubbingInput
    output: SchemaElevenlabsDubbingOutput
  }
  'fal-ai/longcat-multi-avatar/image-audio-to-video': {
    input: SchemaLongcatMultiAvatarImageAudioToVideoInput
    output: SchemaLongcatMultiAvatarImageAudioToVideoOutput
  }
  'fal-ai/longcat-single-avatar/image-audio-to-video': {
    input: SchemaLongcatSingleAvatarImageAudioToVideoInput
    output: SchemaLongcatSingleAvatarImageAudioToVideoOutput
  }
  'fal-ai/longcat-single-avatar/audio-to-video': {
    input: SchemaLongcatSingleAvatarAudioToVideoInput
    output: SchemaLongcatSingleAvatarAudioToVideoOutput
  }
  'argil/avatars/audio-to-video': {
    input: SchemaAvatarsAudioToVideoInput
    output: SchemaAvatarsAudioToVideoOutput
  }
  'fal-ai/wan/v2.2-14b/speech-to-video': {
    input: SchemaWanV2214bSpeechToVideoInput
    output: SchemaWanV2214bSpeechToVideoOutput
  }
  'fal-ai/stable-avatar': {
    input: SchemaStableAvatarInput
    output: SchemaStableAvatarOutput
  }
  'fal-ai/echomimic-v3': {
    input: SchemaEchomimicV3Input
    output: SchemaEchomimicV3Output
  }
  'veed/avatars/audio-to-video': {
    input: SchemaAvatarsAudioToVideoInput
    output: SchemaAvatarsAudioToVideoOutput
  }
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
  'fal-ai/kling-video/v2.5-turbo/pro/text-to-video': {
    input: SchemaKlingVideoV25TurboProTextToVideoInput
    output: SchemaKlingVideoV25TurboProTextToVideoOutput
  }
  'fal-ai/veo3/fast': {
    input: SchemaVeo3FastInput
    output: SchemaVeo3FastOutput
  }
  'fal-ai/minimax/hailuo-02/standard/text-to-video': {
    input: SchemaMinimaxHailuo02StandardTextToVideoInput
    output: SchemaMinimaxHailuo02StandardTextToVideoOutput
  }
  'fal-ai/veo3': {
    input: SchemaVeo3Input
    output: SchemaVeo3Output
  }
  'fal-ai/kling-video/v2/master/text-to-video': {
    input: SchemaKlingVideoV2MasterTextToVideoInput
    output: SchemaKlingVideoV2MasterTextToVideoOutput
  }
  'fal-ai/pixverse/v5.6/text-to-video': {
    input: SchemaPixverseV56TextToVideoInput
    output: SchemaPixverseV56TextToVideoOutput
  }
  'fal-ai/ltx-2-19b/distilled/text-to-video/lora': {
    input: SchemaLtx219bDistilledTextToVideoLoraInput
    output: SchemaLtx219bDistilledTextToVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/distilled/text-to-video': {
    input: SchemaLtx219bDistilledTextToVideoInput
    output: SchemaLtx219bDistilledTextToVideoOutput
  }
  'fal-ai/ltx-2-19b/text-to-video/lora': {
    input: SchemaLtx219bTextToVideoLoraInput
    output: SchemaLtx219bTextToVideoLoraOutput
  }
  'fal-ai/ltx-2-19b/text-to-video': {
    input: SchemaLtx219bTextToVideoInput
    output: SchemaLtx219bTextToVideoOutput
  }
  'fal-ai/kandinsky5-pro/text-to-video': {
    input: SchemaKandinsky5ProTextToVideoInput
    output: SchemaKandinsky5ProTextToVideoOutput
  }
  'fal-ai/bytedance/seedance/v1.5/pro/text-to-video': {
    input: SchemaBytedanceSeedanceV15ProTextToVideoInput
    output: SchemaBytedanceSeedanceV15ProTextToVideoOutput
  }
  'wan/v2.6/text-to-video': {
    input: SchemaV26TextToVideoInput
    output: SchemaV26TextToVideoOutput
  }
  'veed/fabric-1.0/text': {
    input: SchemaFabric10TextInput
    output: SchemaFabric10TextOutput
  }
  'fal-ai/kling-video/v2.6/pro/text-to-video': {
    input: SchemaKlingVideoV26ProTextToVideoInput
    output: SchemaKlingVideoV26ProTextToVideoOutput
  }
  'fal-ai/pixverse/v5.5/text-to-video': {
    input: SchemaPixverseV55TextToVideoInput
    output: SchemaPixverseV55TextToVideoOutput
  }
  'fal-ai/ltx-2/text-to-video/fast': {
    input: SchemaLtx2TextToVideoFastInput
    output: SchemaLtx2TextToVideoFastOutput
  }
  'fal-ai/ltx-2/text-to-video': {
    input: SchemaLtx2TextToVideoInput
    output: SchemaLtx2TextToVideoOutput
  }
  'fal-ai/hunyuan-video-v1.5/text-to-video': {
    input: SchemaHunyuanVideoV15TextToVideoInput
    output: SchemaHunyuanVideoV15TextToVideoOutput
  }
  'fal-ai/infinity-star/text-to-video': {
    input: SchemaInfinityStarTextToVideoInput
    output: SchemaInfinityStarTextToVideoOutput
  }
  'fal-ai/sana-video': {
    input: SchemaSanaVideoInput
    output: SchemaSanaVideoOutput
  }
  'fal-ai/longcat-video/text-to-video/720p': {
    input: SchemaLongcatVideoTextToVideo720pInput
    output: SchemaLongcatVideoTextToVideo720pOutput
  }
  'fal-ai/longcat-video/text-to-video/480p': {
    input: SchemaLongcatVideoTextToVideo480pInput
    output: SchemaLongcatVideoTextToVideo480pOutput
  }
  'fal-ai/longcat-video/distilled/text-to-video/720p': {
    input: SchemaLongcatVideoDistilledTextToVideo720pInput
    output: SchemaLongcatVideoDistilledTextToVideo720pOutput
  }
  'fal-ai/longcat-video/distilled/text-to-video/480p': {
    input: SchemaLongcatVideoDistilledTextToVideo480pInput
    output: SchemaLongcatVideoDistilledTextToVideo480pOutput
  }
  'fal-ai/minimax/hailuo-2.3/standard/text-to-video': {
    input: SchemaMinimaxHailuo23StandardTextToVideoInput
    output: SchemaMinimaxHailuo23StandardTextToVideoOutput
  }
  'fal-ai/minimax/hailuo-2.3/pro/text-to-video': {
    input: SchemaMinimaxHailuo23ProTextToVideoInput
    output: SchemaMinimaxHailuo23ProTextToVideoOutput
  }
  'fal-ai/bytedance/seedance/v1/pro/fast/text-to-video': {
    input: SchemaBytedanceSeedanceV1ProFastTextToVideoInput
    output: SchemaBytedanceSeedanceV1ProFastTextToVideoOutput
  }
  'fal-ai/vidu/q2/text-to-video': {
    input: SchemaViduQ2TextToVideoInput
    output: SchemaViduQ2TextToVideoOutput
  }
  'fal-ai/krea-wan-14b/text-to-video': {
    input: SchemaKreaWan14bTextToVideoInput
    output: SchemaKreaWan14bTextToVideoOutput
  }
  'fal-ai/wan-alpha': {
    input: SchemaWanAlphaInput
    output: SchemaWanAlphaOutput
  }
  'fal-ai/kandinsky5/text-to-video/distill': {
    input: SchemaKandinsky5TextToVideoDistillInput
    output: SchemaKandinsky5TextToVideoDistillOutput
  }
  'fal-ai/kandinsky5/text-to-video': {
    input: SchemaKandinsky5TextToVideoInput
    output: SchemaKandinsky5TextToVideoOutput
  }
  'fal-ai/veo3.1/fast': {
    input: SchemaVeo31FastInput
    output: SchemaVeo31FastOutput
  }
  'fal-ai/veo3.1': {
    input: SchemaVeo31Input
    output: SchemaVeo31Output
  }
  'fal-ai/sora-2/text-to-video/pro': {
    input: SchemaSora2TextToVideoProInput
    output: SchemaSora2TextToVideoProOutput
  }
  'fal-ai/sora-2/text-to-video': {
    input: SchemaSora2TextToVideoInput
    output: SchemaSora2TextToVideoOutput
  }
  'fal-ai/ovi': {
    input: SchemaOviInput
    output: SchemaOviOutput
  }
  'fal-ai/wan-25-preview/text-to-video': {
    input: SchemaWan25PreviewTextToVideoInput
    output: SchemaWan25PreviewTextToVideoOutput
  }
  'argil/avatars/text-to-video': {
    input: SchemaAvatarsTextToVideoInput
    output: SchemaAvatarsTextToVideoOutput
  }
  'fal-ai/pixverse/v5/text-to-video': {
    input: SchemaPixverseV5TextToVideoInput
    output: SchemaPixverseV5TextToVideoOutput
  }
  'fal-ai/infinitalk/single-text': {
    input: SchemaInfinitalkSingleTextInput
    output: SchemaInfinitalkSingleTextOutput
  }
  'moonvalley/marey/t2v': {
    input: SchemaMareyT2vInput
    output: SchemaMareyT2vOutput
  }
  'fal-ai/wan/v2.2-a14b/text-to-video/lora': {
    input: SchemaWanV22A14bTextToVideoLoraInput
    output: SchemaWanV22A14bTextToVideoLoraOutput
  }
  'fal-ai/wan/v2.2-5b/text-to-video/distill': {
    input: SchemaWanV225bTextToVideoDistillInput
    output: SchemaWanV225bTextToVideoDistillOutput
  }
  'fal-ai/wan/v2.2-5b/text-to-video/fast-wan': {
    input: SchemaWanV225bTextToVideoFastWanInput
    output: SchemaWanV225bTextToVideoFastWanOutput
  }
  'fal-ai/wan/v2.2-a14b/text-to-video/turbo': {
    input: SchemaWanV22A14bTextToVideoTurboInput
    output: SchemaWanV22A14bTextToVideoTurboOutput
  }
  'fal-ai/wan/v2.2-5b/text-to-video': {
    input: SchemaWanV225bTextToVideoInput
    output: SchemaWanV225bTextToVideoOutput
  }
  'fal-ai/wan/v2.2-a14b/text-to-video': {
    input: SchemaWanV22A14bTextToVideoInput
    output: SchemaWanV22A14bTextToVideoOutput
  }
  'fal-ai/ltxv-13b-098-distilled': {
    input: SchemaLtxv13B098DistilledInput
    output: SchemaLtxv13B098DistilledOutput
  }
  'fal-ai/minimax/hailuo-02/pro/text-to-video': {
    input: SchemaMinimaxHailuo02ProTextToVideoInput
    output: SchemaMinimaxHailuo02ProTextToVideoOutput
  }
  'fal-ai/bytedance/seedance/v1/pro/text-to-video': {
    input: SchemaBytedanceSeedanceV1ProTextToVideoInput
    output: SchemaBytedanceSeedanceV1ProTextToVideoOutput
  }
  'fal-ai/bytedance/seedance/v1/lite/text-to-video': {
    input: SchemaBytedanceSeedanceV1LiteTextToVideoInput
    output: SchemaBytedanceSeedanceV1LiteTextToVideoOutput
  }
  'fal-ai/kling-video/v2.1/master/text-to-video': {
    input: SchemaKlingVideoV21MasterTextToVideoInput
    output: SchemaKlingVideoV21MasterTextToVideoOutput
  }
  'veed/avatars/text-to-video': {
    input: SchemaAvatarsTextToVideoInput
    output: SchemaAvatarsTextToVideoOutput
  }
  'fal-ai/ltx-video-13b-dev': {
    input: SchemaLtxVideo13bDevInput
    output: SchemaLtxVideo13bDevOutput
  }
  'fal-ai/ltx-video-13b-distilled': {
    input: SchemaLtxVideo13bDistilledInput
    output: SchemaLtxVideo13bDistilledOutput
  }
  'fal-ai/pixverse/v4.5/text-to-video/fast': {
    input: SchemaPixverseV45TextToVideoFastInput
    output: SchemaPixverseV45TextToVideoFastOutput
  }
  'fal-ai/pixverse/v4.5/text-to-video': {
    input: SchemaPixverseV45TextToVideoInput
    output: SchemaPixverseV45TextToVideoOutput
  }
  'fal-ai/vidu/q1/text-to-video': {
    input: SchemaViduQ1TextToVideoInput
    output: SchemaViduQ1TextToVideoOutput
  }
  'fal-ai/magi': {
    input: SchemaMagiInput
    output: SchemaMagiOutput
  }
  'fal-ai/magi-distilled': {
    input: SchemaMagiDistilledInput
    output: SchemaMagiDistilledOutput
  }
  'fal-ai/pixverse/v4/text-to-video': {
    input: SchemaPixverseV4TextToVideoInput
    output: SchemaPixverseV4TextToVideoOutput
  }
  'fal-ai/pixverse/v4/text-to-video/fast': {
    input: SchemaPixverseV4TextToVideoFastInput
    output: SchemaPixverseV4TextToVideoFastOutput
  }
  'fal-ai/kling-video/lipsync/audio-to-video': {
    input: SchemaKlingVideoLipsyncAudioToVideoInput
    output: SchemaKlingVideoLipsyncAudioToVideoOutput
  }
  'fal-ai/kling-video/lipsync/text-to-video': {
    input: SchemaKlingVideoLipsyncTextToVideoInput
    output: SchemaKlingVideoLipsyncTextToVideoOutput
  }
  'fal-ai/wan-t2v-lora': {
    input: SchemaWanT2vLoraInput
    output: SchemaWanT2vLoraOutput
  }
  'fal-ai/luma-dream-machine/ray-2-flash': {
    input: SchemaLumaDreamMachineRay2FlashInput
    output: SchemaLumaDreamMachineRay2FlashOutput
  }
  'fal-ai/pika/v2/turbo/text-to-video': {
    input: SchemaPikaV2TurboTextToVideoInput
    output: SchemaPikaV2TurboTextToVideoOutput
  }
  'fal-ai/pika/v2.1/text-to-video': {
    input: SchemaPikaV21TextToVideoInput
    output: SchemaPikaV21TextToVideoOutput
  }
  'fal-ai/pika/v2.2/text-to-video': {
    input: SchemaPikaV22TextToVideoInput
    output: SchemaPikaV22TextToVideoOutput
  }
  'fal-ai/wan-pro/text-to-video': {
    input: SchemaWanProTextToVideoInput
    output: SchemaWanProTextToVideoOutput
  }
  'fal-ai/kling-video/v1.5/pro/effects': {
    input: SchemaKlingVideoV15ProEffectsInput
    output: SchemaKlingVideoV15ProEffectsOutput
  }
  'fal-ai/kling-video/v1.6/pro/effects': {
    input: SchemaKlingVideoV16ProEffectsInput
    output: SchemaKlingVideoV16ProEffectsOutput
  }
  'fal-ai/kling-video/v1/standard/effects': {
    input: SchemaKlingVideoV1StandardEffectsInput
    output: SchemaKlingVideoV1StandardEffectsOutput
  }
  'fal-ai/kling-video/v1.6/standard/effects': {
    input: SchemaKlingVideoV16StandardEffectsInput
    output: SchemaKlingVideoV16StandardEffectsOutput
  }
  'fal-ai/ltx-video-v095': {
    input: SchemaLtxVideoV095Input
    output: SchemaLtxVideoV095Output
  }
  'fal-ai/kling-video/v1.6/pro/text-to-video': {
    input: SchemaKlingVideoV16ProTextToVideoInput
    output: SchemaKlingVideoV16ProTextToVideoOutput
  }
  'fal-ai/wan-t2v': {
    input: SchemaWanT2vInput
    output: SchemaWanT2vOutput
  }
  'fal-ai/veo2': {
    input: SchemaVeo2Input
    output: SchemaVeo2Output
  }
  'fal-ai/minimax/video-01-director': {
    input: SchemaMinimaxVideo01DirectorInput
    output: SchemaMinimaxVideo01DirectorOutput
  }
  'fal-ai/pixverse/v3.5/text-to-video': {
    input: SchemaPixverseV35TextToVideoInput
    output: SchemaPixverseV35TextToVideoOutput
  }
  'fal-ai/pixverse/v3.5/text-to-video/fast': {
    input: SchemaPixverseV35TextToVideoFastInput
    output: SchemaPixverseV35TextToVideoFastOutput
  }
  'fal-ai/luma-dream-machine/ray-2': {
    input: SchemaLumaDreamMachineRay2Input
    output: SchemaLumaDreamMachineRay2Output
  }
  'fal-ai/hunyuan-video-lora': {
    input: SchemaHunyuanVideoLoraInput
    output: SchemaHunyuanVideoLoraOutput
  }
  'fal-ai/transpixar': {
    input: SchemaTranspixarInput
    output: SchemaTranspixarOutput
  }
  'fal-ai/cogvideox-5b': {
    input: SchemaCogvideox5bInput
    output: SchemaCogvideox5bOutput
  }
  'fal-ai/kling-video/v1.6/standard/text-to-video': {
    input: SchemaKlingVideoV16StandardTextToVideoInput
    output: SchemaKlingVideoV16StandardTextToVideoOutput
  }
  'fal-ai/minimax/video-01-live': {
    input: SchemaMinimaxVideo01LiveInput
    output: SchemaMinimaxVideo01LiveOutput
  }
  'fal-ai/kling-video/v1/standard/text-to-video': {
    input: SchemaKlingVideoV1StandardTextToVideoInput
    output: SchemaKlingVideoV1StandardTextToVideoOutput
  }
  'fal-ai/kling-video/v1.5/pro/text-to-video': {
    input: SchemaKlingVideoV15ProTextToVideoInput
    output: SchemaKlingVideoV15ProTextToVideoOutput
  }
  'fal-ai/mochi-v1': {
    input: SchemaMochiV1Input
    output: SchemaMochiV1Output
  }
  'fal-ai/hunyuan-video': {
    input: SchemaHunyuanVideoInput
    output: SchemaHunyuanVideoOutput
  }
  'fal-ai/ltx-video': {
    input: SchemaLtxVideoInput
    output: SchemaLtxVideoOutput
  }
  'fal-ai/fast-svd/text-to-video': {
    input: SchemaFastSvdTextToVideoInput
    output: SchemaFastSvdTextToVideoOutput
  }
  'fal-ai/fast-svd-lcm/text-to-video': {
    input: SchemaFastSvdLcmTextToVideoInput
    output: SchemaFastSvdLcmTextToVideoOutput
  }
  'fal-ai/t2v-turbo': {
    input: SchemaT2vTurboInput
    output: SchemaT2vTurboOutput
  }
  'fal-ai/fast-animatediff/text-to-video': {
    input: SchemaFastAnimatediffTextToVideoInput
    output: SchemaFastAnimatediffTextToVideoOutput
  }
  'fal-ai/fast-animatediff/turbo/text-to-video': {
    input: SchemaFastAnimatediffTurboTextToVideoInput
    output: SchemaFastAnimatediffTurboTextToVideoOutput
  }
  'fal-ai/minimax/video-01': {
    input: SchemaMinimaxVideo01Input
    output: SchemaMinimaxVideo01Output
  }
  'fal-ai/animatediff-sparsectrl-lcm': {
    input: SchemaAnimatediffSparsectrlLcmInput
    output: SchemaAnimatediffSparsectrlLcmOutput
  }
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

/** Union type of all video model endpoint IDs */
export type VideoModel = keyof VideoEndpointMap

export const VideoSchemaMap: Record<
  VideoModel,
  {
    input: z.ZodSchema<VideoModelInput<VideoModel>>
    output: z.ZodSchema<VideoModelOutput<VideoModel>>
  }
> = {
  ['fal-ai/ltx-2-19b/distilled/audio-to-video/lora']: {
    input: zSchemaLtx219bDistilledAudioToVideoLoraInput,
    output: zSchemaLtx219bDistilledAudioToVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/audio-to-video/lora']: {
    input: zSchemaLtx219bAudioToVideoLoraInput,
    output: zSchemaLtx219bAudioToVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/distilled/audio-to-video']: {
    input: zSchemaLtx219bDistilledAudioToVideoInput,
    output: zSchemaLtx219bDistilledAudioToVideoOutput,
  },
  ['fal-ai/ltx-2-19b/audio-to-video']: {
    input: zSchemaLtx219bAudioToVideoInput,
    output: zSchemaLtx219bAudioToVideoOutput,
  },
  ['fal-ai/elevenlabs/dubbing']: {
    input: zSchemaElevenlabsDubbingInput,
    output: zSchemaElevenlabsDubbingOutput,
  },
  ['fal-ai/longcat-multi-avatar/image-audio-to-video']: {
    input: zSchemaLongcatMultiAvatarImageAudioToVideoInput,
    output: zSchemaLongcatMultiAvatarImageAudioToVideoOutput,
  },
  ['fal-ai/longcat-single-avatar/image-audio-to-video']: {
    input: zSchemaLongcatSingleAvatarImageAudioToVideoInput,
    output: zSchemaLongcatSingleAvatarImageAudioToVideoOutput,
  },
  ['fal-ai/longcat-single-avatar/audio-to-video']: {
    input: zSchemaLongcatSingleAvatarAudioToVideoInput,
    output: zSchemaLongcatSingleAvatarAudioToVideoOutput,
  },
  ['argil/avatars/audio-to-video']: {
    input: zSchemaAvatarsAudioToVideoInput,
    output: zSchemaAvatarsAudioToVideoOutput,
  },
  ['fal-ai/wan/v2.2-14b/speech-to-video']: {
    input: zSchemaWanV2214bSpeechToVideoInput,
    output: zSchemaWanV2214bSpeechToVideoOutput,
  },
  ['fal-ai/stable-avatar']: {
    input: zSchemaStableAvatarInput,
    output: zSchemaStableAvatarOutput,
  },
  ['fal-ai/echomimic-v3']: {
    input: zSchemaEchomimicV3Input,
    output: zSchemaEchomimicV3Output,
  },
  ['veed/avatars/audio-to-video']: {
    input: zSchemaAvatarsAudioToVideoInput,
    output: zSchemaAvatarsAudioToVideoOutput,
  },
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
  ['fal-ai/kling-video/v2.5-turbo/pro/text-to-video']: {
    input: zSchemaKlingVideoV25TurboProTextToVideoInput,
    output: zSchemaKlingVideoV25TurboProTextToVideoOutput,
  },
  ['fal-ai/veo3/fast']: {
    input: zSchemaVeo3FastInput,
    output: zSchemaVeo3FastOutput,
  },
  ['fal-ai/minimax/hailuo-02/standard/text-to-video']: {
    input: zSchemaMinimaxHailuo02StandardTextToVideoInput,
    output: zSchemaMinimaxHailuo02StandardTextToVideoOutput,
  },
  ['fal-ai/veo3']: {
    input: zSchemaVeo3Input,
    output: zSchemaVeo3Output,
  },
  ['fal-ai/kling-video/v2/master/text-to-video']: {
    input: zSchemaKlingVideoV2MasterTextToVideoInput,
    output: zSchemaKlingVideoV2MasterTextToVideoOutput,
  },
  ['fal-ai/pixverse/v5.6/text-to-video']: {
    input: zSchemaPixverseV56TextToVideoInput,
    output: zSchemaPixverseV56TextToVideoOutput,
  },
  ['fal-ai/ltx-2-19b/distilled/text-to-video/lora']: {
    input: zSchemaLtx219bDistilledTextToVideoLoraInput,
    output: zSchemaLtx219bDistilledTextToVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/distilled/text-to-video']: {
    input: zSchemaLtx219bDistilledTextToVideoInput,
    output: zSchemaLtx219bDistilledTextToVideoOutput,
  },
  ['fal-ai/ltx-2-19b/text-to-video/lora']: {
    input: zSchemaLtx219bTextToVideoLoraInput,
    output: zSchemaLtx219bTextToVideoLoraOutput,
  },
  ['fal-ai/ltx-2-19b/text-to-video']: {
    input: zSchemaLtx219bTextToVideoInput,
    output: zSchemaLtx219bTextToVideoOutput,
  },
  ['fal-ai/kandinsky5-pro/text-to-video']: {
    input: zSchemaKandinsky5ProTextToVideoInput,
    output: zSchemaKandinsky5ProTextToVideoOutput,
  },
  ['fal-ai/bytedance/seedance/v1.5/pro/text-to-video']: {
    input: zSchemaBytedanceSeedanceV15ProTextToVideoInput,
    output: zSchemaBytedanceSeedanceV15ProTextToVideoOutput,
  },
  ['wan/v2.6/text-to-video']: {
    input: zSchemaV26TextToVideoInput,
    output: zSchemaV26TextToVideoOutput,
  },
  ['veed/fabric-1.0/text']: {
    input: zSchemaFabric10TextInput,
    output: zSchemaFabric10TextOutput,
  },
  ['fal-ai/kling-video/v2.6/pro/text-to-video']: {
    input: zSchemaKlingVideoV26ProTextToVideoInput,
    output: zSchemaKlingVideoV26ProTextToVideoOutput,
  },
  ['fal-ai/pixverse/v5.5/text-to-video']: {
    input: zSchemaPixverseV55TextToVideoInput,
    output: zSchemaPixverseV55TextToVideoOutput,
  },
  ['fal-ai/ltx-2/text-to-video/fast']: {
    input: zSchemaLtx2TextToVideoFastInput,
    output: zSchemaLtx2TextToVideoFastOutput,
  },
  ['fal-ai/ltx-2/text-to-video']: {
    input: zSchemaLtx2TextToVideoInput,
    output: zSchemaLtx2TextToVideoOutput,
  },
  ['fal-ai/hunyuan-video-v1.5/text-to-video']: {
    input: zSchemaHunyuanVideoV15TextToVideoInput,
    output: zSchemaHunyuanVideoV15TextToVideoOutput,
  },
  ['fal-ai/infinity-star/text-to-video']: {
    input: zSchemaInfinityStarTextToVideoInput,
    output: zSchemaInfinityStarTextToVideoOutput,
  },
  ['fal-ai/sana-video']: {
    input: zSchemaSanaVideoInput,
    output: zSchemaSanaVideoOutput,
  },
  ['fal-ai/longcat-video/text-to-video/720p']: {
    input: zSchemaLongcatVideoTextToVideo720pInput,
    output: zSchemaLongcatVideoTextToVideo720pOutput,
  },
  ['fal-ai/longcat-video/text-to-video/480p']: {
    input: zSchemaLongcatVideoTextToVideo480pInput,
    output: zSchemaLongcatVideoTextToVideo480pOutput,
  },
  ['fal-ai/longcat-video/distilled/text-to-video/720p']: {
    input: zSchemaLongcatVideoDistilledTextToVideo720pInput,
    output: zSchemaLongcatVideoDistilledTextToVideo720pOutput,
  },
  ['fal-ai/longcat-video/distilled/text-to-video/480p']: {
    input: zSchemaLongcatVideoDistilledTextToVideo480pInput,
    output: zSchemaLongcatVideoDistilledTextToVideo480pOutput,
  },
  ['fal-ai/minimax/hailuo-2.3/standard/text-to-video']: {
    input: zSchemaMinimaxHailuo23StandardTextToVideoInput,
    output: zSchemaMinimaxHailuo23StandardTextToVideoOutput,
  },
  ['fal-ai/minimax/hailuo-2.3/pro/text-to-video']: {
    input: zSchemaMinimaxHailuo23ProTextToVideoInput,
    output: zSchemaMinimaxHailuo23ProTextToVideoOutput,
  },
  ['fal-ai/bytedance/seedance/v1/pro/fast/text-to-video']: {
    input: zSchemaBytedanceSeedanceV1ProFastTextToVideoInput,
    output: zSchemaBytedanceSeedanceV1ProFastTextToVideoOutput,
  },
  ['fal-ai/vidu/q2/text-to-video']: {
    input: zSchemaViduQ2TextToVideoInput,
    output: zSchemaViduQ2TextToVideoOutput,
  },
  ['fal-ai/krea-wan-14b/text-to-video']: {
    input: zSchemaKreaWan14bTextToVideoInput,
    output: zSchemaKreaWan14bTextToVideoOutput,
  },
  ['fal-ai/wan-alpha']: {
    input: zSchemaWanAlphaInput,
    output: zSchemaWanAlphaOutput,
  },
  ['fal-ai/kandinsky5/text-to-video/distill']: {
    input: zSchemaKandinsky5TextToVideoDistillInput,
    output: zSchemaKandinsky5TextToVideoDistillOutput,
  },
  ['fal-ai/kandinsky5/text-to-video']: {
    input: zSchemaKandinsky5TextToVideoInput,
    output: zSchemaKandinsky5TextToVideoOutput,
  },
  ['fal-ai/veo3.1/fast']: {
    input: zSchemaVeo31FastInput,
    output: zSchemaVeo31FastOutput,
  },
  ['fal-ai/veo3.1']: {
    input: zSchemaVeo31Input,
    output: zSchemaVeo31Output,
  },
  ['fal-ai/sora-2/text-to-video/pro']: {
    input: zSchemaSora2TextToVideoProInput,
    output: zSchemaSora2TextToVideoProOutput,
  },
  ['fal-ai/sora-2/text-to-video']: {
    input: zSchemaSora2TextToVideoInput,
    output: zSchemaSora2TextToVideoOutput,
  },
  ['fal-ai/ovi']: {
    input: zSchemaOviInput,
    output: zSchemaOviOutput,
  },
  ['fal-ai/wan-25-preview/text-to-video']: {
    input: zSchemaWan25PreviewTextToVideoInput,
    output: zSchemaWan25PreviewTextToVideoOutput,
  },
  ['argil/avatars/text-to-video']: {
    input: zSchemaAvatarsTextToVideoInput,
    output: zSchemaAvatarsTextToVideoOutput,
  },
  ['fal-ai/pixverse/v5/text-to-video']: {
    input: zSchemaPixverseV5TextToVideoInput,
    output: zSchemaPixverseV5TextToVideoOutput,
  },
  ['fal-ai/infinitalk/single-text']: {
    input: zSchemaInfinitalkSingleTextInput,
    output: zSchemaInfinitalkSingleTextOutput,
  },
  ['moonvalley/marey/t2v']: {
    input: zSchemaMareyT2vInput,
    output: zSchemaMareyT2vOutput,
  },
  ['fal-ai/wan/v2.2-a14b/text-to-video/lora']: {
    input: zSchemaWanV22A14bTextToVideoLoraInput,
    output: zSchemaWanV22A14bTextToVideoLoraOutput,
  },
  ['fal-ai/wan/v2.2-5b/text-to-video/distill']: {
    input: zSchemaWanV225bTextToVideoDistillInput,
    output: zSchemaWanV225bTextToVideoDistillOutput,
  },
  ['fal-ai/wan/v2.2-5b/text-to-video/fast-wan']: {
    input: zSchemaWanV225bTextToVideoFastWanInput,
    output: zSchemaWanV225bTextToVideoFastWanOutput,
  },
  ['fal-ai/wan/v2.2-a14b/text-to-video/turbo']: {
    input: zSchemaWanV22A14bTextToVideoTurboInput,
    output: zSchemaWanV22A14bTextToVideoTurboOutput,
  },
  ['fal-ai/wan/v2.2-5b/text-to-video']: {
    input: zSchemaWanV225bTextToVideoInput,
    output: zSchemaWanV225bTextToVideoOutput,
  },
  ['fal-ai/wan/v2.2-a14b/text-to-video']: {
    input: zSchemaWanV22A14bTextToVideoInput,
    output: zSchemaWanV22A14bTextToVideoOutput,
  },
  ['fal-ai/ltxv-13b-098-distilled']: {
    input: zSchemaLtxv13B098DistilledInput,
    output: zSchemaLtxv13B098DistilledOutput,
  },
  ['fal-ai/minimax/hailuo-02/pro/text-to-video']: {
    input: zSchemaMinimaxHailuo02ProTextToVideoInput,
    output: zSchemaMinimaxHailuo02ProTextToVideoOutput,
  },
  ['fal-ai/bytedance/seedance/v1/pro/text-to-video']: {
    input: zSchemaBytedanceSeedanceV1ProTextToVideoInput,
    output: zSchemaBytedanceSeedanceV1ProTextToVideoOutput,
  },
  ['fal-ai/bytedance/seedance/v1/lite/text-to-video']: {
    input: zSchemaBytedanceSeedanceV1LiteTextToVideoInput,
    output: zSchemaBytedanceSeedanceV1LiteTextToVideoOutput,
  },
  ['fal-ai/kling-video/v2.1/master/text-to-video']: {
    input: zSchemaKlingVideoV21MasterTextToVideoInput,
    output: zSchemaKlingVideoV21MasterTextToVideoOutput,
  },
  ['veed/avatars/text-to-video']: {
    input: zSchemaAvatarsTextToVideoInput,
    output: zSchemaAvatarsTextToVideoOutput,
  },
  ['fal-ai/ltx-video-13b-dev']: {
    input: zSchemaLtxVideo13bDevInput,
    output: zSchemaLtxVideo13bDevOutput,
  },
  ['fal-ai/ltx-video-13b-distilled']: {
    input: zSchemaLtxVideo13bDistilledInput,
    output: zSchemaLtxVideo13bDistilledOutput,
  },
  ['fal-ai/pixverse/v4.5/text-to-video/fast']: {
    input: zSchemaPixverseV45TextToVideoFastInput,
    output: zSchemaPixverseV45TextToVideoFastOutput,
  },
  ['fal-ai/pixverse/v4.5/text-to-video']: {
    input: zSchemaPixverseV45TextToVideoInput,
    output: zSchemaPixverseV45TextToVideoOutput,
  },
  ['fal-ai/vidu/q1/text-to-video']: {
    input: zSchemaViduQ1TextToVideoInput,
    output: zSchemaViduQ1TextToVideoOutput,
  },
  ['fal-ai/magi']: {
    input: zSchemaMagiInput,
    output: zSchemaMagiOutput,
  },
  ['fal-ai/magi-distilled']: {
    input: zSchemaMagiDistilledInput,
    output: zSchemaMagiDistilledOutput,
  },
  ['fal-ai/pixverse/v4/text-to-video']: {
    input: zSchemaPixverseV4TextToVideoInput,
    output: zSchemaPixverseV4TextToVideoOutput,
  },
  ['fal-ai/pixverse/v4/text-to-video/fast']: {
    input: zSchemaPixverseV4TextToVideoFastInput,
    output: zSchemaPixverseV4TextToVideoFastOutput,
  },
  ['fal-ai/kling-video/lipsync/audio-to-video']: {
    input: zSchemaKlingVideoLipsyncAudioToVideoInput,
    output: zSchemaKlingVideoLipsyncAudioToVideoOutput,
  },
  ['fal-ai/kling-video/lipsync/text-to-video']: {
    input: zSchemaKlingVideoLipsyncTextToVideoInput,
    output: zSchemaKlingVideoLipsyncTextToVideoOutput,
  },
  ['fal-ai/wan-t2v-lora']: {
    input: zSchemaWanT2vLoraInput,
    output: zSchemaWanT2vLoraOutput,
  },
  ['fal-ai/luma-dream-machine/ray-2-flash']: {
    input: zSchemaLumaDreamMachineRay2FlashInput,
    output: zSchemaLumaDreamMachineRay2FlashOutput,
  },
  ['fal-ai/pika/v2/turbo/text-to-video']: {
    input: zSchemaPikaV2TurboTextToVideoInput,
    output: zSchemaPikaV2TurboTextToVideoOutput,
  },
  ['fal-ai/pika/v2.1/text-to-video']: {
    input: zSchemaPikaV21TextToVideoInput,
    output: zSchemaPikaV21TextToVideoOutput,
  },
  ['fal-ai/pika/v2.2/text-to-video']: {
    input: zSchemaPikaV22TextToVideoInput,
    output: zSchemaPikaV22TextToVideoOutput,
  },
  ['fal-ai/wan-pro/text-to-video']: {
    input: zSchemaWanProTextToVideoInput,
    output: zSchemaWanProTextToVideoOutput,
  },
  ['fal-ai/kling-video/v1.5/pro/effects']: {
    input: zSchemaKlingVideoV15ProEffectsInput,
    output: zSchemaKlingVideoV15ProEffectsOutput,
  },
  ['fal-ai/kling-video/v1.6/pro/effects']: {
    input: zSchemaKlingVideoV16ProEffectsInput,
    output: zSchemaKlingVideoV16ProEffectsOutput,
  },
  ['fal-ai/kling-video/v1/standard/effects']: {
    input: zSchemaKlingVideoV1StandardEffectsInput,
    output: zSchemaKlingVideoV1StandardEffectsOutput,
  },
  ['fal-ai/kling-video/v1.6/standard/effects']: {
    input: zSchemaKlingVideoV16StandardEffectsInput,
    output: zSchemaKlingVideoV16StandardEffectsOutput,
  },
  ['fal-ai/ltx-video-v095']: {
    input: zSchemaLtxVideoV095Input,
    output: zSchemaLtxVideoV095Output,
  },
  ['fal-ai/kling-video/v1.6/pro/text-to-video']: {
    input: zSchemaKlingVideoV16ProTextToVideoInput,
    output: zSchemaKlingVideoV16ProTextToVideoOutput,
  },
  ['fal-ai/wan-t2v']: {
    input: zSchemaWanT2vInput,
    output: zSchemaWanT2vOutput,
  },
  ['fal-ai/veo2']: {
    input: zSchemaVeo2Input,
    output: zSchemaVeo2Output,
  },
  ['fal-ai/minimax/video-01-director']: {
    input: zSchemaMinimaxVideo01DirectorInput,
    output: zSchemaMinimaxVideo01DirectorOutput,
  },
  ['fal-ai/pixverse/v3.5/text-to-video']: {
    input: zSchemaPixverseV35TextToVideoInput,
    output: zSchemaPixverseV35TextToVideoOutput,
  },
  ['fal-ai/pixverse/v3.5/text-to-video/fast']: {
    input: zSchemaPixverseV35TextToVideoFastInput,
    output: zSchemaPixverseV35TextToVideoFastOutput,
  },
  ['fal-ai/luma-dream-machine/ray-2']: {
    input: zSchemaLumaDreamMachineRay2Input,
    output: zSchemaLumaDreamMachineRay2Output,
  },
  ['fal-ai/hunyuan-video-lora']: {
    input: zSchemaHunyuanVideoLoraInput,
    output: zSchemaHunyuanVideoLoraOutput,
  },
  ['fal-ai/transpixar']: {
    input: zSchemaTranspixarInput,
    output: zSchemaTranspixarOutput,
  },
  ['fal-ai/cogvideox-5b']: {
    input: zSchemaCogvideox5bInput,
    output: zSchemaCogvideox5bOutput,
  },
  ['fal-ai/kling-video/v1.6/standard/text-to-video']: {
    input: zSchemaKlingVideoV16StandardTextToVideoInput,
    output: zSchemaKlingVideoV16StandardTextToVideoOutput,
  },
  ['fal-ai/minimax/video-01-live']: {
    input: zSchemaMinimaxVideo01LiveInput,
    output: zSchemaMinimaxVideo01LiveOutput,
  },
  ['fal-ai/kling-video/v1/standard/text-to-video']: {
    input: zSchemaKlingVideoV1StandardTextToVideoInput,
    output: zSchemaKlingVideoV1StandardTextToVideoOutput,
  },
  ['fal-ai/kling-video/v1.5/pro/text-to-video']: {
    input: zSchemaKlingVideoV15ProTextToVideoInput,
    output: zSchemaKlingVideoV15ProTextToVideoOutput,
  },
  ['fal-ai/mochi-v1']: {
    input: zSchemaMochiV1Input,
    output: zSchemaMochiV1Output,
  },
  ['fal-ai/hunyuan-video']: {
    input: zSchemaHunyuanVideoInput,
    output: zSchemaHunyuanVideoOutput,
  },
  ['fal-ai/ltx-video']: {
    input: zSchemaLtxVideoInput,
    output: zSchemaLtxVideoOutput,
  },
  ['fal-ai/fast-svd/text-to-video']: {
    input: zSchemaFastSvdTextToVideoInput,
    output: zSchemaFastSvdTextToVideoOutput,
  },
  ['fal-ai/fast-svd-lcm/text-to-video']: {
    input: zSchemaFastSvdLcmTextToVideoInput,
    output: zSchemaFastSvdLcmTextToVideoOutput,
  },
  ['fal-ai/t2v-turbo']: {
    input: zSchemaT2vTurboInput,
    output: zSchemaT2vTurboOutput,
  },
  ['fal-ai/fast-animatediff/text-to-video']: {
    input: zSchemaFastAnimatediffTextToVideoInput,
    output: zSchemaFastAnimatediffTextToVideoOutput,
  },
  ['fal-ai/fast-animatediff/turbo/text-to-video']: {
    input: zSchemaFastAnimatediffTurboTextToVideoInput,
    output: zSchemaFastAnimatediffTurboTextToVideoOutput,
  },
  ['fal-ai/minimax/video-01']: {
    input: zSchemaMinimaxVideo01Input,
    output: zSchemaMinimaxVideo01Output,
  },
  ['fal-ai/animatediff-sparsectrl-lcm']: {
    input: zSchemaAnimatediffSparsectrlLcmInput,
    output: zSchemaAnimatediffSparsectrlLcmOutput,
  },
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
}

/** Get the input type for a specific video model */
export type VideoModelInput<T extends VideoModel> = VideoEndpointMap[T]['input']

/** Get the output type for a specific video model */
export type VideoModelOutput<T extends VideoModel> =
  VideoEndpointMap[T]['output']
