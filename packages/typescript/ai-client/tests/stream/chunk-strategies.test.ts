import { describe, it, expect, beforeEach } from "vitest";
import {
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
  WordBoundaryStrategy,
  CompositeStrategy,
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
});

