// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaAuraFlowInput,
  zSchemaAuraFlowOutput,
  zSchemaBagelInput,
  zSchemaBagelOutput,
  zSchemaBriaTextToImageBaseInput,
  zSchemaBriaTextToImageBaseOutput,
  zSchemaBriaTextToImageFastInput,
  zSchemaBriaTextToImageFastOutput,
  zSchemaBriaTextToImageHdInput,
  zSchemaBriaTextToImageHdOutput,
  zSchemaBytedanceDreaminaV31TextToImageInput,
  zSchemaBytedanceDreaminaV31TextToImageOutput,
  zSchemaBytedanceSeedreamV3TextToImageInput,
  zSchemaBytedanceSeedreamV3TextToImageOutput,
  zSchemaBytedanceSeedreamV45TextToImageInput,
  zSchemaBytedanceSeedreamV45TextToImageOutput,
  zSchemaBytedanceSeedreamV4TextToImageInput,
  zSchemaBytedanceSeedreamV4TextToImageOutput,
  zSchemaCogview4Input,
  zSchemaCogview4Output,
  zSchemaDiffusionEdgeInput,
  zSchemaDiffusionEdgeOutput,
  zSchemaDreamoInput,
  zSchemaDreamoOutput,
  zSchemaDreamshaperInput,
  zSchemaDreamshaperOutput,
  zSchemaEmu35ImageTextToImageInput,
  zSchemaEmu35ImageTextToImageOutput,
  zSchemaFLiteStandardInput,
  zSchemaFLiteStandardOutput,
  zSchemaFLiteTextureInput,
  zSchemaFLiteTextureOutput,
  zSchemaFastFooocusSdxlImageToImageInput,
  zSchemaFastFooocusSdxlImageToImageOutput,
  zSchemaFastFooocusSdxlInput,
  zSchemaFastFooocusSdxlOutput,
  zSchemaFastLcmDiffusionInput,
  zSchemaFastLcmDiffusionOutput,
  zSchemaFastLightningSdxlInput,
  zSchemaFastLightningSdxlOutput,
  zSchemaFastSdxlControlnetCannyInput,
  zSchemaFastSdxlControlnetCannyOutput,
  zSchemaFastSdxlInput,
  zSchemaFastSdxlOutput,
  zSchemaFiboGenerateInput,
  zSchemaFiboGenerateOutput,
  zSchemaFiboLiteGenerateInput,
  zSchemaFiboLiteGenerateOutput,
  zSchemaFlux1DevInput,
  zSchemaFlux1DevOutput,
  zSchemaFlux1KreaInput,
  zSchemaFlux1KreaOutput,
  zSchemaFlux1SchnellInput,
  zSchemaFlux1SchnellOutput,
  zSchemaFlux1SrpoInput,
  zSchemaFlux1SrpoOutput,
  zSchemaFlux2FlashInput,
  zSchemaFlux2FlashOutput,
  zSchemaFlux2FlexInput,
  zSchemaFlux2FlexOutput,
  zSchemaFlux2Input,
  zSchemaFlux2Klein4bBaseInput,
  zSchemaFlux2Klein4bBaseLoraInput,
  zSchemaFlux2Klein4bBaseLoraOutput,
  zSchemaFlux2Klein4bBaseOutput,
  zSchemaFlux2Klein4bInput,
  zSchemaFlux2Klein4bOutput,
  zSchemaFlux2Klein9bBaseInput,
  zSchemaFlux2Klein9bBaseLoraInput,
  zSchemaFlux2Klein9bBaseLoraOutput,
  zSchemaFlux2Klein9bBaseOutput,
  zSchemaFlux2Klein9bInput,
  zSchemaFlux2Klein9bOutput,
  zSchemaFlux2LoraGalleryBallpointPenSketchInput,
  zSchemaFlux2LoraGalleryBallpointPenSketchOutput,
  zSchemaFlux2LoraGalleryDigitalComicArtInput,
  zSchemaFlux2LoraGalleryDigitalComicArtOutput,
  zSchemaFlux2LoraGalleryHdrStyleInput,
  zSchemaFlux2LoraGalleryHdrStyleOutput,
  zSchemaFlux2LoraGalleryRealismInput,
  zSchemaFlux2LoraGalleryRealismOutput,
  zSchemaFlux2LoraGallerySatelliteViewStyleInput,
  zSchemaFlux2LoraGallerySatelliteViewStyleOutput,
  zSchemaFlux2LoraGallerySepiaVintageInput,
  zSchemaFlux2LoraGallerySepiaVintageOutput,
  zSchemaFlux2LoraInput,
  zSchemaFlux2LoraOutput,
  zSchemaFlux2MaxInput,
  zSchemaFlux2MaxOutput,
  zSchemaFlux2Output,
  zSchemaFlux2ProInput,
  zSchemaFlux2ProOutput,
  zSchemaFlux2TurboInput,
  zSchemaFlux2TurboOutput,
  zSchemaFluxControlLoraCannyInput,
  zSchemaFluxControlLoraCannyOutput,
  zSchemaFluxControlLoraDepthInput,
  zSchemaFluxControlLoraDepthOutput,
  zSchemaFluxDevInput,
  zSchemaFluxDevOutput,
  zSchemaFluxGeneralInput,
  zSchemaFluxGeneralOutput,
  zSchemaFluxKontextLoraTextToImageInput,
  zSchemaFluxKontextLoraTextToImageOutput,
  zSchemaFluxKreaInput,
  zSchemaFluxKreaLoraInput,
  zSchemaFluxKreaLoraOutput,
  zSchemaFluxKreaLoraStreamInput,
  zSchemaFluxKreaLoraStreamOutput,
  zSchemaFluxKreaOutput,
  zSchemaFluxLoraInpaintingInput,
  zSchemaFluxLoraInpaintingOutput,
  zSchemaFluxLoraInput,
  zSchemaFluxLoraOutput,
  zSchemaFluxLoraStreamInput,
  zSchemaFluxLoraStreamOutput,
  zSchemaFluxProKontextMaxTextToImageInput,
  zSchemaFluxProKontextMaxTextToImageOutput,
  zSchemaFluxProKontextTextToImageInput,
  zSchemaFluxProKontextTextToImageOutput,
  zSchemaFluxProV11Input,
  zSchemaFluxProV11Output,
  zSchemaFluxProV11UltraFinetunedInput,
  zSchemaFluxProV11UltraFinetunedOutput,
  zSchemaFluxProV11UltraInput,
  zSchemaFluxProV11UltraOutput,
  zSchemaFluxSchnellInput,
  zSchemaFluxSchnellOutput,
  zSchemaFluxSrpoInput,
  zSchemaFluxSrpoOutput,
  zSchemaFluxSubjectInput,
  zSchemaFluxSubjectOutput,
  zSchemaFooocusImagePromptInput,
  zSchemaFooocusImagePromptOutput,
  zSchemaFooocusInpaintInput,
  zSchemaFooocusInpaintOutput,
  zSchemaFooocusInput,
  zSchemaFooocusOutput,
  zSchemaFooocusUpscaleOrVaryInput,
  zSchemaFooocusUpscaleOrVaryOutput,
  zSchemaGemini25FlashImageInput,
  zSchemaGemini25FlashImageOutput,
  zSchemaGemini3ProImagePreviewInput,
  zSchemaGemini3ProImagePreviewOutput,
  zSchemaGlmImageInput,
  zSchemaGlmImageOutput,
  zSchemaGptImage15Input,
  zSchemaGptImage15Output,
  zSchemaGptImage1MiniInput,
  zSchemaGptImage1MiniOutput,
  zSchemaGptImage1TextToImageInput,
  zSchemaGptImage1TextToImageOutput,
  zSchemaHidreamI1DevInput,
  zSchemaHidreamI1DevOutput,
  zSchemaHidreamI1FastInput,
  zSchemaHidreamI1FastOutput,
  zSchemaHidreamI1FullInput,
  zSchemaHidreamI1FullOutput,
  zSchemaHunyuanImageV21TextToImageInput,
  zSchemaHunyuanImageV21TextToImageOutput,
  zSchemaHunyuanImageV3TextToImageInput,
  zSchemaHunyuanImageV3TextToImageOutput,
  zSchemaIdeogramV2Input,
  zSchemaIdeogramV2Output,
  zSchemaIdeogramV2TurboInput,
  zSchemaIdeogramV2TurboOutput,
  zSchemaIdeogramV2aInput,
  zSchemaIdeogramV2aOutput,
  zSchemaIdeogramV2aTurboInput,
  zSchemaIdeogramV2aTurboOutput,
  zSchemaIdeogramV3Input,
  zSchemaIdeogramV3Output,
  zSchemaIllusionDiffusionInput,
  zSchemaIllusionDiffusionOutput,
  zSchemaImagen3FastInput,
  zSchemaImagen3FastOutput,
  zSchemaImagen3Input,
  zSchemaImagen3Output,
  zSchemaImagen4PreviewFastInput,
  zSchemaImagen4PreviewFastOutput,
  zSchemaImagen4PreviewInput,
  zSchemaImagen4PreviewOutput,
  zSchemaImagen4PreviewUltraInput,
  zSchemaImagen4PreviewUltraOutput,
  zSchemaImagineart15PreviewTextToImageInput,
  zSchemaImagineart15PreviewTextToImageOutput,
  zSchemaImagineart15ProPreviewTextToImageInput,
  zSchemaImagineart15ProPreviewTextToImageOutput,
  zSchemaJanusInput,
  zSchemaJanusOutput,
  zSchemaJuggernautFluxBaseInput,
  zSchemaJuggernautFluxBaseOutput,
  zSchemaJuggernautFluxLightningInput,
  zSchemaJuggernautFluxLightningOutput,
  zSchemaJuggernautFluxLoraInput,
  zSchemaJuggernautFluxLoraOutput,
  zSchemaJuggernautFluxProInput,
  zSchemaJuggernautFluxProOutput,
  zSchemaKolorsInput,
  zSchemaKolorsOutput,
  zSchemaLayerDiffusionInput,
  zSchemaLayerDiffusionOutput,
  zSchemaLcmInput,
  zSchemaLcmOutput,
  zSchemaLightningModelsInput,
  zSchemaLightningModelsOutput,
  zSchemaLongcatImageInput,
  zSchemaLongcatImageOutput,
  zSchemaLoraInput,
  zSchemaLoraOutput,
  zSchemaLumaPhotonFlashInput,
  zSchemaLumaPhotonFlashOutput,
  zSchemaLumaPhotonInput,
  zSchemaLumaPhotonOutput,
  zSchemaLuminaImageV2Input,
  zSchemaLuminaImageV2Output,
  zSchemaMinimaxImage01Input,
  zSchemaMinimaxImage01Output,
  zSchemaNanoBananaInput,
  zSchemaNanoBananaOutput,
  zSchemaNanoBananaProInput,
  zSchemaNanoBananaProOutput,
  zSchemaOmnigenV1Input,
  zSchemaOmnigenV1Output,
  zSchemaOmnigenV2Input,
  zSchemaOmnigenV2Output,
  zSchemaOvisImageInput,
  zSchemaOvisImageOutput,
  zSchemaPiflowInput,
  zSchemaPiflowOutput,
  zSchemaPixartSigmaInput,
  zSchemaPixartSigmaOutput,
  zSchemaPlaygroundV25Input,
  zSchemaPlaygroundV25Output,
  zSchemaPonyV7Input,
  zSchemaPonyV7Output,
  zSchemaQwenImage2512Input,
  zSchemaQwenImage2512LoraInput,
  zSchemaQwenImage2512LoraOutput,
  zSchemaQwenImage2512Output,
  zSchemaQwenImageInput,
  zSchemaQwenImageOutput,
  zSchemaRealisticVisionInput,
  zSchemaRealisticVisionOutput,
  zSchemaRecraft20bInput,
  zSchemaRecraft20bOutput,
  zSchemaRecraftV3TextToImageInput,
  zSchemaRecraftV3TextToImageOutput,
  zSchemaReveTextToImageInput,
  zSchemaReveTextToImageOutput,
  zSchemaRundiffusionPhotoFluxInput,
  zSchemaRundiffusionPhotoFluxOutput,
  zSchemaSanaInput,
  zSchemaSanaOutput,
  zSchemaSanaSprintInput,
  zSchemaSanaSprintOutput,
  zSchemaSanaV1516bInput,
  zSchemaSanaV1516bOutput,
  zSchemaSanaV1548bInput,
  zSchemaSanaV1548bOutput,
  zSchemaSdxlControlnetUnionInput,
  zSchemaSdxlControlnetUnionOutput,
  zSchemaSkyRaccoonInput,
  zSchemaSkyRaccoonOutput,
  zSchemaStableCascadeInput,
  zSchemaStableCascadeOutput,
  zSchemaStableCascadeSoteDiffusionInput,
  zSchemaStableCascadeSoteDiffusionOutput,
  zSchemaStableDiffusionV15Input,
  zSchemaStableDiffusionV15Output,
  zSchemaStableDiffusionV35LargeInput,
  zSchemaStableDiffusionV35LargeOutput,
  zSchemaStableDiffusionV35MediumInput,
  zSchemaStableDiffusionV35MediumOutput,
  zSchemaStableDiffusionV3MediumInput,
  zSchemaStableDiffusionV3MediumOutput,
  zSchemaSwitti512Input,
  zSchemaSwitti512Output,
  zSchemaSwittiInput,
  zSchemaSwittiOutput,
  zSchemaTextToImage32Input,
  zSchemaTextToImage32Output,
  zSchemaV26TextToImageInput,
  zSchemaV26TextToImageOutput,
  zSchemaViduQ2TextToImageInput,
  zSchemaViduQ2TextToImageOutput,
  zSchemaWan25PreviewTextToImageInput,
  zSchemaWan25PreviewTextToImageOutput,
  zSchemaWanV225bTextToImageInput,
  zSchemaWanV225bTextToImageOutput,
  zSchemaWanV22A14bTextToImageInput,
  zSchemaWanV22A14bTextToImageLoraInput,
  zSchemaWanV22A14bTextToImageLoraOutput,
  zSchemaWanV22A14bTextToImageOutput,
  zSchemaZImageBaseInput,
  zSchemaZImageBaseLoraInput,
  zSchemaZImageBaseLoraOutput,
  zSchemaZImageBaseOutput,
  zSchemaZImageTurboInput,
  zSchemaZImageTurboLoraInput,
  zSchemaZImageTurboLoraOutput,
  zSchemaZImageTurboOutput,
} from './zod.gen'

import type {
  SchemaAuraFlowInput,
  SchemaAuraFlowOutput,
  SchemaBagelInput,
  SchemaBagelOutput,
  SchemaBriaTextToImageBaseInput,
  SchemaBriaTextToImageBaseOutput,
  SchemaBriaTextToImageFastInput,
  SchemaBriaTextToImageFastOutput,
  SchemaBriaTextToImageHdInput,
  SchemaBriaTextToImageHdOutput,
  SchemaBytedanceDreaminaV31TextToImageInput,
  SchemaBytedanceDreaminaV31TextToImageOutput,
  SchemaBytedanceSeedreamV3TextToImageInput,
  SchemaBytedanceSeedreamV3TextToImageOutput,
  SchemaBytedanceSeedreamV45TextToImageInput,
  SchemaBytedanceSeedreamV45TextToImageOutput,
  SchemaBytedanceSeedreamV4TextToImageInput,
  SchemaBytedanceSeedreamV4TextToImageOutput,
  SchemaCogview4Input,
  SchemaCogview4Output,
  SchemaDiffusionEdgeInput,
  SchemaDiffusionEdgeOutput,
  SchemaDreamoInput,
  SchemaDreamoOutput,
  SchemaDreamshaperInput,
  SchemaDreamshaperOutput,
  SchemaEmu35ImageTextToImageInput,
  SchemaEmu35ImageTextToImageOutput,
  SchemaFLiteStandardInput,
  SchemaFLiteStandardOutput,
  SchemaFLiteTextureInput,
  SchemaFLiteTextureOutput,
  SchemaFastFooocusSdxlImageToImageInput,
  SchemaFastFooocusSdxlImageToImageOutput,
  SchemaFastFooocusSdxlInput,
  SchemaFastFooocusSdxlOutput,
  SchemaFastLcmDiffusionInput,
  SchemaFastLcmDiffusionOutput,
  SchemaFastLightningSdxlInput,
  SchemaFastLightningSdxlOutput,
  SchemaFastSdxlControlnetCannyInput,
  SchemaFastSdxlControlnetCannyOutput,
  SchemaFastSdxlInput,
  SchemaFastSdxlOutput,
  SchemaFiboGenerateInput,
  SchemaFiboGenerateOutput,
  SchemaFiboLiteGenerateInput,
  SchemaFiboLiteGenerateOutput,
  SchemaFlux1DevInput,
  SchemaFlux1DevOutput,
  SchemaFlux1KreaInput,
  SchemaFlux1KreaOutput,
  SchemaFlux1SchnellInput,
  SchemaFlux1SchnellOutput,
  SchemaFlux1SrpoInput,
  SchemaFlux1SrpoOutput,
  SchemaFlux2FlashInput,
  SchemaFlux2FlashOutput,
  SchemaFlux2FlexInput,
  SchemaFlux2FlexOutput,
  SchemaFlux2Input,
  SchemaFlux2Klein4bBaseInput,
  SchemaFlux2Klein4bBaseLoraInput,
  SchemaFlux2Klein4bBaseLoraOutput,
  SchemaFlux2Klein4bBaseOutput,
  SchemaFlux2Klein4bInput,
  SchemaFlux2Klein4bOutput,
  SchemaFlux2Klein9bBaseInput,
  SchemaFlux2Klein9bBaseLoraInput,
  SchemaFlux2Klein9bBaseLoraOutput,
  SchemaFlux2Klein9bBaseOutput,
  SchemaFlux2Klein9bInput,
  SchemaFlux2Klein9bOutput,
  SchemaFlux2LoraGalleryBallpointPenSketchInput,
  SchemaFlux2LoraGalleryBallpointPenSketchOutput,
  SchemaFlux2LoraGalleryDigitalComicArtInput,
  SchemaFlux2LoraGalleryDigitalComicArtOutput,
  SchemaFlux2LoraGalleryHdrStyleInput,
  SchemaFlux2LoraGalleryHdrStyleOutput,
  SchemaFlux2LoraGalleryRealismInput,
  SchemaFlux2LoraGalleryRealismOutput,
  SchemaFlux2LoraGallerySatelliteViewStyleInput,
  SchemaFlux2LoraGallerySatelliteViewStyleOutput,
  SchemaFlux2LoraGallerySepiaVintageInput,
  SchemaFlux2LoraGallerySepiaVintageOutput,
  SchemaFlux2LoraInput,
  SchemaFlux2LoraOutput,
  SchemaFlux2MaxInput,
  SchemaFlux2MaxOutput,
  SchemaFlux2Output,
  SchemaFlux2ProInput,
  SchemaFlux2ProOutput,
  SchemaFlux2TurboInput,
  SchemaFlux2TurboOutput,
  SchemaFluxControlLoraCannyInput,
  SchemaFluxControlLoraCannyOutput,
  SchemaFluxControlLoraDepthInput,
  SchemaFluxControlLoraDepthOutput,
  SchemaFluxDevInput,
  SchemaFluxDevOutput,
  SchemaFluxGeneralInput,
  SchemaFluxGeneralOutput,
  SchemaFluxKontextLoraTextToImageInput,
  SchemaFluxKontextLoraTextToImageOutput,
  SchemaFluxKreaInput,
  SchemaFluxKreaLoraInput,
  SchemaFluxKreaLoraOutput,
  SchemaFluxKreaLoraStreamInput,
  SchemaFluxKreaLoraStreamOutput,
  SchemaFluxKreaOutput,
  SchemaFluxLoraInpaintingInput,
  SchemaFluxLoraInpaintingOutput,
  SchemaFluxLoraInput,
  SchemaFluxLoraOutput,
  SchemaFluxLoraStreamInput,
  SchemaFluxLoraStreamOutput,
  SchemaFluxProKontextMaxTextToImageInput,
  SchemaFluxProKontextMaxTextToImageOutput,
  SchemaFluxProKontextTextToImageInput,
  SchemaFluxProKontextTextToImageOutput,
  SchemaFluxProV11Input,
  SchemaFluxProV11Output,
  SchemaFluxProV11UltraFinetunedInput,
  SchemaFluxProV11UltraFinetunedOutput,
  SchemaFluxProV11UltraInput,
  SchemaFluxProV11UltraOutput,
  SchemaFluxSchnellInput,
  SchemaFluxSchnellOutput,
  SchemaFluxSrpoInput,
  SchemaFluxSrpoOutput,
  SchemaFluxSubjectInput,
  SchemaFluxSubjectOutput,
  SchemaFooocusImagePromptInput,
  SchemaFooocusImagePromptOutput,
  SchemaFooocusInpaintInput,
  SchemaFooocusInpaintOutput,
  SchemaFooocusInput,
  SchemaFooocusOutput,
  SchemaFooocusUpscaleOrVaryInput,
  SchemaFooocusUpscaleOrVaryOutput,
  SchemaGemini25FlashImageInput,
  SchemaGemini25FlashImageOutput,
  SchemaGemini3ProImagePreviewInput,
  SchemaGemini3ProImagePreviewOutput,
  SchemaGlmImageInput,
  SchemaGlmImageOutput,
  SchemaGptImage15Input,
  SchemaGptImage15Output,
  SchemaGptImage1MiniInput,
  SchemaGptImage1MiniOutput,
  SchemaGptImage1TextToImageInput,
  SchemaGptImage1TextToImageOutput,
  SchemaHidreamI1DevInput,
  SchemaHidreamI1DevOutput,
  SchemaHidreamI1FastInput,
  SchemaHidreamI1FastOutput,
  SchemaHidreamI1FullInput,
  SchemaHidreamI1FullOutput,
  SchemaHunyuanImageV21TextToImageInput,
  SchemaHunyuanImageV21TextToImageOutput,
  SchemaHunyuanImageV3TextToImageInput,
  SchemaHunyuanImageV3TextToImageOutput,
  SchemaIdeogramV2Input,
  SchemaIdeogramV2Output,
  SchemaIdeogramV2TurboInput,
  SchemaIdeogramV2TurboOutput,
  SchemaIdeogramV2aInput,
  SchemaIdeogramV2aOutput,
  SchemaIdeogramV2aTurboInput,
  SchemaIdeogramV2aTurboOutput,
  SchemaIdeogramV3Input,
  SchemaIdeogramV3Output,
  SchemaIllusionDiffusionInput,
  SchemaIllusionDiffusionOutput,
  SchemaImagen3FastInput,
  SchemaImagen3FastOutput,
  SchemaImagen3Input,
  SchemaImagen3Output,
  SchemaImagen4PreviewFastInput,
  SchemaImagen4PreviewFastOutput,
  SchemaImagen4PreviewInput,
  SchemaImagen4PreviewOutput,
  SchemaImagen4PreviewUltraInput,
  SchemaImagen4PreviewUltraOutput,
  SchemaImagineart15PreviewTextToImageInput,
  SchemaImagineart15PreviewTextToImageOutput,
  SchemaImagineart15ProPreviewTextToImageInput,
  SchemaImagineart15ProPreviewTextToImageOutput,
  SchemaJanusInput,
  SchemaJanusOutput,
  SchemaJuggernautFluxBaseInput,
  SchemaJuggernautFluxBaseOutput,
  SchemaJuggernautFluxLightningInput,
  SchemaJuggernautFluxLightningOutput,
  SchemaJuggernautFluxLoraInput,
  SchemaJuggernautFluxLoraOutput,
  SchemaJuggernautFluxProInput,
  SchemaJuggernautFluxProOutput,
  SchemaKolorsInput,
  SchemaKolorsOutput,
  SchemaLayerDiffusionInput,
  SchemaLayerDiffusionOutput,
  SchemaLcmInput,
  SchemaLcmOutput,
  SchemaLightningModelsInput,
  SchemaLightningModelsOutput,
  SchemaLongcatImageInput,
  SchemaLongcatImageOutput,
  SchemaLoraInput,
  SchemaLoraOutput,
  SchemaLumaPhotonFlashInput,
  SchemaLumaPhotonFlashOutput,
  SchemaLumaPhotonInput,
  SchemaLumaPhotonOutput,
  SchemaLuminaImageV2Input,
  SchemaLuminaImageV2Output,
  SchemaMinimaxImage01Input,
  SchemaMinimaxImage01Output,
  SchemaNanoBananaInput,
  SchemaNanoBananaOutput,
  SchemaNanoBananaProInput,
  SchemaNanoBananaProOutput,
  SchemaOmnigenV1Input,
  SchemaOmnigenV1Output,
  SchemaOmnigenV2Input,
  SchemaOmnigenV2Output,
  SchemaOvisImageInput,
  SchemaOvisImageOutput,
  SchemaPiflowInput,
  SchemaPiflowOutput,
  SchemaPixartSigmaInput,
  SchemaPixartSigmaOutput,
  SchemaPlaygroundV25Input,
  SchemaPlaygroundV25Output,
  SchemaPonyV7Input,
  SchemaPonyV7Output,
  SchemaQwenImage2512Input,
  SchemaQwenImage2512LoraInput,
  SchemaQwenImage2512LoraOutput,
  SchemaQwenImage2512Output,
  SchemaQwenImageInput,
  SchemaQwenImageOutput,
  SchemaRealisticVisionInput,
  SchemaRealisticVisionOutput,
  SchemaRecraft20bInput,
  SchemaRecraft20bOutput,
  SchemaRecraftV3TextToImageInput,
  SchemaRecraftV3TextToImageOutput,
  SchemaReveTextToImageInput,
  SchemaReveTextToImageOutput,
  SchemaRundiffusionPhotoFluxInput,
  SchemaRundiffusionPhotoFluxOutput,
  SchemaSanaInput,
  SchemaSanaOutput,
  SchemaSanaSprintInput,
  SchemaSanaSprintOutput,
  SchemaSanaV1516bInput,
  SchemaSanaV1516bOutput,
  SchemaSanaV1548bInput,
  SchemaSanaV1548bOutput,
  SchemaSdxlControlnetUnionInput,
  SchemaSdxlControlnetUnionOutput,
  SchemaSkyRaccoonInput,
  SchemaSkyRaccoonOutput,
  SchemaStableCascadeInput,
  SchemaStableCascadeOutput,
  SchemaStableCascadeSoteDiffusionInput,
  SchemaStableCascadeSoteDiffusionOutput,
  SchemaStableDiffusionV15Input,
  SchemaStableDiffusionV15Output,
  SchemaStableDiffusionV35LargeInput,
  SchemaStableDiffusionV35LargeOutput,
  SchemaStableDiffusionV35MediumInput,
  SchemaStableDiffusionV35MediumOutput,
  SchemaStableDiffusionV3MediumInput,
  SchemaStableDiffusionV3MediumOutput,
  SchemaSwitti512Input,
  SchemaSwitti512Output,
  SchemaSwittiInput,
  SchemaSwittiOutput,
  SchemaTextToImage32Input,
  SchemaTextToImage32Output,
  SchemaV26TextToImageInput,
  SchemaV26TextToImageOutput,
  SchemaViduQ2TextToImageInput,
  SchemaViduQ2TextToImageOutput,
  SchemaWan25PreviewTextToImageInput,
  SchemaWan25PreviewTextToImageOutput,
  SchemaWanV225bTextToImageInput,
  SchemaWanV225bTextToImageOutput,
  SchemaWanV22A14bTextToImageInput,
  SchemaWanV22A14bTextToImageLoraInput,
  SchemaWanV22A14bTextToImageLoraOutput,
  SchemaWanV22A14bTextToImageOutput,
  SchemaZImageBaseInput,
  SchemaZImageBaseLoraInput,
  SchemaZImageBaseLoraOutput,
  SchemaZImageBaseOutput,
  SchemaZImageTurboInput,
  SchemaZImageTurboLoraInput,
  SchemaZImageTurboLoraOutput,
  SchemaZImageTurboOutput,
} from './types.gen'

import type { z } from 'zod'

export type TextToImageEndpointMap = {
  'fal-ai/imagen4/preview': {
    input: SchemaImagen4PreviewInput
    output: SchemaImagen4PreviewOutput
  }
  'fal-ai/flux-pro/v1.1-ultra': {
    input: SchemaFluxProV11UltraInput
    output: SchemaFluxProV11UltraOutput
  }
  'fal-ai/recraft/v3/text-to-image': {
    input: SchemaRecraftV3TextToImageInput
    output: SchemaRecraftV3TextToImageOutput
  }
  'fal-ai/flux-2/lora': {
    input: SchemaFlux2LoraInput
    output: SchemaFlux2LoraOutput
  }
  'fal-ai/flux-2': {
    input: SchemaFlux2Input
    output: SchemaFlux2Output
  }
  'fal-ai/flux-2-pro': {
    input: SchemaFlux2ProInput
    output: SchemaFlux2ProOutput
  }
  'bria/text-to-image/3.2': {
    input: SchemaTextToImage32Input
    output: SchemaTextToImage32Output
  }
  'fal-ai/imagen4/preview/fast': {
    input: SchemaImagen4PreviewFastInput
    output: SchemaImagen4PreviewFastOutput
  }
  'fal-ai/hidream-i1-full': {
    input: SchemaHidreamI1FullInput
    output: SchemaHidreamI1FullOutput
  }
  'fal-ai/hidream-i1-dev': {
    input: SchemaHidreamI1DevInput
    output: SchemaHidreamI1DevOutput
  }
  'fal-ai/hidream-i1-fast': {
    input: SchemaHidreamI1FastInput
    output: SchemaHidreamI1FastOutput
  }
  'fal-ai/flux/dev': {
    input: SchemaFluxDevInput
    output: SchemaFluxDevOutput
  }
  'fal-ai/ideogram/v2': {
    input: SchemaIdeogramV2Input
    output: SchemaIdeogramV2Output
  }
  'fal-ai/stable-diffusion-v35-large': {
    input: SchemaStableDiffusionV35LargeInput
    output: SchemaStableDiffusionV35LargeOutput
  }
  'fal-ai/flux-general': {
    input: SchemaFluxGeneralInput
    output: SchemaFluxGeneralOutput
  }
  'fal-ai/flux-lora': {
    input: SchemaFluxLoraInput
    output: SchemaFluxLoraOutput
  }
  'fal-ai/z-image/base/lora': {
    input: SchemaZImageBaseLoraInput
    output: SchemaZImageBaseLoraOutput
  }
  'fal-ai/z-image/base': {
    input: SchemaZImageBaseInput
    output: SchemaZImageBaseOutput
  }
  'fal-ai/flux-2/klein/9b/base/lora': {
    input: SchemaFlux2Klein9bBaseLoraInput
    output: SchemaFlux2Klein9bBaseLoraOutput
  }
  'fal-ai/flux-2/klein/4b/base/lora': {
    input: SchemaFlux2Klein4bBaseLoraInput
    output: SchemaFlux2Klein4bBaseLoraOutput
  }
  'fal-ai/flux-2/klein/9b/base': {
    input: SchemaFlux2Klein9bBaseInput
    output: SchemaFlux2Klein9bBaseOutput
  }
  'fal-ai/flux-2/klein/4b/base': {
    input: SchemaFlux2Klein4bBaseInput
    output: SchemaFlux2Klein4bBaseOutput
  }
  'fal-ai/flux-2/klein/9b': {
    input: SchemaFlux2Klein9bInput
    output: SchemaFlux2Klein9bOutput
  }
  'fal-ai/flux-2/klein/4b': {
    input: SchemaFlux2Klein4bInput
    output: SchemaFlux2Klein4bOutput
  }
  'imagineart/imagineart-1.5-pro-preview/text-to-image': {
    input: SchemaImagineart15ProPreviewTextToImageInput
    output: SchemaImagineart15ProPreviewTextToImageOutput
  }
  'fal-ai/glm-image': {
    input: SchemaGlmImageInput
    output: SchemaGlmImageOutput
  }
  'fal-ai/qwen-image-2512/lora': {
    input: SchemaQwenImage2512LoraInput
    output: SchemaQwenImage2512LoraOutput
  }
  'fal-ai/qwen-image-2512': {
    input: SchemaQwenImage2512Input
    output: SchemaQwenImage2512Output
  }
  'wan/v2.6/text-to-image': {
    input: SchemaV26TextToImageInput
    output: SchemaV26TextToImageOutput
  }
  'fal-ai/flux-2/flash': {
    input: SchemaFlux2FlashInput
    output: SchemaFlux2FlashOutput
  }
  'fal-ai/gpt-image-1.5': {
    input: SchemaGptImage15Input
    output: SchemaGptImage15Output
  }
  'bria/fibo-lite/generate': {
    input: SchemaFiboLiteGenerateInput
    output: SchemaFiboLiteGenerateOutput
  }
  'fal-ai/flux-2/turbo': {
    input: SchemaFlux2TurboInput
    output: SchemaFlux2TurboOutput
  }
  'fal-ai/flux-2-max': {
    input: SchemaFlux2MaxInput
    output: SchemaFlux2MaxOutput
  }
  'fal-ai/longcat-image': {
    input: SchemaLongcatImageInput
    output: SchemaLongcatImageOutput
  }
  'fal-ai/bytedance/seedream/v4.5/text-to-image': {
    input: SchemaBytedanceSeedreamV45TextToImageInput
    output: SchemaBytedanceSeedreamV45TextToImageOutput
  }
  'fal-ai/vidu/q2/text-to-image': {
    input: SchemaViduQ2TextToImageInput
    output: SchemaViduQ2TextToImageOutput
  }
  'fal-ai/z-image/turbo/lora': {
    input: SchemaZImageTurboLoraInput
    output: SchemaZImageTurboLoraOutput
  }
  'fal-ai/ovis-image': {
    input: SchemaOvisImageInput
    output: SchemaOvisImageOutput
  }
  'fal-ai/z-image/turbo': {
    input: SchemaZImageTurboInput
    output: SchemaZImageTurboOutput
  }
  'fal-ai/flux-2-lora-gallery/sepia-vintage': {
    input: SchemaFlux2LoraGallerySepiaVintageInput
    output: SchemaFlux2LoraGallerySepiaVintageOutput
  }
  'fal-ai/flux-2-lora-gallery/satellite-view-style': {
    input: SchemaFlux2LoraGallerySatelliteViewStyleInput
    output: SchemaFlux2LoraGallerySatelliteViewStyleOutput
  }
  'fal-ai/flux-2-lora-gallery/realism': {
    input: SchemaFlux2LoraGalleryRealismInput
    output: SchemaFlux2LoraGalleryRealismOutput
  }
  'fal-ai/flux-2-lora-gallery/hdr-style': {
    input: SchemaFlux2LoraGalleryHdrStyleInput
    output: SchemaFlux2LoraGalleryHdrStyleOutput
  }
  'fal-ai/flux-2-lora-gallery/digital-comic-art': {
    input: SchemaFlux2LoraGalleryDigitalComicArtInput
    output: SchemaFlux2LoraGalleryDigitalComicArtOutput
  }
  'fal-ai/flux-2-lora-gallery/ballpoint-pen-sketch': {
    input: SchemaFlux2LoraGalleryBallpointPenSketchInput
    output: SchemaFlux2LoraGalleryBallpointPenSketchOutput
  }
  'fal-ai/flux-2-flex': {
    input: SchemaFlux2FlexInput
    output: SchemaFlux2FlexOutput
  }
  'fal-ai/gemini-3-pro-image-preview': {
    input: SchemaGemini3ProImagePreviewInput
    output: SchemaGemini3ProImagePreviewOutput
  }
  'fal-ai/nano-banana-pro': {
    input: SchemaNanoBananaProInput
    output: SchemaNanoBananaProOutput
  }
  'imagineart/imagineart-1.5-preview/text-to-image': {
    input: SchemaImagineart15PreviewTextToImageInput
    output: SchemaImagineart15PreviewTextToImageOutput
  }
  'fal-ai/emu-3.5-image/text-to-image': {
    input: SchemaEmu35ImageTextToImageInput
    output: SchemaEmu35ImageTextToImageOutput
  }
  'bria/fibo/generate': {
    input: SchemaFiboGenerateInput
    output: SchemaFiboGenerateOutput
  }
  'fal-ai/piflow': {
    input: SchemaPiflowInput
    output: SchemaPiflowOutput
  }
  'fal-ai/gpt-image-1-mini': {
    input: SchemaGptImage1MiniInput
    output: SchemaGptImage1MiniOutput
  }
  'fal-ai/reve/text-to-image': {
    input: SchemaReveTextToImageInput
    output: SchemaReveTextToImageOutput
  }
  'fal-ai/hunyuan-image/v3/text-to-image': {
    input: SchemaHunyuanImageV3TextToImageInput
    output: SchemaHunyuanImageV3TextToImageOutput
  }
  'fal-ai/wan-25-preview/text-to-image': {
    input: SchemaWan25PreviewTextToImageInput
    output: SchemaWan25PreviewTextToImageOutput
  }
  'fal-ai/flux/srpo': {
    input: SchemaFluxSrpoInput
    output: SchemaFluxSrpoOutput
  }
  'fal-ai/flux-1/srpo': {
    input: SchemaFlux1SrpoInput
    output: SchemaFlux1SrpoOutput
  }
  'fal-ai/hunyuan-image/v2.1/text-to-image': {
    input: SchemaHunyuanImageV21TextToImageInput
    output: SchemaHunyuanImageV21TextToImageOutput
  }
  'fal-ai/bytedance/seedream/v4/text-to-image': {
    input: SchemaBytedanceSeedreamV4TextToImageInput
    output: SchemaBytedanceSeedreamV4TextToImageOutput
  }
  'fal-ai/gemini-25-flash-image': {
    input: SchemaGemini25FlashImageInput
    output: SchemaGemini25FlashImageOutput
  }
  'fal-ai/nano-banana': {
    input: SchemaNanoBananaInput
    output: SchemaNanoBananaOutput
  }
  'fal-ai/bytedance/dreamina/v3.1/text-to-image': {
    input: SchemaBytedanceDreaminaV31TextToImageInput
    output: SchemaBytedanceDreaminaV31TextToImageOutput
  }
  'fal-ai/wan/v2.2-a14b/text-to-image/lora': {
    input: SchemaWanV22A14bTextToImageLoraInput
    output: SchemaWanV22A14bTextToImageLoraOutput
  }
  'fal-ai/wan/v2.2-5b/text-to-image': {
    input: SchemaWanV225bTextToImageInput
    output: SchemaWanV225bTextToImageOutput
  }
  'fal-ai/wan/v2.2-a14b/text-to-image': {
    input: SchemaWanV22A14bTextToImageInput
    output: SchemaWanV22A14bTextToImageOutput
  }
  'fal-ai/qwen-image': {
    input: SchemaQwenImageInput
    output: SchemaQwenImageOutput
  }
  'fal-ai/flux-krea-lora/stream': {
    input: SchemaFluxKreaLoraStreamInput
    output: SchemaFluxKreaLoraStreamOutput
  }
  'fal-ai/flux-krea-lora': {
    input: SchemaFluxKreaLoraInput
    output: SchemaFluxKreaLoraOutput
  }
  'fal-ai/flux/krea': {
    input: SchemaFluxKreaInput
    output: SchemaFluxKreaOutput
  }
  'fal-ai/flux-1/krea': {
    input: SchemaFlux1KreaInput
    output: SchemaFlux1KreaOutput
  }
  'fal-ai/sky-raccoon': {
    input: SchemaSkyRaccoonInput
    output: SchemaSkyRaccoonOutput
  }
  'fal-ai/flux-kontext-lora/text-to-image': {
    input: SchemaFluxKontextLoraTextToImageInput
    output: SchemaFluxKontextLoraTextToImageOutput
  }
  'fal-ai/omnigen-v2': {
    input: SchemaOmnigenV2Input
    output: SchemaOmnigenV2Output
  }
  'fal-ai/bytedance/seedream/v3/text-to-image': {
    input: SchemaBytedanceSeedreamV3TextToImageInput
    output: SchemaBytedanceSeedreamV3TextToImageOutput
  }
  'fal-ai/flux-1/schnell': {
    input: SchemaFlux1SchnellInput
    output: SchemaFlux1SchnellOutput
  }
  'fal-ai/flux-1/dev': {
    input: SchemaFlux1DevInput
    output: SchemaFlux1DevOutput
  }
  'fal-ai/flux-pro/kontext/max/text-to-image': {
    input: SchemaFluxProKontextMaxTextToImageInput
    output: SchemaFluxProKontextMaxTextToImageOutput
  }
  'fal-ai/flux-pro/kontext/text-to-image': {
    input: SchemaFluxProKontextTextToImageInput
    output: SchemaFluxProKontextTextToImageOutput
  }
  'fal-ai/bagel': {
    input: SchemaBagelInput
    output: SchemaBagelOutput
  }
  'fal-ai/imagen4/preview/ultra': {
    input: SchemaImagen4PreviewUltraInput
    output: SchemaImagen4PreviewUltraOutput
  }
  'fal-ai/dreamo': {
    input: SchemaDreamoInput
    output: SchemaDreamoOutput
  }
  'fal-ai/flux-lora/stream': {
    input: SchemaFluxLoraStreamInput
    output: SchemaFluxLoraStreamOutput
  }
  'fal-ai/minimax/image-01': {
    input: SchemaMinimaxImage01Input
    output: SchemaMinimaxImage01Output
  }
  'fal-ai/pony-v7': {
    input: SchemaPonyV7Input
    output: SchemaPonyV7Output
  }
  'fal-ai/ideogram/v3': {
    input: SchemaIdeogramV3Input
    output: SchemaIdeogramV3Output
  }
  'fal-ai/f-lite/standard': {
    input: SchemaFLiteStandardInput
    output: SchemaFLiteStandardOutput
  }
  'fal-ai/f-lite/texture': {
    input: SchemaFLiteTextureInput
    output: SchemaFLiteTextureOutput
  }
  'fal-ai/gpt-image-1/text-to-image': {
    input: SchemaGptImage1TextToImageInput
    output: SchemaGptImage1TextToImageOutput
  }
  'fal-ai/sana/v1.5/1.6b': {
    input: SchemaSanaV1516bInput
    output: SchemaSanaV1516bOutput
  }
  'fal-ai/sana/v1.5/4.8b': {
    input: SchemaSanaV1548bInput
    output: SchemaSanaV1548bOutput
  }
  'fal-ai/sana/sprint': {
    input: SchemaSanaSprintInput
    output: SchemaSanaSprintOutput
  }
  'rundiffusion-fal/juggernaut-flux/lightning': {
    input: SchemaJuggernautFluxLightningInput
    output: SchemaJuggernautFluxLightningOutput
  }
  'rundiffusion-fal/juggernaut-flux/pro': {
    input: SchemaJuggernautFluxProInput
    output: SchemaJuggernautFluxProOutput
  }
  'rundiffusion-fal/juggernaut-flux-lora': {
    input: SchemaJuggernautFluxLoraInput
    output: SchemaJuggernautFluxLoraOutput
  }
  'rundiffusion-fal/rundiffusion-photo-flux': {
    input: SchemaRundiffusionPhotoFluxInput
    output: SchemaRundiffusionPhotoFluxOutput
  }
  'rundiffusion-fal/juggernaut-flux/base': {
    input: SchemaJuggernautFluxBaseInput
    output: SchemaJuggernautFluxBaseOutput
  }
  'fal-ai/cogview4': {
    input: SchemaCogview4Input
    output: SchemaCogview4Output
  }
  'fal-ai/ideogram/v2a/turbo': {
    input: SchemaIdeogramV2aTurboInput
    output: SchemaIdeogramV2aTurboOutput
  }
  'fal-ai/ideogram/v2a': {
    input: SchemaIdeogramV2aInput
    output: SchemaIdeogramV2aOutput
  }
  'fal-ai/flux-control-lora-canny': {
    input: SchemaFluxControlLoraCannyInput
    output: SchemaFluxControlLoraCannyOutput
  }
  'fal-ai/flux-control-lora-depth': {
    input: SchemaFluxControlLoraDepthInput
    output: SchemaFluxControlLoraDepthOutput
  }
  'fal-ai/imagen3': {
    input: SchemaImagen3Input
    output: SchemaImagen3Output
  }
  'fal-ai/imagen3/fast': {
    input: SchemaImagen3FastInput
    output: SchemaImagen3FastOutput
  }
  'fal-ai/lumina-image/v2': {
    input: SchemaLuminaImageV2Input
    output: SchemaLuminaImageV2Output
  }
  'fal-ai/janus': {
    input: SchemaJanusInput
    output: SchemaJanusOutput
  }
  'fal-ai/flux-pro/v1.1-ultra-finetuned': {
    input: SchemaFluxProV11UltraFinetunedInput
    output: SchemaFluxProV11UltraFinetunedOutput
  }
  'fal-ai/flux-pro/v1.1': {
    input: SchemaFluxProV11Input
    output: SchemaFluxProV11Output
  }
  'fal-ai/switti': {
    input: SchemaSwittiInput
    output: SchemaSwittiOutput
  }
  'fal-ai/switti/512': {
    input: SchemaSwitti512Input
    output: SchemaSwitti512Output
  }
  'fal-ai/bria/text-to-image/base': {
    input: SchemaBriaTextToImageBaseInput
    output: SchemaBriaTextToImageBaseOutput
  }
  'fal-ai/bria/text-to-image/fast': {
    input: SchemaBriaTextToImageFastInput
    output: SchemaBriaTextToImageFastOutput
  }
  'fal-ai/bria/text-to-image/hd': {
    input: SchemaBriaTextToImageHdInput
    output: SchemaBriaTextToImageHdOutput
  }
  'fal-ai/recraft-20b': {
    input: SchemaRecraft20bInput
    output: SchemaRecraft20bOutput
  }
  'fal-ai/ideogram/v2/turbo': {
    input: SchemaIdeogramV2TurboInput
    output: SchemaIdeogramV2TurboOutput
  }
  'fal-ai/luma-photon/flash': {
    input: SchemaLumaPhotonFlashInput
    output: SchemaLumaPhotonFlashOutput
  }
  'fal-ai/aura-flow': {
    input: SchemaAuraFlowInput
    output: SchemaAuraFlowOutput
  }
  'fal-ai/omnigen-v1': {
    input: SchemaOmnigenV1Input
    output: SchemaOmnigenV1Output
  }
  'fal-ai/flux/schnell': {
    input: SchemaFluxSchnellInput
    output: SchemaFluxSchnellOutput
  }
  'fal-ai/stable-diffusion-v35-medium': {
    input: SchemaStableDiffusionV35MediumInput
    output: SchemaStableDiffusionV35MediumOutput
  }
  'fal-ai/flux-lora/inpainting': {
    input: SchemaFluxLoraInpaintingInput
    output: SchemaFluxLoraInpaintingOutput
  }
  'fal-ai/stable-diffusion-v3-medium': {
    input: SchemaStableDiffusionV3MediumInput
    output: SchemaStableDiffusionV3MediumOutput
  }
  'fal-ai/fooocus/upscale-or-vary': {
    input: SchemaFooocusUpscaleOrVaryInput
    output: SchemaFooocusUpscaleOrVaryOutput
  }
  'fal-ai/sana': {
    input: SchemaSanaInput
    output: SchemaSanaOutput
  }
  'fal-ai/flux-subject': {
    input: SchemaFluxSubjectInput
    output: SchemaFluxSubjectOutput
  }
  'fal-ai/pixart-sigma': {
    input: SchemaPixartSigmaInput
    output: SchemaPixartSigmaOutput
  }
  'fal-ai/sdxl-controlnet-union': {
    input: SchemaSdxlControlnetUnionInput
    output: SchemaSdxlControlnetUnionOutput
  }
  'fal-ai/kolors': {
    input: SchemaKolorsInput
    output: SchemaKolorsOutput
  }
  'fal-ai/stable-cascade': {
    input: SchemaStableCascadeInput
    output: SchemaStableCascadeOutput
  }
  'fal-ai/fast-sdxl': {
    input: SchemaFastSdxlInput
    output: SchemaFastSdxlOutput
  }
  'fal-ai/stable-cascade/sote-diffusion': {
    input: SchemaStableCascadeSoteDiffusionInput
    output: SchemaStableCascadeSoteDiffusionOutput
  }
  'fal-ai/luma-photon': {
    input: SchemaLumaPhotonInput
    output: SchemaLumaPhotonOutput
  }
  'fal-ai/lightning-models': {
    input: SchemaLightningModelsInput
    output: SchemaLightningModelsOutput
  }
  'fal-ai/playground-v25': {
    input: SchemaPlaygroundV25Input
    output: SchemaPlaygroundV25Output
  }
  'fal-ai/realistic-vision': {
    input: SchemaRealisticVisionInput
    output: SchemaRealisticVisionOutput
  }
  'fal-ai/dreamshaper': {
    input: SchemaDreamshaperInput
    output: SchemaDreamshaperOutput
  }
  'fal-ai/stable-diffusion-v15': {
    input: SchemaStableDiffusionV15Input
    output: SchemaStableDiffusionV15Output
  }
  'fal-ai/layer-diffusion': {
    input: SchemaLayerDiffusionInput
    output: SchemaLayerDiffusionOutput
  }
  'fal-ai/fast-lightning-sdxl': {
    input: SchemaFastLightningSdxlInput
    output: SchemaFastLightningSdxlOutput
  }
  'fal-ai/fast-fooocus-sdxl/image-to-image': {
    input: SchemaFastFooocusSdxlImageToImageInput
    output: SchemaFastFooocusSdxlImageToImageOutput
  }
  'fal-ai/fast-sdxl-controlnet-canny': {
    input: SchemaFastSdxlControlnetCannyInput
    output: SchemaFastSdxlControlnetCannyOutput
  }
  'fal-ai/fast-lcm-diffusion': {
    input: SchemaFastLcmDiffusionInput
    output: SchemaFastLcmDiffusionOutput
  }
  'fal-ai/fast-fooocus-sdxl': {
    input: SchemaFastFooocusSdxlInput
    output: SchemaFastFooocusSdxlOutput
  }
  'fal-ai/illusion-diffusion': {
    input: SchemaIllusionDiffusionInput
    output: SchemaIllusionDiffusionOutput
  }
  'fal-ai/fooocus/image-prompt': {
    input: SchemaFooocusImagePromptInput
    output: SchemaFooocusImagePromptOutput
  }
  'fal-ai/fooocus/inpaint': {
    input: SchemaFooocusInpaintInput
    output: SchemaFooocusInpaintOutput
  }
  'fal-ai/lcm': {
    input: SchemaLcmInput
    output: SchemaLcmOutput
  }
  'fal-ai/diffusion-edge': {
    input: SchemaDiffusionEdgeInput
    output: SchemaDiffusionEdgeOutput
  }
  'fal-ai/fooocus': {
    input: SchemaFooocusInput
    output: SchemaFooocusOutput
  }
  'fal-ai/lora': {
    input: SchemaLoraInput
    output: SchemaLoraOutput
  }
}

/** Union type of all text-to-image model endpoint IDs */
export type TextToImageModel = keyof TextToImageEndpointMap

export const TextToImageSchemaMap: Record<
  TextToImageModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ['fal-ai/imagen4/preview']: {
    input: zSchemaImagen4PreviewInput,
    output: zSchemaImagen4PreviewOutput,
  },
  ['fal-ai/flux-pro/v1.1-ultra']: {
    input: zSchemaFluxProV11UltraInput,
    output: zSchemaFluxProV11UltraOutput,
  },
  ['fal-ai/recraft/v3/text-to-image']: {
    input: zSchemaRecraftV3TextToImageInput,
    output: zSchemaRecraftV3TextToImageOutput,
  },
  ['fal-ai/flux-2/lora']: {
    input: zSchemaFlux2LoraInput,
    output: zSchemaFlux2LoraOutput,
  },
  ['fal-ai/flux-2']: {
    input: zSchemaFlux2Input,
    output: zSchemaFlux2Output,
  },
  ['fal-ai/flux-2-pro']: {
    input: zSchemaFlux2ProInput,
    output: zSchemaFlux2ProOutput,
  },
  ['bria/text-to-image/3.2']: {
    input: zSchemaTextToImage32Input,
    output: zSchemaTextToImage32Output,
  },
  ['fal-ai/imagen4/preview/fast']: {
    input: zSchemaImagen4PreviewFastInput,
    output: zSchemaImagen4PreviewFastOutput,
  },
  ['fal-ai/hidream-i1-full']: {
    input: zSchemaHidreamI1FullInput,
    output: zSchemaHidreamI1FullOutput,
  },
  ['fal-ai/hidream-i1-dev']: {
    input: zSchemaHidreamI1DevInput,
    output: zSchemaHidreamI1DevOutput,
  },
  ['fal-ai/hidream-i1-fast']: {
    input: zSchemaHidreamI1FastInput,
    output: zSchemaHidreamI1FastOutput,
  },
  ['fal-ai/flux/dev']: {
    input: zSchemaFluxDevInput,
    output: zSchemaFluxDevOutput,
  },
  ['fal-ai/ideogram/v2']: {
    input: zSchemaIdeogramV2Input,
    output: zSchemaIdeogramV2Output,
  },
  ['fal-ai/stable-diffusion-v35-large']: {
    input: zSchemaStableDiffusionV35LargeInput,
    output: zSchemaStableDiffusionV35LargeOutput,
  },
  ['fal-ai/flux-general']: {
    input: zSchemaFluxGeneralInput,
    output: zSchemaFluxGeneralOutput,
  },
  ['fal-ai/flux-lora']: {
    input: zSchemaFluxLoraInput,
    output: zSchemaFluxLoraOutput,
  },
  ['fal-ai/z-image/base/lora']: {
    input: zSchemaZImageBaseLoraInput,
    output: zSchemaZImageBaseLoraOutput,
  },
  ['fal-ai/z-image/base']: {
    input: zSchemaZImageBaseInput,
    output: zSchemaZImageBaseOutput,
  },
  ['fal-ai/flux-2/klein/9b/base/lora']: {
    input: zSchemaFlux2Klein9bBaseLoraInput,
    output: zSchemaFlux2Klein9bBaseLoraOutput,
  },
  ['fal-ai/flux-2/klein/4b/base/lora']: {
    input: zSchemaFlux2Klein4bBaseLoraInput,
    output: zSchemaFlux2Klein4bBaseLoraOutput,
  },
  ['fal-ai/flux-2/klein/9b/base']: {
    input: zSchemaFlux2Klein9bBaseInput,
    output: zSchemaFlux2Klein9bBaseOutput,
  },
  ['fal-ai/flux-2/klein/4b/base']: {
    input: zSchemaFlux2Klein4bBaseInput,
    output: zSchemaFlux2Klein4bBaseOutput,
  },
  ['fal-ai/flux-2/klein/9b']: {
    input: zSchemaFlux2Klein9bInput,
    output: zSchemaFlux2Klein9bOutput,
  },
  ['fal-ai/flux-2/klein/4b']: {
    input: zSchemaFlux2Klein4bInput,
    output: zSchemaFlux2Klein4bOutput,
  },
  ['imagineart/imagineart-1.5-pro-preview/text-to-image']: {
    input: zSchemaImagineart15ProPreviewTextToImageInput,
    output: zSchemaImagineart15ProPreviewTextToImageOutput,
  },
  ['fal-ai/glm-image']: {
    input: zSchemaGlmImageInput,
    output: zSchemaGlmImageOutput,
  },
  ['fal-ai/qwen-image-2512/lora']: {
    input: zSchemaQwenImage2512LoraInput,
    output: zSchemaQwenImage2512LoraOutput,
  },
  ['fal-ai/qwen-image-2512']: {
    input: zSchemaQwenImage2512Input,
    output: zSchemaQwenImage2512Output,
  },
  ['wan/v2.6/text-to-image']: {
    input: zSchemaV26TextToImageInput,
    output: zSchemaV26TextToImageOutput,
  },
  ['fal-ai/flux-2/flash']: {
    input: zSchemaFlux2FlashInput,
    output: zSchemaFlux2FlashOutput,
  },
  ['fal-ai/gpt-image-1.5']: {
    input: zSchemaGptImage15Input,
    output: zSchemaGptImage15Output,
  },
  ['bria/fibo-lite/generate']: {
    input: zSchemaFiboLiteGenerateInput,
    output: zSchemaFiboLiteGenerateOutput,
  },
  ['fal-ai/flux-2/turbo']: {
    input: zSchemaFlux2TurboInput,
    output: zSchemaFlux2TurboOutput,
  },
  ['fal-ai/flux-2-max']: {
    input: zSchemaFlux2MaxInput,
    output: zSchemaFlux2MaxOutput,
  },
  ['fal-ai/longcat-image']: {
    input: zSchemaLongcatImageInput,
    output: zSchemaLongcatImageOutput,
  },
  ['fal-ai/bytedance/seedream/v4.5/text-to-image']: {
    input: zSchemaBytedanceSeedreamV45TextToImageInput,
    output: zSchemaBytedanceSeedreamV45TextToImageOutput,
  },
  ['fal-ai/vidu/q2/text-to-image']: {
    input: zSchemaViduQ2TextToImageInput,
    output: zSchemaViduQ2TextToImageOutput,
  },
  ['fal-ai/z-image/turbo/lora']: {
    input: zSchemaZImageTurboLoraInput,
    output: zSchemaZImageTurboLoraOutput,
  },
  ['fal-ai/ovis-image']: {
    input: zSchemaOvisImageInput,
    output: zSchemaOvisImageOutput,
  },
  ['fal-ai/z-image/turbo']: {
    input: zSchemaZImageTurboInput,
    output: zSchemaZImageTurboOutput,
  },
  ['fal-ai/flux-2-lora-gallery/sepia-vintage']: {
    input: zSchemaFlux2LoraGallerySepiaVintageInput,
    output: zSchemaFlux2LoraGallerySepiaVintageOutput,
  },
  ['fal-ai/flux-2-lora-gallery/satellite-view-style']: {
    input: zSchemaFlux2LoraGallerySatelliteViewStyleInput,
    output: zSchemaFlux2LoraGallerySatelliteViewStyleOutput,
  },
  ['fal-ai/flux-2-lora-gallery/realism']: {
    input: zSchemaFlux2LoraGalleryRealismInput,
    output: zSchemaFlux2LoraGalleryRealismOutput,
  },
  ['fal-ai/flux-2-lora-gallery/hdr-style']: {
    input: zSchemaFlux2LoraGalleryHdrStyleInput,
    output: zSchemaFlux2LoraGalleryHdrStyleOutput,
  },
  ['fal-ai/flux-2-lora-gallery/digital-comic-art']: {
    input: zSchemaFlux2LoraGalleryDigitalComicArtInput,
    output: zSchemaFlux2LoraGalleryDigitalComicArtOutput,
  },
  ['fal-ai/flux-2-lora-gallery/ballpoint-pen-sketch']: {
    input: zSchemaFlux2LoraGalleryBallpointPenSketchInput,
    output: zSchemaFlux2LoraGalleryBallpointPenSketchOutput,
  },
  ['fal-ai/flux-2-flex']: {
    input: zSchemaFlux2FlexInput,
    output: zSchemaFlux2FlexOutput,
  },
  ['fal-ai/gemini-3-pro-image-preview']: {
    input: zSchemaGemini3ProImagePreviewInput,
    output: zSchemaGemini3ProImagePreviewOutput,
  },
  ['fal-ai/nano-banana-pro']: {
    input: zSchemaNanoBananaProInput,
    output: zSchemaNanoBananaProOutput,
  },
  ['imagineart/imagineart-1.5-preview/text-to-image']: {
    input: zSchemaImagineart15PreviewTextToImageInput,
    output: zSchemaImagineart15PreviewTextToImageOutput,
  },
  ['fal-ai/emu-3.5-image/text-to-image']: {
    input: zSchemaEmu35ImageTextToImageInput,
    output: zSchemaEmu35ImageTextToImageOutput,
  },
  ['bria/fibo/generate']: {
    input: zSchemaFiboGenerateInput,
    output: zSchemaFiboGenerateOutput,
  },
  ['fal-ai/piflow']: {
    input: zSchemaPiflowInput,
    output: zSchemaPiflowOutput,
  },
  ['fal-ai/gpt-image-1-mini']: {
    input: zSchemaGptImage1MiniInput,
    output: zSchemaGptImage1MiniOutput,
  },
  ['fal-ai/reve/text-to-image']: {
    input: zSchemaReveTextToImageInput,
    output: zSchemaReveTextToImageOutput,
  },
  ['fal-ai/hunyuan-image/v3/text-to-image']: {
    input: zSchemaHunyuanImageV3TextToImageInput,
    output: zSchemaHunyuanImageV3TextToImageOutput,
  },
  ['fal-ai/wan-25-preview/text-to-image']: {
    input: zSchemaWan25PreviewTextToImageInput,
    output: zSchemaWan25PreviewTextToImageOutput,
  },
  ['fal-ai/flux/srpo']: {
    input: zSchemaFluxSrpoInput,
    output: zSchemaFluxSrpoOutput,
  },
  ['fal-ai/flux-1/srpo']: {
    input: zSchemaFlux1SrpoInput,
    output: zSchemaFlux1SrpoOutput,
  },
  ['fal-ai/hunyuan-image/v2.1/text-to-image']: {
    input: zSchemaHunyuanImageV21TextToImageInput,
    output: zSchemaHunyuanImageV21TextToImageOutput,
  },
  ['fal-ai/bytedance/seedream/v4/text-to-image']: {
    input: zSchemaBytedanceSeedreamV4TextToImageInput,
    output: zSchemaBytedanceSeedreamV4TextToImageOutput,
  },
  ['fal-ai/gemini-25-flash-image']: {
    input: zSchemaGemini25FlashImageInput,
    output: zSchemaGemini25FlashImageOutput,
  },
  ['fal-ai/nano-banana']: {
    input: zSchemaNanoBananaInput,
    output: zSchemaNanoBananaOutput,
  },
  ['fal-ai/bytedance/dreamina/v3.1/text-to-image']: {
    input: zSchemaBytedanceDreaminaV31TextToImageInput,
    output: zSchemaBytedanceDreaminaV31TextToImageOutput,
  },
  ['fal-ai/wan/v2.2-a14b/text-to-image/lora']: {
    input: zSchemaWanV22A14bTextToImageLoraInput,
    output: zSchemaWanV22A14bTextToImageLoraOutput,
  },
  ['fal-ai/wan/v2.2-5b/text-to-image']: {
    input: zSchemaWanV225bTextToImageInput,
    output: zSchemaWanV225bTextToImageOutput,
  },
  ['fal-ai/wan/v2.2-a14b/text-to-image']: {
    input: zSchemaWanV22A14bTextToImageInput,
    output: zSchemaWanV22A14bTextToImageOutput,
  },
  ['fal-ai/qwen-image']: {
    input: zSchemaQwenImageInput,
    output: zSchemaQwenImageOutput,
  },
  ['fal-ai/flux-krea-lora/stream']: {
    input: zSchemaFluxKreaLoraStreamInput,
    output: zSchemaFluxKreaLoraStreamOutput,
  },
  ['fal-ai/flux-krea-lora']: {
    input: zSchemaFluxKreaLoraInput,
    output: zSchemaFluxKreaLoraOutput,
  },
  ['fal-ai/flux/krea']: {
    input: zSchemaFluxKreaInput,
    output: zSchemaFluxKreaOutput,
  },
  ['fal-ai/flux-1/krea']: {
    input: zSchemaFlux1KreaInput,
    output: zSchemaFlux1KreaOutput,
  },
  ['fal-ai/sky-raccoon']: {
    input: zSchemaSkyRaccoonInput,
    output: zSchemaSkyRaccoonOutput,
  },
  ['fal-ai/flux-kontext-lora/text-to-image']: {
    input: zSchemaFluxKontextLoraTextToImageInput,
    output: zSchemaFluxKontextLoraTextToImageOutput,
  },
  ['fal-ai/omnigen-v2']: {
    input: zSchemaOmnigenV2Input,
    output: zSchemaOmnigenV2Output,
  },
  ['fal-ai/bytedance/seedream/v3/text-to-image']: {
    input: zSchemaBytedanceSeedreamV3TextToImageInput,
    output: zSchemaBytedanceSeedreamV3TextToImageOutput,
  },
  ['fal-ai/flux-1/schnell']: {
    input: zSchemaFlux1SchnellInput,
    output: zSchemaFlux1SchnellOutput,
  },
  ['fal-ai/flux-1/dev']: {
    input: zSchemaFlux1DevInput,
    output: zSchemaFlux1DevOutput,
  },
  ['fal-ai/flux-pro/kontext/max/text-to-image']: {
    input: zSchemaFluxProKontextMaxTextToImageInput,
    output: zSchemaFluxProKontextMaxTextToImageOutput,
  },
  ['fal-ai/flux-pro/kontext/text-to-image']: {
    input: zSchemaFluxProKontextTextToImageInput,
    output: zSchemaFluxProKontextTextToImageOutput,
  },
  ['fal-ai/bagel']: {
    input: zSchemaBagelInput,
    output: zSchemaBagelOutput,
  },
  ['fal-ai/imagen4/preview/ultra']: {
    input: zSchemaImagen4PreviewUltraInput,
    output: zSchemaImagen4PreviewUltraOutput,
  },
  ['fal-ai/dreamo']: {
    input: zSchemaDreamoInput,
    output: zSchemaDreamoOutput,
  },
  ['fal-ai/flux-lora/stream']: {
    input: zSchemaFluxLoraStreamInput,
    output: zSchemaFluxLoraStreamOutput,
  },
  ['fal-ai/minimax/image-01']: {
    input: zSchemaMinimaxImage01Input,
    output: zSchemaMinimaxImage01Output,
  },
  ['fal-ai/pony-v7']: {
    input: zSchemaPonyV7Input,
    output: zSchemaPonyV7Output,
  },
  ['fal-ai/ideogram/v3']: {
    input: zSchemaIdeogramV3Input,
    output: zSchemaIdeogramV3Output,
  },
  ['fal-ai/f-lite/standard']: {
    input: zSchemaFLiteStandardInput,
    output: zSchemaFLiteStandardOutput,
  },
  ['fal-ai/f-lite/texture']: {
    input: zSchemaFLiteTextureInput,
    output: zSchemaFLiteTextureOutput,
  },
  ['fal-ai/gpt-image-1/text-to-image']: {
    input: zSchemaGptImage1TextToImageInput,
    output: zSchemaGptImage1TextToImageOutput,
  },
  ['fal-ai/sana/v1.5/1.6b']: {
    input: zSchemaSanaV1516bInput,
    output: zSchemaSanaV1516bOutput,
  },
  ['fal-ai/sana/v1.5/4.8b']: {
    input: zSchemaSanaV1548bInput,
    output: zSchemaSanaV1548bOutput,
  },
  ['fal-ai/sana/sprint']: {
    input: zSchemaSanaSprintInput,
    output: zSchemaSanaSprintOutput,
  },
  ['rundiffusion-fal/juggernaut-flux/lightning']: {
    input: zSchemaJuggernautFluxLightningInput,
    output: zSchemaJuggernautFluxLightningOutput,
  },
  ['rundiffusion-fal/juggernaut-flux/pro']: {
    input: zSchemaJuggernautFluxProInput,
    output: zSchemaJuggernautFluxProOutput,
  },
  ['rundiffusion-fal/juggernaut-flux-lora']: {
    input: zSchemaJuggernautFluxLoraInput,
    output: zSchemaJuggernautFluxLoraOutput,
  },
  ['rundiffusion-fal/rundiffusion-photo-flux']: {
    input: zSchemaRundiffusionPhotoFluxInput,
    output: zSchemaRundiffusionPhotoFluxOutput,
  },
  ['rundiffusion-fal/juggernaut-flux/base']: {
    input: zSchemaJuggernautFluxBaseInput,
    output: zSchemaJuggernautFluxBaseOutput,
  },
  ['fal-ai/cogview4']: {
    input: zSchemaCogview4Input,
    output: zSchemaCogview4Output,
  },
  ['fal-ai/ideogram/v2a/turbo']: {
    input: zSchemaIdeogramV2aTurboInput,
    output: zSchemaIdeogramV2aTurboOutput,
  },
  ['fal-ai/ideogram/v2a']: {
    input: zSchemaIdeogramV2aInput,
    output: zSchemaIdeogramV2aOutput,
  },
  ['fal-ai/flux-control-lora-canny']: {
    input: zSchemaFluxControlLoraCannyInput,
    output: zSchemaFluxControlLoraCannyOutput,
  },
  ['fal-ai/flux-control-lora-depth']: {
    input: zSchemaFluxControlLoraDepthInput,
    output: zSchemaFluxControlLoraDepthOutput,
  },
  ['fal-ai/imagen3']: {
    input: zSchemaImagen3Input,
    output: zSchemaImagen3Output,
  },
  ['fal-ai/imagen3/fast']: {
    input: zSchemaImagen3FastInput,
    output: zSchemaImagen3FastOutput,
  },
  ['fal-ai/lumina-image/v2']: {
    input: zSchemaLuminaImageV2Input,
    output: zSchemaLuminaImageV2Output,
  },
  ['fal-ai/janus']: {
    input: zSchemaJanusInput,
    output: zSchemaJanusOutput,
  },
  ['fal-ai/flux-pro/v1.1-ultra-finetuned']: {
    input: zSchemaFluxProV11UltraFinetunedInput,
    output: zSchemaFluxProV11UltraFinetunedOutput,
  },
  ['fal-ai/flux-pro/v1.1']: {
    input: zSchemaFluxProV11Input,
    output: zSchemaFluxProV11Output,
  },
  ['fal-ai/switti']: {
    input: zSchemaSwittiInput,
    output: zSchemaSwittiOutput,
  },
  ['fal-ai/switti/512']: {
    input: zSchemaSwitti512Input,
    output: zSchemaSwitti512Output,
  },
  ['fal-ai/bria/text-to-image/base']: {
    input: zSchemaBriaTextToImageBaseInput,
    output: zSchemaBriaTextToImageBaseOutput,
  },
  ['fal-ai/bria/text-to-image/fast']: {
    input: zSchemaBriaTextToImageFastInput,
    output: zSchemaBriaTextToImageFastOutput,
  },
  ['fal-ai/bria/text-to-image/hd']: {
    input: zSchemaBriaTextToImageHdInput,
    output: zSchemaBriaTextToImageHdOutput,
  },
  ['fal-ai/recraft-20b']: {
    input: zSchemaRecraft20bInput,
    output: zSchemaRecraft20bOutput,
  },
  ['fal-ai/ideogram/v2/turbo']: {
    input: zSchemaIdeogramV2TurboInput,
    output: zSchemaIdeogramV2TurboOutput,
  },
  ['fal-ai/luma-photon/flash']: {
    input: zSchemaLumaPhotonFlashInput,
    output: zSchemaLumaPhotonFlashOutput,
  },
  ['fal-ai/aura-flow']: {
    input: zSchemaAuraFlowInput,
    output: zSchemaAuraFlowOutput,
  },
  ['fal-ai/omnigen-v1']: {
    input: zSchemaOmnigenV1Input,
    output: zSchemaOmnigenV1Output,
  },
  ['fal-ai/flux/schnell']: {
    input: zSchemaFluxSchnellInput,
    output: zSchemaFluxSchnellOutput,
  },
  ['fal-ai/stable-diffusion-v35-medium']: {
    input: zSchemaStableDiffusionV35MediumInput,
    output: zSchemaStableDiffusionV35MediumOutput,
  },
  ['fal-ai/flux-lora/inpainting']: {
    input: zSchemaFluxLoraInpaintingInput,
    output: zSchemaFluxLoraInpaintingOutput,
  },
  ['fal-ai/stable-diffusion-v3-medium']: {
    input: zSchemaStableDiffusionV3MediumInput,
    output: zSchemaStableDiffusionV3MediumOutput,
  },
  ['fal-ai/fooocus/upscale-or-vary']: {
    input: zSchemaFooocusUpscaleOrVaryInput,
    output: zSchemaFooocusUpscaleOrVaryOutput,
  },
  ['fal-ai/sana']: {
    input: zSchemaSanaInput,
    output: zSchemaSanaOutput,
  },
  ['fal-ai/flux-subject']: {
    input: zSchemaFluxSubjectInput,
    output: zSchemaFluxSubjectOutput,
  },
  ['fal-ai/pixart-sigma']: {
    input: zSchemaPixartSigmaInput,
    output: zSchemaPixartSigmaOutput,
  },
  ['fal-ai/sdxl-controlnet-union']: {
    input: zSchemaSdxlControlnetUnionInput,
    output: zSchemaSdxlControlnetUnionOutput,
  },
  ['fal-ai/kolors']: {
    input: zSchemaKolorsInput,
    output: zSchemaKolorsOutput,
  },
  ['fal-ai/stable-cascade']: {
    input: zSchemaStableCascadeInput,
    output: zSchemaStableCascadeOutput,
  },
  ['fal-ai/fast-sdxl']: {
    input: zSchemaFastSdxlInput,
    output: zSchemaFastSdxlOutput,
  },
  ['fal-ai/stable-cascade/sote-diffusion']: {
    input: zSchemaStableCascadeSoteDiffusionInput,
    output: zSchemaStableCascadeSoteDiffusionOutput,
  },
  ['fal-ai/luma-photon']: {
    input: zSchemaLumaPhotonInput,
    output: zSchemaLumaPhotonOutput,
  },
  ['fal-ai/lightning-models']: {
    input: zSchemaLightningModelsInput,
    output: zSchemaLightningModelsOutput,
  },
  ['fal-ai/playground-v25']: {
    input: zSchemaPlaygroundV25Input,
    output: zSchemaPlaygroundV25Output,
  },
  ['fal-ai/realistic-vision']: {
    input: zSchemaRealisticVisionInput,
    output: zSchemaRealisticVisionOutput,
  },
  ['fal-ai/dreamshaper']: {
    input: zSchemaDreamshaperInput,
    output: zSchemaDreamshaperOutput,
  },
  ['fal-ai/stable-diffusion-v15']: {
    input: zSchemaStableDiffusionV15Input,
    output: zSchemaStableDiffusionV15Output,
  },
  ['fal-ai/layer-diffusion']: {
    input: zSchemaLayerDiffusionInput,
    output: zSchemaLayerDiffusionOutput,
  },
  ['fal-ai/fast-lightning-sdxl']: {
    input: zSchemaFastLightningSdxlInput,
    output: zSchemaFastLightningSdxlOutput,
  },
  ['fal-ai/fast-fooocus-sdxl/image-to-image']: {
    input: zSchemaFastFooocusSdxlImageToImageInput,
    output: zSchemaFastFooocusSdxlImageToImageOutput,
  },
  ['fal-ai/fast-sdxl-controlnet-canny']: {
    input: zSchemaFastSdxlControlnetCannyInput,
    output: zSchemaFastSdxlControlnetCannyOutput,
  },
  ['fal-ai/fast-lcm-diffusion']: {
    input: zSchemaFastLcmDiffusionInput,
    output: zSchemaFastLcmDiffusionOutput,
  },
  ['fal-ai/fast-fooocus-sdxl']: {
    input: zSchemaFastFooocusSdxlInput,
    output: zSchemaFastFooocusSdxlOutput,
  },
  ['fal-ai/illusion-diffusion']: {
    input: zSchemaIllusionDiffusionInput,
    output: zSchemaIllusionDiffusionOutput,
  },
  ['fal-ai/fooocus/image-prompt']: {
    input: zSchemaFooocusImagePromptInput,
    output: zSchemaFooocusImagePromptOutput,
  },
  ['fal-ai/fooocus/inpaint']: {
    input: zSchemaFooocusInpaintInput,
    output: zSchemaFooocusInpaintOutput,
  },
  ['fal-ai/lcm']: {
    input: zSchemaLcmInput,
    output: zSchemaLcmOutput,
  },
  ['fal-ai/diffusion-edge']: {
    input: zSchemaDiffusionEdgeInput,
    output: zSchemaDiffusionEdgeOutput,
  },
  ['fal-ai/fooocus']: {
    input: zSchemaFooocusInput,
    output: zSchemaFooocusOutput,
  },
  ['fal-ai/lora']: {
    input: zSchemaLoraInput,
    output: zSchemaLoraOutput,
  },
} as const

/** Get the input type for a specific text-to-image model */
export type TextToImageModelInput<T extends TextToImageModel> =
  TextToImageEndpointMap[T]['input']

/** Get the output type for a specific text-to-image model */
export type TextToImageModelOutput<T extends TextToImageModel> =
  TextToImageEndpointMap[T]['output']
