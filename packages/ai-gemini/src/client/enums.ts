import type {
  ActivityHandling as SdkActivityHandling,
  EndSensitivity as SdkEndSensitivity,
  FileState as SdkFileState,
  FinishReason as SdkFinishReason,
  FunctionCallingConfigMode as SdkFunctionCallingConfigMode,
  HarmBlockThreshold as SdkHarmBlockThreshold,
  HarmCategory as SdkHarmCategory,
  Modality as SdkModality,
  StartSensitivity as SdkStartSensitivity,
  ThinkingLevel as SdkThinkingLevel,
  TurnCoverage as SdkTurnCoverage,
  VideoGenerationReferenceType as SdkVideoGenerationReferenceType,
} from '@google/genai'

// Copies of the @google/genai 2.32.0 string enums. In each SDK enum, every
// member value is the same as its name, so one key list builds the object.
// The type is the SDK enum type, so values keep the same type identity.
// The three public enums (re-exported from the package) also get their
// member types.
// `@__PURE__` lets bundlers drop an enum that nothing uses.
function sdkEnum<T>(keys: Array<keyof T & string>) {
  // ponytail: an object literal cannot have an SDK enum type, so one cast.
  return Object.fromEntries(keys.map((key) => [key, key])) as T
}

export type HarmBlockThreshold = SdkHarmBlockThreshold
// The member types, so `HarmBlockThreshold.X` still works as a type.
// oxlint-disable-next-line typescript/no-namespace -- a type-only namespace; nothing is emitted.
export declare namespace HarmBlockThreshold {
  type HARM_BLOCK_THRESHOLD_UNSPECIFIED =
    SdkHarmBlockThreshold.HARM_BLOCK_THRESHOLD_UNSPECIFIED
  type BLOCK_LOW_AND_ABOVE = SdkHarmBlockThreshold.BLOCK_LOW_AND_ABOVE
  type BLOCK_MEDIUM_AND_ABOVE = SdkHarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
  type BLOCK_ONLY_HIGH = SdkHarmBlockThreshold.BLOCK_ONLY_HIGH
  type BLOCK_NONE = SdkHarmBlockThreshold.BLOCK_NONE
  type OFF = SdkHarmBlockThreshold.OFF
}
export const HarmBlockThreshold = /* @__PURE__ */ sdkEnum<
  typeof SdkHarmBlockThreshold
>([
  'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
  'BLOCK_LOW_AND_ABOVE',
  'BLOCK_MEDIUM_AND_ABOVE',
  'BLOCK_ONLY_HIGH',
  'BLOCK_NONE',
  'OFF',
])

export type HarmCategory = SdkHarmCategory
// The member types, so `HarmCategory.X` still works as a type.
// oxlint-disable-next-line typescript/no-namespace -- a type-only namespace; nothing is emitted.
export declare namespace HarmCategory {
  type HARM_CATEGORY_UNSPECIFIED = SdkHarmCategory.HARM_CATEGORY_UNSPECIFIED
  type HARM_CATEGORY_HARASSMENT = SdkHarmCategory.HARM_CATEGORY_HARASSMENT
  type HARM_CATEGORY_HATE_SPEECH = SdkHarmCategory.HARM_CATEGORY_HATE_SPEECH
  type HARM_CATEGORY_SEXUALLY_EXPLICIT =
    SdkHarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT
  type HARM_CATEGORY_DANGEROUS_CONTENT =
    SdkHarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT
  type HARM_CATEGORY_CIVIC_INTEGRITY =
    SdkHarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY
  type HARM_CATEGORY_IMAGE_HATE = SdkHarmCategory.HARM_CATEGORY_IMAGE_HATE
  type HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT =
    SdkHarmCategory.HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT
  type HARM_CATEGORY_IMAGE_HARASSMENT =
    SdkHarmCategory.HARM_CATEGORY_IMAGE_HARASSMENT
  type HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT =
    SdkHarmCategory.HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT
  type HARM_CATEGORY_JAILBREAK = SdkHarmCategory.HARM_CATEGORY_JAILBREAK
}
export const HarmCategory = /* @__PURE__ */ sdkEnum<typeof SdkHarmCategory>([
  'HARM_CATEGORY_UNSPECIFIED',
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_CIVIC_INTEGRITY',
  'HARM_CATEGORY_IMAGE_HATE',
  'HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT',
  'HARM_CATEGORY_IMAGE_HARASSMENT',
  'HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_JAILBREAK',
])

export type ThinkingLevel = SdkThinkingLevel
// The member types, so `ThinkingLevel.X` still works as a type.
// oxlint-disable-next-line typescript/no-namespace -- a type-only namespace; nothing is emitted.
export declare namespace ThinkingLevel {
  type THINKING_LEVEL_UNSPECIFIED = SdkThinkingLevel.THINKING_LEVEL_UNSPECIFIED
  type MINIMAL = SdkThinkingLevel.MINIMAL
  type LOW = SdkThinkingLevel.LOW
  type MEDIUM = SdkThinkingLevel.MEDIUM
  type HIGH = SdkThinkingLevel.HIGH
}
export const ThinkingLevel = /* @__PURE__ */ sdkEnum<typeof SdkThinkingLevel>([
  'THINKING_LEVEL_UNSPECIFIED',
  'MINIMAL',
  'LOW',
  'MEDIUM',
  'HIGH',
])

export type FinishReason = SdkFinishReason
export const FinishReason = /* @__PURE__ */ sdkEnum<typeof SdkFinishReason>([
  'FINISH_REASON_UNSPECIFIED',
  'STOP',
  'MAX_TOKENS',
  'SAFETY',
  'RECITATION',
  'LANGUAGE',
  'OTHER',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'MALFORMED_FUNCTION_CALL',
  'IMAGE_SAFETY',
  'UNEXPECTED_TOOL_CALL',
  'TOO_MANY_TOOL_CALLS',
  'IMAGE_PROHIBITED_CONTENT',
  'NO_IMAGE',
  'IMAGE_RECITATION',
  'IMAGE_OTHER',
  'CONTINUATION',
])

export type FunctionCallingConfigMode = SdkFunctionCallingConfigMode
export const FunctionCallingConfigMode = /* @__PURE__ */ sdkEnum<
  typeof SdkFunctionCallingConfigMode
>(['MODE_UNSPECIFIED', 'AUTO', 'ANY', 'NONE', 'VALIDATED'])

export type FileState = SdkFileState
export const FileState = /* @__PURE__ */ sdkEnum<typeof SdkFileState>([
  'STATE_UNSPECIFIED',
  'PROCESSING',
  'ACTIVE',
  'FAILED',
])

export type VideoGenerationReferenceType = SdkVideoGenerationReferenceType
export const VideoGenerationReferenceType = /* @__PURE__ */ sdkEnum<
  typeof SdkVideoGenerationReferenceType
>(['ASSET', 'STYLE'])

export type ActivityHandling = SdkActivityHandling
export const ActivityHandling = /* @__PURE__ */ sdkEnum<
  typeof SdkActivityHandling
>([
  'ACTIVITY_HANDLING_UNSPECIFIED',
  'START_OF_ACTIVITY_INTERRUPTS',
  'NO_INTERRUPTION',
])

export type EndSensitivity = SdkEndSensitivity
export const EndSensitivity = /* @__PURE__ */ sdkEnum<typeof SdkEndSensitivity>(
  [
    'END_SENSITIVITY_UNSPECIFIED',
    'END_SENSITIVITY_HIGH',
    'END_SENSITIVITY_LOW',
  ],
)

export type Modality = SdkModality
export const Modality = /* @__PURE__ */ sdkEnum<typeof SdkModality>([
  'MODALITY_UNSPECIFIED',
  'TEXT',
  'IMAGE',
  'AUDIO',
  'VIDEO',
])

export type StartSensitivity = SdkStartSensitivity
export const StartSensitivity = /* @__PURE__ */ sdkEnum<
  typeof SdkStartSensitivity
>([
  'START_SENSITIVITY_UNSPECIFIED',
  'START_SENSITIVITY_HIGH',
  'START_SENSITIVITY_LOW',
])

export type TurnCoverage = SdkTurnCoverage
export const TurnCoverage = /* @__PURE__ */ sdkEnum<typeof SdkTurnCoverage>([
  'TURN_COVERAGE_UNSPECIFIED',
  'TURN_INCLUDES_ONLY_ACTIVITY',
  'TURN_INCLUDES_ALL_INPUT',
  'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO',
])
