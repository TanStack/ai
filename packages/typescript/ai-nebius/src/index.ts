// ===========================
// New tree-shakeable adapters
// ===========================

// Text/Chat adapter
export {
  NebiusTextAdapter,
  NebiusTextModels,
  createNebiusChat,
  nebiusText,
  type NebiusTextAdapterOptions,
  type NebiusTextModel,
  type NebiusTextProviderOptions,
} from './adapters/text'

// Summarize adapter
export {
  NebiusSummarizeAdapter,
  NebiusSummarizeModels,
  createNebiusSummarize,
  nebiusSummarize,
  type NebiusSummarizeAdapterOptions,
  type NebiusSummarizeModel,
  type NebiusSummarizeProviderOptions,
} from './adapters/summarize'

// ===========================
// Type Exports
// ===========================

export type {
  NebiusImageMetadata,
  NebiusAudioMetadata,
  NebiusVideoMetadata,
  NebiusDocumentMetadata,
  NebiusMessageMetadataByModality,
} from './message-types'
