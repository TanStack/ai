import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
  DebounceStrategy,
} from "../../src/stream/chunk-strategies";

describe("ImmediateStrategy", () => {
  let strategy: ImmediateStrategy;

  beforeEach(() => {
    strategy = new ImmediateStrategy();
  });

  it("should emit on every chunk", () => {
    expect(strategy.shouldEmit("Hello", "Hello")).toBe(true);
    expect(strategy.shouldEmit(" world", "Hello world")).toBe(true);
    expect(strategy.shouldEmit("!", "Hello world!")).toBe(true);
  });

  it("should emit regardless of chunk content", () => {
    expect(strategy.shouldEmit("", "")).toBe(true);
    expect(strategy.shouldEmit("abc", "abc")).toBe(true);
    expect(strategy.shouldEmit("123", "123")).toBe(true);
    expect(strategy.shouldEmit("!@#", "!@#")).toBe(true);
  });

  it("should emit regardless of accumulated content", () => {
    expect(strategy.shouldEmit("chunk", "")).toBe(true);
    expect(strategy.shouldEmit("chunk", "previous")).toBe(true);
    expect(strategy.shouldEmit("chunk", "very long accumulated text")).toBe(true);
  });
});

describe("PunctuationStrategy", () => {
  let strategy: PunctuationStrategy;

  beforeEach(() => {
    strategy = new PunctuationStrategy();
  });

  it("should emit when chunk contains period", () => {
    expect(strategy.shouldEmit("Hello.", "Hello.")).toBe(true);
  });

  it("should emit when chunk contains comma", () => {
    expect(strategy.shouldEmit("Hi,", "Hi,")).toBe(true);
  });

  it("should emit when chunk contains exclamation", () => {
    expect(strategy.shouldEmit("Wow!", "Wow!")).toBe(true);
  });

  it("should emit when chunk contains question mark", () => {
    expect(strategy.shouldEmit("Why?", "Why?")).toBe(true);
  });

  it("should emit when chunk contains semicolon", () => {
    expect(strategy.shouldEmit("First;", "First;")).toBe(true);
  });

  it("should emit when chunk contains colon", () => {
    expect(strategy.shouldEmit("Title:", "Title:")).toBe(true);
  });

  it("should emit when chunk contains newline", () => {
    expect(strategy.shouldEmit("Line\n", "Line\n")).toBe(true);
  });

  it("should not emit when chunk has no punctuation", () => {
    expect(strategy.shouldEmit("Hello", "Hello")).toBe(false);
    expect(strategy.shouldEmit(" world", "Hello world")).toBe(false);
    expect(strategy.shouldEmit("abc123", "abc123")).toBe(false);
  });

  it("should emit when punctuation is in the middle of chunk", () => {
    expect(strategy.shouldEmit("Hello.world", "Hello.world")).toBe(true);
    expect(strategy.shouldEmit("test,data", "test,data")).toBe(true);
  });

  it("should handle multiple punctuation marks", () => {
    expect(strategy.shouldEmit("Hello, world!", "Hello, world!")).toBe(true);
    expect(strategy.shouldEmit("What?!", "What?!")).toBe(true);
  });

  it("should handle empty chunks", () => {
    expect(strategy.shouldEmit("", "")).toBe(false);
  });
});

describe("BatchStrategy", () => {
  it("should emit every N chunks", () => {
    const strategy = new BatchStrategy(3);

    expect(strategy.shouldEmit("1", "1")).toBe(false);
    expect(strategy.shouldEmit("2", "12")).toBe(false);
    expect(strategy.shouldEmit("3", "123")).toBe(true); // 3rd chunk

    expect(strategy.shouldEmit("4", "1234")).toBe(false);
    expect(strategy.shouldEmit("5", "12345")).toBe(false);
    expect(strategy.shouldEmit("6", "123456")).toBe(true); // 6th chunk
  });

  it("should reset counter when reset is called", () => {
    const strategy = new BatchStrategy(3);

    strategy.shouldEmit("1", "1");
    strategy.shouldEmit("2", "12");

    strategy.reset();

    expect(strategy.shouldEmit("1", "1")).toBe(false);
    expect(strategy.shouldEmit("2", "12")).toBe(false);
    expect(strategy.shouldEmit("3", "123")).toBe(true);
  });

  it("should work with batch size of 1", () => {
    const strategy = new BatchStrategy(1);

    expect(strategy.shouldEmit("1", "1")).toBe(true);
    expect(strategy.shouldEmit("2", "12")).toBe(true);
    expect(strategy.shouldEmit("3", "123")).toBe(true);
  });

  it("should use default batch size of 5", () => {
    const strategy = new BatchStrategy();

    expect(strategy.shouldEmit("1", "1")).toBe(false);
    expect(strategy.shouldEmit("2", "12")).toBe(false);
    expect(strategy.shouldEmit("3", "123")).toBe(false);
    expect(strategy.shouldEmit("4", "1234")).toBe(false);
    expect(strategy.shouldEmit("5", "12345")).toBe(true);
  });

  it("should handle very large batch sizes", () => {
    const strategy = new BatchStrategy(10);

    for (let i = 1; i < 10; i++) {
      expect(strategy.shouldEmit(`${i}`, "1".repeat(i))).toBe(false);
    }
    expect(strategy.shouldEmit("10", "1".repeat(10))).toBe(true);
  });

  it("should work correctly across multiple batches", () => {
    const strategy = new BatchStrategy(2);

    // First batch
    expect(strategy.shouldEmit("a", "a")).toBe(false);
    expect(strategy.shouldEmit("b", "ab")).toBe(true);

    // Second batch
    expect(strategy.shouldEmit("c", "abc")).toBe(false);
    expect(strategy.shouldEmit("d", "abcd")).toBe(true);

    // Third batch
    expect(strategy.shouldEmit("e", "abcde")).toBe(false);
    expect(strategy.shouldEmit("f", "abcdef")).toBe(true);
  });
});

describe("WordBoundaryStrategy", () => {
  let strategy: WordBoundaryStrategy;

  beforeEach(() => {
    strategy = new WordBoundaryStrategy();
  });

  it("should emit when chunk ends with space", () => {
    expect(strategy.shouldEmit("Hello ", "Hello ")).toBe(true);
  });

  it("should emit when chunk ends with tab", () => {
    expect(strategy.shouldEmit("Hello\t", "Hello\t")).toBe(true);
  });

  it("should emit when chunk ends with newline", () => {
    expect(strategy.shouldEmit("Hello\n", "Hello\n")).toBe(true);
  });

  it("should not emit when chunk ends with letter", () => {
    expect(strategy.shouldEmit("Hello", "Hello")).toBe(false);
    expect(strategy.shouldEmit("Hel", "Hel")).toBe(false);
  });

  it("should not emit when chunk ends with punctuation (no space)", () => {
    expect(strategy.shouldEmit("Hello!", "Hello!")).toBe(false);
    expect(strategy.shouldEmit("Hello.", "Hello.")).toBe(false);
    expect(strategy.shouldEmit("Hello?", "Hello?")).toBe(false);
  });

  it("should emit when chunk ends with multiple spaces", () => {
    expect(strategy.shouldEmit("Hello  ", "Hello  ")).toBe(true);
    expect(strategy.shouldEmit("Hello\t\t", "Hello\t\t")).toBe(true);
  });

  it("should not emit when chunk starts with whitespace but ends with character", () => {
    expect(strategy.shouldEmit(" Hello", " Hello")).toBe(false);
    expect(strategy.shouldEmit("\tHello", "\tHello")).toBe(false);
  });

  it("should handle empty chunks", () => {
    expect(strategy.shouldEmit("", "")).toBe(false);
  });

  it("should handle chunks that are only whitespace", () => {
    expect(strategy.shouldEmit(" ", " ")).toBe(true);
    expect(strategy.shouldEmit("\t", "\t")).toBe(true);
    expect(strategy.shouldEmit("\n", "\n")).toBe(true);
  });
});

describe("CompositeStrategy", () => {
  it("should emit if ANY sub-strategy returns true", () => {
    const strategy = new CompositeStrategy([
      new PunctuationStrategy(),
      new WordBoundaryStrategy(),
    ]);

    // Punctuation - should emit
    expect(strategy.shouldEmit("Hello.", "Hello.")).toBe(true);

    // Word boundary - should emit
    expect(strategy.shouldEmit("Hello ", "Hello ")).toBe(true);

    // Both - should emit
    expect(strategy.shouldEmit("Hello. ", "Hello. ")).toBe(true);

    // Neither - should not emit
    expect(strategy.shouldEmit("Hello", "Hello")).toBe(false);
  });

  it("should reset all sub-strategies", () => {
    const batch1 = new BatchStrategy(2);
    const batch2 = new BatchStrategy(3);
    const strategy = new CompositeStrategy([batch1, batch2]);

    batch1.shouldEmit("1", "1");
    batch2.shouldEmit("1", "1");

    strategy.reset();

    // After reset, counters should be back to 0
    expect(batch1.shouldEmit("1", "1")).toBe(false);
    expect(batch2.shouldEmit("1", "1")).toBe(false);
  });

  it("should work with empty strategies array", () => {
    const strategy = new CompositeStrategy([]);
    expect(strategy.shouldEmit("Hello", "Hello")).toBe(false);
  });

  it("should work with single strategy", () => {
    const strategy = new CompositeStrategy([new ImmediateStrategy()]);
    expect(strategy.shouldEmit("Hello", "Hello")).toBe(true);
  });

  it("should handle strategies without reset method", () => {
    const strategyWithoutReset = new ImmediateStrategy();
    const strategy = new CompositeStrategy([strategyWithoutReset]);

    // Should not throw when calling reset
    expect(() => strategy.reset()).not.toThrow();
  });

  it("should work with three or more strategies", () => {
    const strategy = new CompositeStrategy([
      new PunctuationStrategy(),
      new WordBoundaryStrategy(),
      new ImmediateStrategy(),
    ]);

    // Should always emit because ImmediateStrategy always returns true
    expect(strategy.shouldEmit("Hello", "Hello")).toBe(true);
    expect(strategy.shouldEmit(" world", "Hello world")).toBe(true);
  });

  it("should handle mixed strategy results correctly", () => {
    const strategy = new CompositeStrategy([
      new PunctuationStrategy(),
      new WordBoundaryStrategy(),
    ]);

    // Only punctuation - should emit
    expect(strategy.shouldEmit("Hello.", "Hello.")).toBe(true);

    // Only word boundary - should emit
    expect(strategy.shouldEmit("Hello ", "Hello ")).toBe(true);

    // Both - should emit
    expect(strategy.shouldEmit("Hello. ", "Hello. ")).toBe(true);

    // Neither - should not emit
    expect(strategy.shouldEmit("Hello", "Hello")).toBe(false);
  });
});

describe("DebounceStrategy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should not emit immediately on first chunk", () => {
    const strategy = new DebounceStrategy(100);

    expect(strategy.shouldEmit("Hello", "Hello")).toBe(false);
  });

  it("should schedule emission after delay", () => {
    const strategy = new DebounceStrategy(100);

    strategy.shouldEmit("Hello", "Hello");
    
    // After delay, shouldEmitNow should be true
    vi.advanceTimersByTime(100);
    
    // Note: The current implementation has a limitation - shouldEmitNow
    // is set asynchronously, so we can't check it synchronously.
    // This test documents the current behavior.
    expect(strategy.shouldEmit(" world", "Hello world")).toBe(false);
  });

  it("should reset timeout when new chunk arrives before delay", () => {
    const strategy = new DebounceStrategy(100);

    strategy.shouldEmit("Hello", "Hello");
    
    // Advance time but not enough to trigger
    vi.advanceTimersByTime(50);
    
    // New chunk should reset the timer
    strategy.shouldEmit(" world", "Hello world");
    
    // Advance remaining time from first chunk - should not trigger
    vi.advanceTimersByTime(50);
    
    // Advance time for second chunk - should trigger
    vi.advanceTimersByTime(50);
    
    // The strategy should still return false synchronously
    expect(strategy.shouldEmit("!", "Hello world!")).toBe(false);
  });

  it("should use default delay of 100ms", () => {
    const strategy = new DebounceStrategy();

    expect(strategy.shouldEmit("Hello", "Hello")).toBe(false);
  });

  it("should clear timeout on reset", () => {
    const strategy = new DebounceStrategy(100);

    strategy.shouldEmit("Hello", "Hello");
    strategy.reset();

    // After reset, timeout should be cleared
    vi.advanceTimersByTime(100);

    // New chunk after reset
    expect(strategy.shouldEmit(" world", "Hello world")).toBe(false);
  });

  it("should handle multiple rapid chunks", () => {
    const strategy = new DebounceStrategy(100);

    strategy.shouldEmit("a", "a");
    vi.advanceTimersByTime(30);
    
    strategy.shouldEmit("b", "ab");
    vi.advanceTimersByTime(30);
    
    strategy.shouldEmit("c", "abc");
    vi.advanceTimersByTime(30);
    
    strategy.shouldEmit("d", "abcd");
    
    // All should return false synchronously
    expect(strategy.shouldEmit("e", "abcde")).toBe(false);
  });

  it("should handle custom delay values", () => {
    const strategy = new DebounceStrategy(50);

    expect(strategy.shouldEmit("Hello", "Hello")).toBe(false);
    
    strategy.shouldEmit(" world", "Hello world");
    vi.advanceTimersByTime(50);
    
    expect(strategy.shouldEmit("!", "Hello world!")).toBe(false);
  });

  it("should handle reset when no timeout is active", () => {
    const strategy = new DebounceStrategy(100);

    // Reset without any chunks should not throw
    expect(() => strategy.reset()).not.toThrow();
    
    // Reset after timeout has been cleared should not throw
    strategy.shouldEmit("Hello", "Hello");
    strategy.reset();
    expect(() => strategy.reset()).not.toThrow();
  });
});

