// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaElevenlabsSpeechToTextInput,
  zSchemaElevenlabsSpeechToTextOutput,
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

import type {
  SchemaElevenlabsSpeechToTextInput,
  SchemaElevenlabsSpeechToTextOutput,
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

export type SpeechToTextEndpointMap = {
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
}

export const SpeechToTextSchemaMap = {
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
} as const

/** Union type of all speech-to-text model endpoint IDs */
export type SpeechToTextModel = keyof SpeechToTextEndpointMap

/** Get the input type for a specific speech-to-text model */
export type SpeechToTextModelInput<T extends SpeechToTextModel> = SpeechToTextEndpointMap[T]['input']

/** Get the output type for a specific speech-to-text model */
export type SpeechToTextModelOutput<T extends SpeechToTextModel> = SpeechToTextEndpointMap[T]['output']
