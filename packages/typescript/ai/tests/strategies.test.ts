import { describe, it, expect } from 'vitest'
import {
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
} from '../src/stream/strategies'

describe('Chunk Strategies', () => {
  describe('ImmediateStrategy', () => {
    it('should always return true', () => {
      const strategy = new ImmediateStrategy()

      expect(strategy.shouldEmit('', '')).toBe(true)
      expect(strategy.shouldEmit('hello', 'hello')).toBe(true)
      expect(strategy.shouldEmit('world', 'hello world')).toBe(true)
    })

    it('should work with empty strings', () => {
      const strategy = new ImmediateStrategy()

      expect(strategy.shouldEmit('', '')).toBe(true)
      expect(strategy.shouldEmit('', 'accumulated')).toBe(true)
    })
  })

  describe('PunctuationStrategy', () => {
    it('should emit when chunk contains punctuation', () => {
      const strategy = new PunctuationStrategy()

      expect(strategy.shouldEmit('Hello.', 'Hello.')).toBe(true)
      expect(strategy.shouldEmit('World!', 'Hello. World!')).toBe(true)
      expect(strategy.shouldEmit('How?', 'Hello. World! How?')).toBe(true)
      expect(strategy.shouldEmit('Test;', 'Test;')).toBe(true)
      expect(strategy.shouldEmit('Test:', 'Test:')).toBe(true)
    })

    it('should not emit when chunk has no punctuation', () => {
      const strategy = new PunctuationStrategy()

      expect(strategy.shouldEmit('Hello', 'Hello')).toBe(false)
      expect(strategy.shouldEmit('world', 'Hello world')).toBe(false)
      expect(strategy.shouldEmit('test', 'Hello world test')).toBe(false)
    })

    it('should emit on newline', () => {
      const strategy = new PunctuationStrategy()

      expect(strategy.shouldEmit('Line 1\n', 'Line 1\n')).toBe(true)
      expect(strategy.shouldEmit('\nLine 2', 'Line 1\n\nLine 2')).toBe(true)
    })

    it('should emit on comma', () => {
      const strategy = new PunctuationStrategy()

      expect(strategy.shouldEmit('Hello,', 'Hello,')).toBe(true)
      expect(strategy.shouldEmit('world,', 'Hello, world,')).toBe(true)
    })

    it('should handle punctuation in middle of chunk', () => {
      const strategy = new PunctuationStrategy()

      expect(strategy.shouldEmit('Hello.world', 'Hello.world')).toBe(true)
      expect(strategy.shouldEmit('test!more', 'test!more')).toBe(true)
    })
  })

  describe('BatchStrategy', () => {
    it('should emit every N chunks', () => {
      const strategy = new BatchStrategy(3)

      expect(strategy.shouldEmit('chunk1', 'chunk1')).toBe(false)
      expect(strategy.shouldEmit('chunk2', 'chunk1chunk2')).toBe(false)
      expect(strategy.shouldEmit('chunk3', 'chunk1chunk2chunk3')).toBe(true)
      expect(strategy.shouldEmit('chunk4', 'chunk1chunk2chunk3chunk4')).toBe(
        false,
      )
      expect(
        strategy.shouldEmit('chunk5', 'chunk1chunk2chunk3chunk4chunk5'),
      ).toBe(false)
      expect(
        strategy.shouldEmit('chunk6', 'chunk1chunk2chunk3chunk4chunk5chunk6'),
      ).toBe(true)
    })

    it('should use default batch size of 5', () => {
      const strategy = new BatchStrategy()

      expect(strategy.shouldEmit('chunk1', 'chunk1')).toBe(false)
      expect(strategy.shouldEmit('chunk2', 'chunk1chunk2')).toBe(false)
      expect(strategy.shouldEmit('chunk3', 'chunk1chunk2chunk3')).toBe(false)
      expect(strategy.shouldEmit('chunk4', 'chunk1chunk2chunk3chunk4')).toBe(
        false,
      )
      expect(
        strategy.shouldEmit('chunk5', 'chunk1chunk2chunk3chunk4chunk5'),
      ).toBe(true)
    })

    it('should reset counter after emitting', () => {
      const strategy = new BatchStrategy(2)

      expect(strategy.shouldEmit('chunk1', 'chunk1')).toBe(false)
      expect(strategy.shouldEmit('chunk2', 'chunk1chunk2')).toBe(true)
      // Counter should reset, so next chunk starts counting again
      expect(strategy.shouldEmit('chunk3', 'chunk1chunk2chunk3')).toBe(false)
      expect(strategy.shouldEmit('chunk4', 'chunk1chunk2chunk3chunk4')).toBe(
        true,
      )
    })

    it('should work with batch size of 1', () => {
      const strategy = new BatchStrategy(1)

      expect(strategy.shouldEmit('chunk1', 'chunk1')).toBe(true)
      expect(strategy.shouldEmit('chunk2', 'chunk1chunk2')).toBe(true)
      expect(strategy.shouldEmit('chunk3', 'chunk1chunk2chunk3')).toBe(true)
    })

    it('should reset method reset counter', () => {
      const strategy = new BatchStrategy(3)

      expect(strategy.shouldEmit('chunk1', 'chunk1')).toBe(false)
      expect(strategy.shouldEmit('chunk2', 'chunk1chunk2')).toBe(false)
      strategy.reset()
      // After reset, should start counting from 0 again
      expect(strategy.shouldEmit('chunk3', 'chunk1chunk2chunk3')).toBe(false)
      expect(strategy.shouldEmit('chunk4', 'chunk1chunk2chunk3chunk4')).toBe(
        false,
      )
      expect(
        strategy.shouldEmit('chunk5', 'chunk1chunk2chunk3chunk4chunk5'),
      ).toBe(true)
    })
  })

  describe('WordBoundaryStrategy', () => {
    it('should emit when chunk ends with whitespace', () => {
      const strategy = new WordBoundaryStrategy()

      expect(strategy.shouldEmit('Hello ', 'Hello ')).toBe(true)
      expect(strategy.shouldEmit('world ', 'Hello world ')).toBe(true)
      expect(strategy.shouldEmit('test\n', 'Hello world test\n')).toBe(true)
      expect(strategy.shouldEmit('more\t', 'Hello world test\nmore\t')).toBe(
        true,
      )
    })

    it('should not emit when chunk does not end with whitespace', () => {
      const strategy = new WordBoundaryStrategy()

      expect(strategy.shouldEmit('Hello', 'Hello')).toBe(false)
      expect(strategy.shouldEmit('world', 'Helloworld')).toBe(false)
      expect(strategy.shouldEmit('test', 'Helloworldtest')).toBe(false)
    })

    it('should emit on space', () => {
      const strategy = new WordBoundaryStrategy()

      expect(strategy.shouldEmit('word ', 'word ')).toBe(true)
    })

    it('should emit on newline', () => {
      const strategy = new WordBoundaryStrategy()

      expect(strategy.shouldEmit('line\n', 'line\n')).toBe(true)
      expect(strategy.shouldEmit('\n', 'line\n\n')).toBe(true)
    })

    it('should emit on tab', () => {
      const strategy = new WordBoundaryStrategy()

      expect(strategy.shouldEmit('word\t', 'word\t')).toBe(true)
    })

    it('should not emit on punctuation without whitespace', () => {
      const strategy = new WordBoundaryStrategy()

      expect(strategy.shouldEmit('Hello.', 'Hello.')).toBe(false)
      expect(strategy.shouldEmit('World!', 'Hello.World!')).toBe(false)
    })

    it('should emit on whitespace even if punctuation present', () => {
      const strategy = new WordBoundaryStrategy()

      expect(strategy.shouldEmit('Hello. ', 'Hello. ')).toBe(true)
      expect(strategy.shouldEmit('World! ', 'Hello. World! ')).toBe(true)
    })
  })

  describe('CompositeStrategy', () => {
    it('should emit if any strategy says to emit (OR logic)', () => {
      const immediate = new ImmediateStrategy()
      const punctuation = new PunctuationStrategy()
      const strategy = new CompositeStrategy([immediate, punctuation])

      // ImmediateStrategy always returns true, so should always emit
      expect(strategy.shouldEmit('hello', 'hello')).toBe(true)
      expect(strategy.shouldEmit('world', 'hello world')).toBe(true)
    })

    it('should emit if first strategy says yes, even if others say no', () => {
      const batch = new BatchStrategy(10) // Won't emit for first few chunks
      const punctuation = new PunctuationStrategy()
      const strategy = new CompositeStrategy([punctuation, batch])

      // Punctuation says yes for '.', batch says no, but should emit anyway
      expect(strategy.shouldEmit('Hello.', 'Hello.')).toBe(true)
    })

    it('should emit if any strategy says yes', () => {
      const batch = new BatchStrategy(10) // Won't emit
      const wordBoundary = new WordBoundaryStrategy()
      const strategy = new CompositeStrategy([batch, wordBoundary])

      // Batch says no, but wordBoundary says yes (ends with space)
      expect(strategy.shouldEmit('Hello ', 'Hello ')).toBe(true)
    })

    it('should not emit if all strategies say no', () => {
      const batch = new BatchStrategy(10) // Won't emit for first few
      const wordBoundary = new WordBoundaryStrategy()
      const strategy = new CompositeStrategy([batch, wordBoundary])

      // Both say no
      expect(strategy.shouldEmit('Hello', 'Hello')).toBe(false)
      expect(strategy.shouldEmit('world', 'Helloworld')).toBe(false)
    })

    it('should work with single strategy', () => {
      const punctuation = new PunctuationStrategy()
      const strategy = new CompositeStrategy([punctuation])

      expect(strategy.shouldEmit('Hello.', 'Hello.')).toBe(true)
      expect(strategy.shouldEmit('world', 'Hello. world')).toBe(false)
    })

    it('should work with empty strategies array', () => {
      const strategy = new CompositeStrategy([])

      // With no strategies, some() returns false
      expect(strategy.shouldEmit('hello', 'hello')).toBe(false)
    })

    it('should reset all strategies that have reset method', () => {
      const batch1 = new BatchStrategy(3)
      const batch2 = new BatchStrategy(5)
      const strategy = new CompositeStrategy([batch1, batch2])

      // Advance batch1 and batch2
      strategy.shouldEmit('chunk1', 'chunk1')
      strategy.shouldEmit('chunk2', 'chunk1chunk2')

      // Reset should reset both batch strategies
      strategy.reset()

      // After reset, batch1 should start counting from 0
      expect(strategy.shouldEmit('chunk3', 'chunk1chunk2chunk3')).toBe(false)
      expect(strategy.shouldEmit('chunk4', 'chunk1chunk2chunk3chunk4')).toBe(
        false,
      )
      expect(
        strategy.shouldEmit('chunk5', 'chunk1chunk2chunk3chunk4chunk5'),
      ).toBe(true)
    })

    it('should handle multiple strategies with different behaviors', () => {
      const batch = new BatchStrategy(10) // Use larger batch size to avoid interference
      const punctuation = new PunctuationStrategy()
      const wordBoundary = new WordBoundaryStrategy()
      const strategy = new CompositeStrategy([batch, punctuation, wordBoundary])

      // Test various scenarios
      expect(strategy.shouldEmit('Hello', 'Hello')).toBe(false) // All say no
      expect(strategy.shouldEmit('Hello.', 'Hello.')).toBe(true) // Punctuation says yes
      expect(strategy.shouldEmit('world ', 'Hello. world ')).toBe(true) // WordBoundary says yes
      expect(strategy.shouldEmit('test', 'Hello. world test')).toBe(false) // All say no
      expect(strategy.shouldEmit('more', 'Hello. world testmore')).toBe(false) // All say no
      expect(strategy.shouldEmit('!', 'Hello. world testmore!')).toBe(true) // Punctuation says yes
    })

    it('should short-circuit on first true', () => {
      const strategy1 = {
        shouldEmit: () => {
          return true
        },
      }
      const strategy2 = {
        shouldEmit: () => {
          return false
        },
      }
      const strategy3 = {
        shouldEmit: () => {
          return false
        },
      }

      const strategy = new CompositeStrategy([strategy1, strategy2, strategy3])
      const result = strategy.shouldEmit('test', 'test')

      expect(result).toBe(true)
      // Array.some() will call strategies until one returns true
    })
  })

  describe('Strategy edge cases', () => {
    it('should handle empty chunks', () => {
      const immediate = new ImmediateStrategy()
      const punctuation = new PunctuationStrategy()
      const wordBoundary = new WordBoundaryStrategy()

      expect(immediate.shouldEmit('', '')).toBe(true)
      expect(punctuation.shouldEmit('', '')).toBe(false)
      expect(wordBoundary.shouldEmit('', '')).toBe(false)
    })

    it('should handle very long accumulated strings', () => {
      const batch = new BatchStrategy(3)
      const longAccumulated = 'a'.repeat(10000)

      expect(batch.shouldEmit('chunk1', longAccumulated + 'chunk1')).toBe(false)
      expect(batch.shouldEmit('chunk2', longAccumulated + 'chunk1chunk2')).toBe(
        false,
      )
      expect(
        batch.shouldEmit('chunk3', longAccumulated + 'chunk1chunk2chunk3'),
      ).toBe(true)
    })

    it('should handle unicode characters', () => {
      const punctuation = new PunctuationStrategy()
      const wordBoundary = new WordBoundaryStrategy()

      expect(punctuation.shouldEmit('Hello 世界.', 'Hello 世界.')).toBe(true)
      expect(wordBoundary.shouldEmit('世界 ', 'Hello 世界 ')).toBe(true)
      expect(wordBoundary.shouldEmit('世界', 'Hello 世界')).toBe(false)
    })
  })
})
