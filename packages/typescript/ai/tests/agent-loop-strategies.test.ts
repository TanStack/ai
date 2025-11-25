import { describe, it, expect } from "vitest";
import {
  maxIterations,
  untilFinishReason,
  combineStrategies,
} from "../src/utilities/agent-loop-strategies";
import type { AgentLoopState } from "../src/types";

describe("Agent Loop Strategies", () => {
  const createState = (
    overrides: Partial<AgentLoopState> = {}
  ): AgentLoopState => ({
    iterationCount: 0,
    messages: [],
    finishReason: null,
    ...overrides,
  });

  describe("maxIterations", () => {
    it("should continue when below max iterations", () => {
      const strategy = maxIterations(5);

      expect(strategy(createState({ iterationCount: 0 }))).toBe(true);
      expect(strategy(createState({ iterationCount: 2 }))).toBe(true);
      expect(strategy(createState({ iterationCount: 4 }))).toBe(true);
    });

    it("should stop when reaching max iterations", () => {
      const strategy = maxIterations(5);

      expect(strategy(createState({ iterationCount: 5 }))).toBe(false);
      expect(strategy(createState({ iterationCount: 6 }))).toBe(false);
    });

    it("should work with iteration count 0", () => {
      const strategy = maxIterations(1);

      expect(strategy(createState({ iterationCount: 0 }))).toBe(true);
      expect(strategy(createState({ iterationCount: 1 }))).toBe(false);
    });

    it("should work with max = 0 (never iterate)", () => {
      const strategy = maxIterations(0);

      expect(strategy(createState({ iterationCount: 0 }))).toBe(false);
    });
  });

  describe("untilFinishReason", () => {
    it("should continue on first iteration even with matching finish reason", () => {
      const strategy = untilFinishReason(["stop"]);

      // First iteration always continues
      expect(
        strategy(createState({ iterationCount: 0, finishReason: "stop" }))
      ).toBe(true);
    });

    it("should stop when finish reason matches", () => {
      const strategy = untilFinishReason(["stop", "length"]);

      expect(
        strategy(createState({ iterationCount: 1, finishReason: "stop" }))
      ).toBe(false);
      expect(
        strategy(createState({ iterationCount: 1, finishReason: "length" }))
      ).toBe(false);
    });

    it("should continue when finish reason does not match", () => {
      const strategy = untilFinishReason(["stop"]);

      expect(
        strategy(createState({ iterationCount: 1, finishReason: "tool_calls" }))
      ).toBe(true);
      expect(
        strategy(createState({ iterationCount: 1, finishReason: null }))
      ).toBe(true);
    });

    it("should handle null finish reason", () => {
      const strategy = untilFinishReason(["stop"]);

      expect(
        strategy(createState({ iterationCount: 1, finishReason: null }))
      ).toBe(true);
    });

    it("should work with empty stop reasons array", () => {
      const strategy = untilFinishReason([]);

      expect(
        strategy(createState({ iterationCount: 1, finishReason: "stop" }))
      ).toBe(true);
      expect(
        strategy(createState({ iterationCount: 1, finishReason: "length" }))
      ).toBe(true);
    });
  });

  describe("combineStrategies", () => {
    it("should return true when all strategies return true", () => {
      const strategy = combineStrategies([
        maxIterations(5),
        ({ messages }) => messages.length < 10,
        ({ finishReason }) => finishReason !== "stop",
      ]);

      expect(
        strategy(createState({ iterationCount: 2, messages: [], finishReason: null }))
      ).toBe(true);
    });

    it("should return false if any strategy returns false", () => {
      const strategy = combineStrategies([
        maxIterations(5),
        ({ messages }) => messages.length < 10,
      ]);

      // First strategy fails (iterationCount >= 5)
      expect(
        strategy(createState({ iterationCount: 5, messages: [] }))
      ).toBe(false);

      // Second strategy fails (messages.length >= 10)
      expect(
        strategy(
          createState({
            iterationCount: 2,
            messages: Array(10).fill({ role: "user", content: "test" }),
          })
        )
      ).toBe(false);
    });

    it("should work with single strategy", () => {
      const strategy = combineStrategies([maxIterations(3)]);

      expect(strategy(createState({ iterationCount: 0 }))).toBe(true);
      expect(strategy(createState({ iterationCount: 3 }))).toBe(false);
    });

    it("should work with empty strategies array", () => {
      const strategy = combineStrategies([]);

      // With no strategies, should return true (all strategies passed)
      expect(strategy(createState({ iterationCount: 0 }))).toBe(true);
    });

    it("should short-circuit on first false", () => {
      let secondCalled = false;

      const strategy = combineStrategies([
        () => false, // Always false
        () => {
          secondCalled = true;
          return true;
        },
      ]);

      strategy(createState());

      // Second strategy should not be called due to short-circuit
      expect(secondCalled).toBe(false);
    });
  });

  describe("Integration scenarios", () => {
    it("should combine maxIterations with custom logic", () => {
      const strategy = combineStrategies([
        maxIterations(10),
        ({ messages }) => messages.length < 50,
        ({ finishReason }) => finishReason !== "length",
      ]);

      // All conditions pass
      expect(
        strategy(
          createState({
            iterationCount: 5,
            messages: Array(20).fill({ role: "user", content: "test" }),
            finishReason: "tool_calls",
          })
        )
      ).toBe(true);

      // Iteration limit exceeded
      expect(
        strategy(
          createState({
            iterationCount: 10,
            messages: [],
            finishReason: null,
          })
        )
      ).toBe(false);

      // Too many messages
      expect(
        strategy(
          createState({
            iterationCount: 5,
            messages: Array(50).fill({ role: "user", content: "test" }),
            finishReason: null,
          })
        )
      ).toBe(false);

      // Length finish reason
      expect(
        strategy(
          createState({
            iterationCount: 5,
            messages: [],
            finishReason: "length",
          })
        )
      ).toBe(false);
    });

    it("should handle complex custom strategy", () => {
      const customStrategy = ({ iterationCount, messages, finishReason }: AgentLoopState) => {
        // Allow more iterations if tools are being used
        const hasToolCalls = messages.some(
          (m) => m.toolCalls && m.toolCalls.length > 0
        );
        const maxIters = hasToolCalls ? 10 : 3;

        if (iterationCount >= maxIters) return false;
        if (finishReason === "content_filter") return false;

        return true;
      };

      // No tool calls - lower limit
      expect(
        customStrategy(
          createState({
            iterationCount: 2,
            messages: [{ role: "user", content: "test" }],
          })
        )
      ).toBe(true);
      expect(
        customStrategy(
          createState({
            iterationCount: 3,
            messages: [{ role: "user", content: "test" }],
          })
        )
      ).toBe(false);

      // With tool calls - higher limit
      expect(
        customStrategy(
          createState({
            iterationCount: 5,
            messages: [
              {
                role: "assistant",
                content: null,
                toolCalls: [
                  {
                    id: "123",
                    type: "function",
                    function: { name: "test", arguments: "{}" },
                  },
                ],
              },
            ],
          })
        )
      ).toBe(true);
      expect(
        customStrategy(
          createState({
            iterationCount: 10,
            messages: [
              {
                role: "assistant",
                content: null,
                toolCalls: [
                  {
                    id: "123",
                    type: "function",
                    function: { name: "test", arguments: "{}" },
                  },
                ],
              },
            ],
          })
        )
      ).toBe(false);

      // Content filter always stops
      expect(
        customStrategy(
          createState({
            iterationCount: 1,
            messages: [],
            finishReason: "content_filter",
          })
        )
      ).toBe(false);
    });
  });
});

