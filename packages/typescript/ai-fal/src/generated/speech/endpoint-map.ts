// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaChatterboxSpeechToSpeechInput,
  zSchemaChatterboxSpeechToSpeechOutput,
  zSchemaChatterboxTextToSpeechInput,
  zSchemaChatterboxTextToSpeechMultilingualInput,
  zSchemaChatterboxTextToSpeechMultilingualOutput,
  zSchemaChatterboxTextToSpeechOutput,
  zSchemaChatterboxhdSpeechToSpeechInput,
  zSchemaChatterboxhdSpeechToSpeechOutput,
  zSchemaChatterboxhdTextToSpeechInput,
  zSchemaChatterboxhdTextToSpeechOutput,
  zSchemaDiaTtsInput,
  zSchemaDiaTtsOutput,
  zSchemaElevenlabsTtsTurboV25Input,
  zSchemaElevenlabsTtsTurboV25Output,
  zSchemaIndexTts2TextToSpeechInput,
  zSchemaIndexTts2TextToSpeechOutput,
  zSchemaKlingVideoV1TtsInput,
  zSchemaKlingVideoV1TtsOutput,
  zSchemaMayaBatchInput,
  zSchemaMayaBatchOutput,
  zSchemaMayaInput,
  zSchemaMayaOutput,
  zSchemaMayaStreamInput,
  zSchemaMayaStreamOutput,
  zSchemaMinimaxPreviewSpeech25HdInput,
  zSchemaMinimaxPreviewSpeech25HdOutput,
  zSchemaMinimaxPreviewSpeech25TurboInput,
  zSchemaMinimaxPreviewSpeech25TurboOutput,
  zSchemaMinimaxSpeech02HdInput,
  zSchemaMinimaxSpeech02HdOutput,
  zSchemaMinimaxSpeech02TurboInput,
  zSchemaMinimaxSpeech02TurboOutput,
  zSchemaMinimaxSpeech26HdInput,
  zSchemaMinimaxSpeech26HdOutput,
  zSchemaMinimaxSpeech26TurboInput,
  zSchemaMinimaxSpeech26TurboOutput,
  zSchemaMinimaxVoiceCloneInput,
  zSchemaMinimaxVoiceCloneOutput,
  zSchemaMinimaxVoiceDesignInput,
  zSchemaMinimaxVoiceDesignOutput,
  zSchemaOrpheusTtsInput,
  zSchemaOrpheusTtsOutput,
  zSchemaQwen3TtsTextToSpeech06bInput,
  zSchemaQwen3TtsTextToSpeech06bOutput,
  zSchemaQwen3TtsTextToSpeech17bInput,
  zSchemaQwen3TtsTextToSpeech17bOutput,
  zSchemaQwen3TtsVoiceDesign17bInput,
  zSchemaQwen3TtsVoiceDesign17bOutput,
  zSchemaVibevoice05bInput,
  zSchemaVibevoice05bOutput,
  zSchemaVibevoice7bInput,
  zSchemaVibevoice7bOutput,
  zSchemaVibevoiceInput,
  zSchemaVibevoiceOutput,
} from './zod.gen'
import type { z } from 'zod'

import type {
  SchemaChatterboxSpeechToSpeechInput,
  SchemaChatterboxSpeechToSpeechOutput,
  SchemaChatterboxTextToSpeechInput,
  SchemaChatterboxTextToSpeechMultilingualInput,
  SchemaChatterboxTextToSpeechMultilingualOutput,
  SchemaChatterboxTextToSpeechOutput,
  SchemaChatterboxhdSpeechToSpeechInput,
  SchemaChatterboxhdSpeechToSpeechOutput,
  SchemaChatterboxhdTextToSpeechInput,
  SchemaChatterboxhdTextToSpeechOutput,
  SchemaDiaTtsInput,
  SchemaDiaTtsOutput,
  SchemaElevenlabsTtsTurboV25Input,
  SchemaElevenlabsTtsTurboV25Output,
  SchemaIndexTts2TextToSpeechInput,
  SchemaIndexTts2TextToSpeechOutput,
  SchemaKlingVideoV1TtsInput,
  SchemaKlingVideoV1TtsOutput,
  SchemaMayaBatchInput,
  SchemaMayaBatchOutput,
  SchemaMayaInput,
  SchemaMayaOutput,
  SchemaMayaStreamInput,
  SchemaMayaStreamOutput,
  SchemaMinimaxPreviewSpeech25HdInput,
  SchemaMinimaxPreviewSpeech25HdOutput,
  SchemaMinimaxPreviewSpeech25TurboInput,
  SchemaMinimaxPreviewSpeech25TurboOutput,
  SchemaMinimaxSpeech02HdInput,
  SchemaMinimaxSpeech02HdOutput,
  SchemaMinimaxSpeech02TurboInput,
  SchemaMinimaxSpeech02TurboOutput,
  SchemaMinimaxSpeech26HdInput,
  SchemaMinimaxSpeech26HdOutput,
  SchemaMinimaxSpeech26TurboInput,
  SchemaMinimaxSpeech26TurboOutput,
  SchemaMinimaxVoiceCloneInput,
  SchemaMinimaxVoiceCloneOutput,
  SchemaMinimaxVoiceDesignInput,
  SchemaMinimaxVoiceDesignOutput,
  SchemaOrpheusTtsInput,
  SchemaOrpheusTtsOutput,
  SchemaQwen3TtsTextToSpeech06bInput,
  SchemaQwen3TtsTextToSpeech06bOutput,
  SchemaQwen3TtsTextToSpeech17bInput,
  SchemaQwen3TtsTextToSpeech17bOutput,
  SchemaQwen3TtsVoiceDesign17bInput,
  SchemaQwen3TtsVoiceDesign17bOutput,
  SchemaVibevoice05bInput,
  SchemaVibevoice05bOutput,
  SchemaVibevoice7bInput,
  SchemaVibevoice7bOutput,
  SchemaVibevoiceInput,
  SchemaVibevoiceOutput,
} from './types.gen'

export type SpeechEndpointMap = {
  'resemble-ai/chatterboxhd/speech-to-speech': {
    input: SchemaChatterboxhdSpeechToSpeechInput
    output: SchemaChatterboxhdSpeechToSpeechOutput
  }
  'fal-ai/chatterbox/speech-to-speech': {
    input: SchemaChatterboxSpeechToSpeechInput
    output: SchemaChatterboxSpeechToSpeechOutput
  }
  'fal-ai/qwen-3-tts/voice-design/1.7b': {
    input: SchemaQwen3TtsVoiceDesign17bInput
    output: SchemaQwen3TtsVoiceDesign17bOutput
  }
  'fal-ai/qwen-3-tts/text-to-speech/1.7b': {
    input: SchemaQwen3TtsTextToSpeech17bInput
    output: SchemaQwen3TtsTextToSpeech17bOutput
  }
  'fal-ai/qwen-3-tts/text-to-speech/0.6b': {
    input: SchemaQwen3TtsTextToSpeech06bInput
    output: SchemaQwen3TtsTextToSpeech06bOutput
  }
  'fal-ai/vibevoice/0.5b': {
    input: SchemaVibevoice05bInput
    output: SchemaVibevoice05bOutput
  }
  'fal-ai/maya/batch': {
    input: SchemaMayaBatchInput
    output: SchemaMayaBatchOutput
  }
  'fal-ai/maya/stream': {
    input: SchemaMayaStreamInput
    output: SchemaMayaStreamOutput
  }
  'fal-ai/maya': {
    input: SchemaMayaInput
    output: SchemaMayaOutput
  }
  'fal-ai/minimax/speech-2.6-turbo': {
    input: SchemaMinimaxSpeech26TurboInput
    output: SchemaMinimaxSpeech26TurboOutput
  }
  'fal-ai/minimax/speech-2.6-hd': {
    input: SchemaMinimaxSpeech26HdInput
    output: SchemaMinimaxSpeech26HdOutput
  }
  'fal-ai/index-tts-2/text-to-speech': {
    input: SchemaIndexTts2TextToSpeechInput
    output: SchemaIndexTts2TextToSpeechOutput
  }
  'fal-ai/kling-video/v1/tts': {
    input: SchemaKlingVideoV1TtsInput
    output: SchemaKlingVideoV1TtsOutput
  }
  'fal-ai/chatterbox/text-to-speech/multilingual': {
    input: SchemaChatterboxTextToSpeechMultilingualInput
    output: SchemaChatterboxTextToSpeechMultilingualOutput
  }
  'fal-ai/vibevoice/7b': {
    input: SchemaVibevoice7bInput
    output: SchemaVibevoice7bOutput
  }
  'fal-ai/vibevoice': {
    input: SchemaVibevoiceInput
    output: SchemaVibevoiceOutput
  }
  'fal-ai/minimax/preview/speech-2.5-hd': {
    input: SchemaMinimaxPreviewSpeech25HdInput
    output: SchemaMinimaxPreviewSpeech25HdOutput
  }
  'fal-ai/minimax/preview/speech-2.5-turbo': {
    input: SchemaMinimaxPreviewSpeech25TurboInput
    output: SchemaMinimaxPreviewSpeech25TurboOutput
  }
  'fal-ai/minimax/voice-design': {
    input: SchemaMinimaxVoiceDesignInput
    output: SchemaMinimaxVoiceDesignOutput
  }
  'resemble-ai/chatterboxhd/text-to-speech': {
    input: SchemaChatterboxhdTextToSpeechInput
    output: SchemaChatterboxhdTextToSpeechOutput
  }
  'fal-ai/chatterbox/text-to-speech': {
    input: SchemaChatterboxTextToSpeechInput
    output: SchemaChatterboxTextToSpeechOutput
  }
  'fal-ai/minimax/voice-clone': {
    input: SchemaMinimaxVoiceCloneInput
    output: SchemaMinimaxVoiceCloneOutput
  }
  'fal-ai/minimax/speech-02-turbo': {
    input: SchemaMinimaxSpeech02TurboInput
    output: SchemaMinimaxSpeech02TurboOutput
  }
  'fal-ai/minimax/speech-02-hd': {
    input: SchemaMinimaxSpeech02HdInput
    output: SchemaMinimaxSpeech02HdOutput
  }
  'fal-ai/dia-tts': {
    input: SchemaDiaTtsInput
    output: SchemaDiaTtsOutput
  }
  'fal-ai/orpheus-tts': {
    input: SchemaOrpheusTtsInput
    output: SchemaOrpheusTtsOutput
  }
  'fal-ai/elevenlabs/tts/turbo-v2.5': {
    input: SchemaElevenlabsTtsTurboV25Input
    output: SchemaElevenlabsTtsTurboV25Output
  }
}

/** Union type of all speech model endpoint IDs */
export type SpeechModel = keyof SpeechEndpointMap

export const SpeechSchemaMap: Record<
  SpeechModel,
  {
    input: z.ZodSchema<SpeechModelInput<SpeechModel>>
    output: z.ZodSchema<SpeechModelOutput<SpeechModel>>
  }
> = {
  ['resemble-ai/chatterboxhd/speech-to-speech']: {
    input: zSchemaChatterboxhdSpeechToSpeechInput,
    output: zSchemaChatterboxhdSpeechToSpeechOutput,
  },
  ['fal-ai/chatterbox/speech-to-speech']: {
    input: zSchemaChatterboxSpeechToSpeechInput,
    output: zSchemaChatterboxSpeechToSpeechOutput,
  },
  ['fal-ai/qwen-3-tts/voice-design/1.7b']: {
    input: zSchemaQwen3TtsVoiceDesign17bInput,
    output: zSchemaQwen3TtsVoiceDesign17bOutput,
  },
  ['fal-ai/qwen-3-tts/text-to-speech/1.7b']: {
    input: zSchemaQwen3TtsTextToSpeech17bInput,
    output: zSchemaQwen3TtsTextToSpeech17bOutput,
  },
  ['fal-ai/qwen-3-tts/text-to-speech/0.6b']: {
    input: zSchemaQwen3TtsTextToSpeech06bInput,
    output: zSchemaQwen3TtsTextToSpeech06bOutput,
  },
  ['fal-ai/vibevoice/0.5b']: {
    input: zSchemaVibevoice05bInput,
    output: zSchemaVibevoice05bOutput,
  },
  ['fal-ai/maya/batch']: {
    input: zSchemaMayaBatchInput,
    output: zSchemaMayaBatchOutput,
  },
  ['fal-ai/maya/stream']: {
    input: zSchemaMayaStreamInput,
    output: zSchemaMayaStreamOutput,
  },
  ['fal-ai/maya']: {
    input: zSchemaMayaInput,
    output: zSchemaMayaOutput,
  },
  ['fal-ai/minimax/speech-2.6-turbo']: {
    input: zSchemaMinimaxSpeech26TurboInput,
    output: zSchemaMinimaxSpeech26TurboOutput,
  },
  ['fal-ai/minimax/speech-2.6-hd']: {
    input: zSchemaMinimaxSpeech26HdInput,
    output: zSchemaMinimaxSpeech26HdOutput,
  },
  ['fal-ai/index-tts-2/text-to-speech']: {
    input: zSchemaIndexTts2TextToSpeechInput,
    output: zSchemaIndexTts2TextToSpeechOutput,
  },
  ['fal-ai/kling-video/v1/tts']: {
    input: zSchemaKlingVideoV1TtsInput,
    output: zSchemaKlingVideoV1TtsOutput,
  },
  ['fal-ai/chatterbox/text-to-speech/multilingual']: {
    input: zSchemaChatterboxTextToSpeechMultilingualInput,
    output: zSchemaChatterboxTextToSpeechMultilingualOutput,
  },
  ['fal-ai/vibevoice/7b']: {
    input: zSchemaVibevoice7bInput,
    output: zSchemaVibevoice7bOutput,
  },
  ['fal-ai/vibevoice']: {
    input: zSchemaVibevoiceInput,
    output: zSchemaVibevoiceOutput,
  },
  ['fal-ai/minimax/preview/speech-2.5-hd']: {
    input: zSchemaMinimaxPreviewSpeech25HdInput,
    output: zSchemaMinimaxPreviewSpeech25HdOutput,
  },
  ['fal-ai/minimax/preview/speech-2.5-turbo']: {
    input: zSchemaMinimaxPreviewSpeech25TurboInput,
    output: zSchemaMinimaxPreviewSpeech25TurboOutput,
  },
  ['fal-ai/minimax/voice-design']: {
    input: zSchemaMinimaxVoiceDesignInput,
    output: zSchemaMinimaxVoiceDesignOutput,
  },
  ['resemble-ai/chatterboxhd/text-to-speech']: {
    input: zSchemaChatterboxhdTextToSpeechInput,
    output: zSchemaChatterboxhdTextToSpeechOutput,
  },
  ['fal-ai/chatterbox/text-to-speech']: {
    input: zSchemaChatterboxTextToSpeechInput,
    output: zSchemaChatterboxTextToSpeechOutput,
  },
  ['fal-ai/minimax/voice-clone']: {
    input: zSchemaMinimaxVoiceCloneInput,
    output: zSchemaMinimaxVoiceCloneOutput,
  },
  ['fal-ai/minimax/speech-02-turbo']: {
    input: zSchemaMinimaxSpeech02TurboInput,
    output: zSchemaMinimaxSpeech02TurboOutput,
  },
  ['fal-ai/minimax/speech-02-hd']: {
    input: zSchemaMinimaxSpeech02HdInput,
    output: zSchemaMinimaxSpeech02HdOutput,
  },
  ['fal-ai/dia-tts']: {
    input: zSchemaDiaTtsInput,
    output: zSchemaDiaTtsOutput,
  },
  ['fal-ai/orpheus-tts']: {
    input: zSchemaOrpheusTtsInput,
    output: zSchemaOrpheusTtsOutput,
  },
  ['fal-ai/elevenlabs/tts/turbo-v2.5']: {
    input: zSchemaElevenlabsTtsTurboV25Input,
    output: zSchemaElevenlabsTtsTurboV25Output,
  },
}

/** Get the input type for a specific speech model */
export type SpeechModelInput<T extends SpeechModel> =
  SpeechEndpointMap[T]['input']

/** Get the output type for a specific speech model */
export type SpeechModelOutput<T extends SpeechModel> =
  SpeechEndpointMap[T]['output']
