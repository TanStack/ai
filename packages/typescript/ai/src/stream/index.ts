/**
 * Stream Processing Module
 *
 * Unified stream processing for both server and client.
 */

// Core processor
export { StreamProcessor, createReplayStream } from './processor'

// Strategies
export {
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
} from './strategies'

// JSON parser
export {
  PartialJSONParser,
  defaultJSONParser,
  parsePartialJSON,
} from './json-parser'
export type { JSONParser } from './json-parser'

// Types
export type {
  ChunkStrategy,
  ChunkRecording,
  InternalToolCallState,
  ProcessorResult,
  ProcessorState,
  StreamProcessorHandlers,
  StreamProcessorOptions,
  ToolCallState,
  ToolResultState,
} from './types'
