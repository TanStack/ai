// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaAiDetectorDetectTextInput,
  zSchemaAiDetectorDetectTextOutput,
  zSchemaElevenlabsSpeechToTextInput,
  zSchemaElevenlabsSpeechToTextOutput,
  zSchemaElevenlabsSpeechToTextScribeV2Input,
  zSchemaElevenlabsSpeechToTextScribeV2Output,
  zSchemaNemotronAsrInput,
  zSchemaNemotronAsrOutput,
  zSchemaNemotronAsrStreamInput,
  zSchemaNemotronAsrStreamOutput,
  zSchemaRouterVideoEnterpriseInput,
  zSchemaRouterVideoEnterpriseOutput,
  zSchemaRouterVideoInput,
  zSchemaRouterVideoOutput,
  zSchemaSileroVadInput,
  zSchemaSileroVadOutput,
  zSchemaSmartTurnInput,
  zSchemaSmartTurnOutput,
  zSchemaSpeechToTextInput,
  zSchemaSpeechToTextOutput,
  zSchemaSpeechToTextStreamInput,
  zSchemaSpeechToTextStreamOutput,
  zSchemaSpeechToTextTurboInput,
  zSchemaSpeechToTextTurboOutput,
  zSchemaSpeechToTextTurboStreamInput,
  zSchemaSpeechToTextTurboStreamOutput,
  zSchemaWhisperInput,
  zSchemaWhisperOutput,
  zSchemaWizperInput,
  zSchemaWizperOutput,
} from './zod.gen'
import type { z } from 'zod'

import type {
  SchemaAiDetectorDetectTextInput,
  SchemaAiDetectorDetectTextOutput,
  SchemaElevenlabsSpeechToTextInput,
  SchemaElevenlabsSpeechToTextOutput,
  SchemaElevenlabsSpeechToTextScribeV2Input,
  SchemaElevenlabsSpeechToTextScribeV2Output,
  SchemaNemotronAsrInput,
  SchemaNemotronAsrOutput,
  SchemaNemotronAsrStreamInput,
  SchemaNemotronAsrStreamOutput,
  SchemaRouterVideoEnterpriseInput,
  SchemaRouterVideoEnterpriseOutput,
  SchemaRouterVideoInput,
  SchemaRouterVideoOutput,
  SchemaSileroVadInput,
  SchemaSileroVadOutput,
  SchemaSmartTurnInput,
  SchemaSmartTurnOutput,
  SchemaSpeechToTextInput,
  SchemaSpeechToTextOutput,
  SchemaSpeechToTextStreamInput,
  SchemaSpeechToTextStreamOutput,
  SchemaSpeechToTextTurboInput,
  SchemaSpeechToTextTurboOutput,
  SchemaSpeechToTextTurboStreamInput,
  SchemaSpeechToTextTurboStreamOutput,
  SchemaWhisperInput,
  SchemaWhisperOutput,
  SchemaWizperInput,
  SchemaWizperOutput,
} from './types.gen'

export type TextEndpointMap = {
  'fal-ai/nemotron/asr/stream': {
    input: SchemaNemotronAsrStreamInput
    output: SchemaNemotronAsrStreamOutput
  }
  'fal-ai/nemotron/asr': {
    input: SchemaNemotronAsrInput
    output: SchemaNemotronAsrOutput
  }
  'fal-ai/silero-vad': {
    input: SchemaSileroVadInput
    output: SchemaSileroVadOutput
  }
  'fal-ai/elevenlabs/speech-to-text/scribe-v2': {
    input: SchemaElevenlabsSpeechToTextScribeV2Input
    output: SchemaElevenlabsSpeechToTextScribeV2Output
  }
  'fal-ai/smart-turn': {
    input: SchemaSmartTurnInput
    output: SchemaSmartTurnOutput
  }
  'fal-ai/speech-to-text/turbo': {
    input: SchemaSpeechToTextTurboInput
    output: SchemaSpeechToTextTurboOutput
  }
  'fal-ai/speech-to-text/turbo/stream': {
    input: SchemaSpeechToTextTurboStreamInput
    output: SchemaSpeechToTextTurboStreamOutput
  }
  'fal-ai/speech-to-text/stream': {
    input: SchemaSpeechToTextStreamInput
    output: SchemaSpeechToTextStreamOutput
  }
  'fal-ai/speech-to-text': {
    input: SchemaSpeechToTextInput
    output: SchemaSpeechToTextOutput
  }
  'fal-ai/elevenlabs/speech-to-text': {
    input: SchemaElevenlabsSpeechToTextInput
    output: SchemaElevenlabsSpeechToTextOutput
  }
  'fal-ai/wizper': {
    input: SchemaWizperInput
    output: SchemaWizperOutput
  }
  'fal-ai/whisper': {
    input: SchemaWhisperInput
    output: SchemaWhisperOutput
  }
  'half-moon-ai/ai-detector/detect-text': {
    input: SchemaAiDetectorDetectTextInput
    output: SchemaAiDetectorDetectTextOutput
  }
  'openrouter/router/video/enterprise': {
    input: SchemaRouterVideoEnterpriseInput
    output: SchemaRouterVideoEnterpriseOutput
  }
  'openrouter/router/video': {
    input: SchemaRouterVideoInput
    output: SchemaRouterVideoOutput
  }
}

/** Union type of all text model endpoint IDs */
export type TextModel = keyof TextEndpointMap

export const TextSchemaMap: Record<
  TextModel,
  {
    input: z.ZodSchema<TextModelInput<TextModel>>
    output: z.ZodSchema<TextModelOutput<TextModel>>
  }
> = {
  ['fal-ai/nemotron/asr/stream']: {
    input: zSchemaNemotronAsrStreamInput,
    output: zSchemaNemotronAsrStreamOutput,
  },
  ['fal-ai/nemotron/asr']: {
    input: zSchemaNemotronAsrInput,
    output: zSchemaNemotronAsrOutput,
  },
  ['fal-ai/silero-vad']: {
    input: zSchemaSileroVadInput,
    output: zSchemaSileroVadOutput,
  },
  ['fal-ai/elevenlabs/speech-to-text/scribe-v2']: {
    input: zSchemaElevenlabsSpeechToTextScribeV2Input,
    output: zSchemaElevenlabsSpeechToTextScribeV2Output,
  },
  ['fal-ai/smart-turn']: {
    input: zSchemaSmartTurnInput,
    output: zSchemaSmartTurnOutput,
  },
  ['fal-ai/speech-to-text/turbo']: {
    input: zSchemaSpeechToTextTurboInput,
    output: zSchemaSpeechToTextTurboOutput,
  },
  ['fal-ai/speech-to-text/turbo/stream']: {
    input: zSchemaSpeechToTextTurboStreamInput,
    output: zSchemaSpeechToTextTurboStreamOutput,
  },
  ['fal-ai/speech-to-text/stream']: {
    input: zSchemaSpeechToTextStreamInput,
    output: zSchemaSpeechToTextStreamOutput,
  },
  ['fal-ai/speech-to-text']: {
    input: zSchemaSpeechToTextInput,
    output: zSchemaSpeechToTextOutput,
  },
  ['fal-ai/elevenlabs/speech-to-text']: {
    input: zSchemaElevenlabsSpeechToTextInput,
    output: zSchemaElevenlabsSpeechToTextOutput,
  },
  ['fal-ai/wizper']: {
    input: zSchemaWizperInput,
    output: zSchemaWizperOutput,
  },
  ['fal-ai/whisper']: {
    input: zSchemaWhisperInput,
    output: zSchemaWhisperOutput,
  },
  ['half-moon-ai/ai-detector/detect-text']: {
    input: zSchemaAiDetectorDetectTextInput,
    output: zSchemaAiDetectorDetectTextOutput,
  },
  ['openrouter/router/video/enterprise']: {
    input: zSchemaRouterVideoEnterpriseInput,
    output: zSchemaRouterVideoEnterpriseOutput,
  },
  ['openrouter/router/video']: {
    input: zSchemaRouterVideoInput,
    output: zSchemaRouterVideoOutput,
  },
}

/** Get the input type for a specific text model */
export type TextModelInput<T extends TextModel> = TextEndpointMap[T]['input']

/** Get the output type for a specific text model */
export type TextModelOutput<T extends TextModel> = TextEndpointMap[T]['output']
