// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  BagelUnderstandInputSchema,
  BagelUnderstandOutputSchema,
  FfmpegApiLoudnormInputSchema,
  FfmpegApiLoudnormOutputSchema,
  FfmpegApiMetadataInputSchema,
  FfmpegApiMetadataOutputSchema,
  FfmpegApiWaveformInputSchema,
  FfmpegApiWaveformOutputSchema,
  FiboEditEditStructured_instructionInputSchema,
  FiboEditEditStructured_instructionOutputSchema,
  FiboGenerateStructured_promptInputSchema,
  FiboGenerateStructured_promptOutputSchema,
  FiboLiteGenerateStructured_promptInputSchema,
  FiboLiteGenerateStructured_promptLiteInputSchema,
  FiboLiteGenerateStructured_promptLiteOutputSchema,
  FiboLiteGenerateStructured_promptOutputSchema,
  OmnilottieImageToLottieInputSchema,
  OmnilottieImageToLottieOutputSchema,
  OmnilottieInputSchema,
  OmnilottieOutputSchema,
  OmnilottieVideoToLottieInputSchema,
  OmnilottieVideoToLottieOutputSchema,
} from './schemas.gen.js'

/**
 * Map of fal-json endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const falJsonEndpointSchemaMap: {
  readonly 'bria/fibo-edit/edit/structured_instruction': {
    readonly input: typeof FiboEditEditStructured_instructionInputSchema
    readonly output: typeof FiboEditEditStructured_instructionOutputSchema
  }
  readonly 'bria/fibo-lite/generate/structured_prompt': {
    readonly input: typeof FiboLiteGenerateStructured_promptInputSchema
    readonly output: typeof FiboLiteGenerateStructured_promptOutputSchema
  }
  readonly 'bria/fibo-lite/generate/structured_prompt/lite': {
    readonly input: typeof FiboLiteGenerateStructured_promptLiteInputSchema
    readonly output: typeof FiboLiteGenerateStructured_promptLiteOutputSchema
  }
  readonly 'bria/fibo/generate/structured_prompt': {
    readonly input: typeof FiboGenerateStructured_promptInputSchema
    readonly output: typeof FiboGenerateStructured_promptOutputSchema
  }
  readonly 'fal-ai/bagel/understand': {
    readonly input: typeof BagelUnderstandInputSchema
    readonly output: typeof BagelUnderstandOutputSchema
  }
  readonly 'fal-ai/ffmpeg-api/loudnorm': {
    readonly input: typeof FfmpegApiLoudnormInputSchema
    readonly output: typeof FfmpegApiLoudnormOutputSchema
  }
  readonly 'fal-ai/ffmpeg-api/metadata': {
    readonly input: typeof FfmpegApiMetadataInputSchema
    readonly output: typeof FfmpegApiMetadataOutputSchema
  }
  readonly 'fal-ai/ffmpeg-api/waveform': {
    readonly input: typeof FfmpegApiWaveformInputSchema
    readonly output: typeof FfmpegApiWaveformOutputSchema
  }
  readonly 'fal-ai/omnilottie': {
    readonly input: typeof OmnilottieInputSchema
    readonly output: typeof OmnilottieOutputSchema
  }
  readonly 'fal-ai/omnilottie/image-to-lottie': {
    readonly input: typeof OmnilottieImageToLottieInputSchema
    readonly output: typeof OmnilottieImageToLottieOutputSchema
  }
  readonly 'fal-ai/omnilottie/video-to-lottie': {
    readonly input: typeof OmnilottieVideoToLottieInputSchema
    readonly output: typeof OmnilottieVideoToLottieOutputSchema
  }
} = {
  'bria/fibo-edit/edit/structured_instruction': {
    input: FiboEditEditStructured_instructionInputSchema,
    output: FiboEditEditStructured_instructionOutputSchema,
  },
  'bria/fibo-lite/generate/structured_prompt': {
    input: FiboLiteGenerateStructured_promptInputSchema,
    output: FiboLiteGenerateStructured_promptOutputSchema,
  },
  'bria/fibo-lite/generate/structured_prompt/lite': {
    input: FiboLiteGenerateStructured_promptLiteInputSchema,
    output: FiboLiteGenerateStructured_promptLiteOutputSchema,
  },
  'bria/fibo/generate/structured_prompt': {
    input: FiboGenerateStructured_promptInputSchema,
    output: FiboGenerateStructured_promptOutputSchema,
  },
  'fal-ai/bagel/understand': {
    input: BagelUnderstandInputSchema,
    output: BagelUnderstandOutputSchema,
  },
  'fal-ai/ffmpeg-api/loudnorm': {
    input: FfmpegApiLoudnormInputSchema,
    output: FfmpegApiLoudnormOutputSchema,
  },
  'fal-ai/ffmpeg-api/metadata': {
    input: FfmpegApiMetadataInputSchema,
    output: FfmpegApiMetadataOutputSchema,
  },
  'fal-ai/ffmpeg-api/waveform': {
    input: FfmpegApiWaveformInputSchema,
    output: FfmpegApiWaveformOutputSchema,
  },
  'fal-ai/omnilottie': {
    input: OmnilottieInputSchema,
    output: OmnilottieOutputSchema,
  },
  'fal-ai/omnilottie/image-to-lottie': {
    input: OmnilottieImageToLottieInputSchema,
    output: OmnilottieImageToLottieOutputSchema,
  },
  'fal-ai/omnilottie/video-to-lottie': {
    input: OmnilottieVideoToLottieInputSchema,
    output: OmnilottieVideoToLottieOutputSchema,
  },
}
