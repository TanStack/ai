import type { ChunkStrategy } from './types'

export class ImmediateStrategy implements ChunkStrategy {
  shouldEmit(_chunk: string, _accumulated: string): boolean {
    return true
  }
}

export class PunctuationStrategy implements ChunkStrategy {
  private readonly punctuation = /[.,!?;:\n]/

  shouldEmit(chunk: string, _accumulated: string): boolean {
    return this.punctuation.test(chunk)
  }
}

export class BatchStrategy implements ChunkStrategy {
  private chunkCount = 0

  constructor(private readonly batchSize: number = 5) {}

  shouldEmit(_chunk: string, _accumulated: string): boolean {
    this.chunkCount++
    if (this.chunkCount >= this.batchSize) {
      this.chunkCount = 0
      return true
    }
    return false
  }

  reset(): void {
    this.chunkCount = 0
  }
}

export class WordBoundaryStrategy implements ChunkStrategy {
  shouldEmit(chunk: string, _accumulated: string): boolean {
    // Emit if chunk ends with whitespace
    return /\s$/.test(chunk)
  }
}

export class CompositeStrategy implements ChunkStrategy {
  constructor(private readonly strategies: Array<ChunkStrategy>) {}

  shouldEmit(chunk: string, accumulated: string): boolean {
    return this.strategies.some((s) => s.shouldEmit(chunk, accumulated))
  }

  reset(): void {
    this.strategies.forEach((s) => s.reset?.())
  }
}
