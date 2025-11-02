/**
 * Stream Processing System
 *
 * Exports:
 * - StreamProcessor: Main processor class
 * - Chunk strategies: Built-in strategies for controlling text updates
 * - Types: All stream processing types
 */

export { StreamProcessor } from "./processor";
export {
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
  DebounceStrategy,
} from "./chunk-strategies";
export type {
  StreamChunk,
  ProcessedEvent,
  ChunkStrategy,
  StreamParser,
  StreamProcessorOptions,
  StreamProcessorHandlers,
  InternalToolCallState,
} from "./types";
