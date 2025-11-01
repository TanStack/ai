/**
 * Built-in Chunk Strategies
 *
 * Strategies for controlling when text updates are emitted to the UI
 */

import type { ChunkStrategy } from "./types";

/**
 * Immediate Strategy - emit on every chunk (default behavior)
 */
export class ImmediateStrategy implements ChunkStrategy {
  shouldEmit(_chunk: string, _accumulated: string): boolean {
    return true;
  }
}

/**
 * Punctuation Strategy - emit when chunk contains punctuation
 * Useful for natural text flow in UI
 */
export class PunctuationStrategy implements ChunkStrategy {
  private punctuation = /[.,!?;:\n]/;

  shouldEmit(chunk: string, _accumulated: string): boolean {
    return this.punctuation.test(chunk);
  }
}

/**
 * Batch Strategy - emit every N chunks
 * Useful for reducing UI update frequency
 */
export class BatchStrategy implements ChunkStrategy {
  private chunkCount = 0;

  constructor(private batchSize: number = 5) {}

  shouldEmit(_chunk: string, _accumulated: string): boolean {
    this.chunkCount++;
    if (this.chunkCount >= this.batchSize) {
      this.chunkCount = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.chunkCount = 0;
  }
}

/**
 * Word Boundary Strategy - emit at word boundaries
 * Prevents cutting words in half
 */
export class WordBoundaryStrategy implements ChunkStrategy {
  shouldEmit(chunk: string, _accumulated: string): boolean {
    // Emit if chunk ends with whitespace
    return /\s$/.test(chunk);
  }
}

/**
 * Composite Strategy - combine multiple strategies (OR logic)
 * Emits if ANY strategy says to emit
 */
export class CompositeStrategy implements ChunkStrategy {
  constructor(private strategies: ChunkStrategy[]) {}

  shouldEmit(chunk: string, accumulated: string): boolean {
    return this.strategies.some((s) => s.shouldEmit(chunk, accumulated));
  }

  reset(): void {
    this.strategies.forEach((s) => s.reset?.());
  }
}

/**
 * Debounce Strategy - emit after N milliseconds of no new chunks
 * Useful for reducing jitter in fast streams
 */
export class DebounceStrategy implements ChunkStrategy {
  private timeoutId: NodeJS.Timeout | null = null;
  private shouldEmitNow = false;

  constructor(private delayMs: number = 100) {}

  shouldEmit(_chunk: string, _accumulated: string): boolean {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.shouldEmitNow = false;
    this.timeoutId = setTimeout(() => {
      this.shouldEmitNow = true;
    }, this.delayMs);

    return this.shouldEmitNow;
  }

  reset(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.shouldEmitNow = false;
  }
}
