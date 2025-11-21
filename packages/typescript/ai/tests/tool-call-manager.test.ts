import { describe, it, expect, vi } from "vitest";
import { ToolCallManager } from "../src/tool-call-manager";
import type { Tool, DoneStreamChunk } from "../src/types";

describe("ToolCallManager", () => {
  const mockDoneChunk: DoneStreamChunk = {
    type: "done",
    id: "test-id",
    model: "gpt-4",
    timestamp: Date.now(),
    finishReason: "tool_calls",
  };

  const mockWeatherTool: Tool = {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather",
      parameters: {},
    },
    execute: vi.fn(async (args: any) => {
      return JSON.stringify({ temp: 72, location: args.location });
    }),
  };

  async function collectGeneratorOutput<
    TChunk,
    TResult
  >(generator: AsyncGenerator<TChunk, TResult, void>): Promise<{
    chunks: TChunk[];
    result: TResult;
  }> {
    const chunks: TChunk[] = [];
    let next = await generator.next();
    while (!next.done) {
      chunks.push(next.value);
      next = await generator.next();
    }
    return { chunks, result: next.value };
  }

  it("should accumulate tool call chunks", () => {
    const manager = new ToolCallManager([mockWeatherTool]);

    manager.addToolCallChunk({
      toolCall: {
        id: "call_123",
        type: "function",
        function: { name: "get_weather", arguments: '{"loc' },
      },
      index: 0,
    });

    manager.addToolCallChunk({
      toolCall: {
        id: "call_123",
        type: "function",
        function: { name: "", arguments: 'ation":"Paris"}' },
      },
      index: 0,
    });

    const toolCalls = manager.getToolCalls();
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe("call_123");
    expect(toolCalls[0].function.name).toBe("get_weather");
    expect(toolCalls[0].function.arguments).toBe('{"location":"Paris"}');
  });

  it("should filter out incomplete tool calls", () => {
    const manager = new ToolCallManager([mockWeatherTool]);

    // Add complete tool call
    manager.addToolCallChunk({
      toolCall: {
        id: "call_123",
        type: "function",
        function: { name: "get_weather", arguments: "{}" },
      },
      index: 0,
    });

    // Add incomplete tool call (no name)
    manager.addToolCallChunk({
      toolCall: {
        id: "call_456",
        type: "function",
        function: { name: "", arguments: "{}" },
      },
      index: 1,
    });

    const toolCalls = manager.getToolCalls();
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe("call_123");
  });

  it("should execute tools and emit tool_result chunks", async () => {
    const manager = new ToolCallManager([mockWeatherTool]);

    manager.addToolCallChunk({
      toolCall: {
        id: "call_123",
        type: "function",
        function: { name: "get_weather", arguments: '{"location":"Paris"}' },
      },
      index: 0,
    });

    const { chunks: emittedChunks, result: finalResult } =
      await collectGeneratorOutput(manager.executeTools(mockDoneChunk));

    // Should emit one tool_result chunk
    expect(emittedChunks).toHaveLength(1);
    expect(emittedChunks[0].type).toBe("tool_result");
    expect(emittedChunks[0].toolCallId).toBe("call_123");
    expect(emittedChunks[0].content).toContain("temp");

    // Should return one tool result message
    expect(finalResult).toHaveLength(1);
    expect(finalResult[0].role).toBe("tool");
    expect(finalResult[0].toolCallId).toBe("call_123");

    // Tool execute should have been called
    expect(mockWeatherTool.execute).toHaveBeenCalledWith({ location: "Paris" });
  });

  it("should handle tool execution errors gracefully", async () => {
    const errorTool: Tool = {
      type: "function",
      function: {
        name: "error_tool",
        description: "Throws error",
        parameters: {},
      },
      execute: vi.fn(async () => {
        throw new Error("Tool failed");
      }),
    };

    const manager = new ToolCallManager([errorTool]);

    manager.addToolCallChunk({
      toolCall: {
        id: "call_123",
        type: "function",
        function: { name: "error_tool", arguments: "{}" },
      },
      index: 0,
    });

    // Properly consume the generator
    const { chunks, result: toolResults } = await collectGeneratorOutput(
      manager.executeTools(mockDoneChunk)
    );

    // Should still emit chunk with error message
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("Error executing tool: Tool failed");

    // Should still return tool result message
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].content).toContain("Error executing tool");
  });

  it("should handle tools without execute function", async () => {
    const noExecuteTool: Tool = {
      type: "function",
      function: {
        name: "no_execute",
        description: "No execute function",
        parameters: {},
      },
      // No execute function
    };

    const manager = new ToolCallManager([noExecuteTool]);

    manager.addToolCallChunk({
      toolCall: {
        id: "call_123",
        type: "function",
        function: { name: "no_execute", arguments: "{}" },
      },
      index: 0,
    });

    const { chunks, result: toolResults } = await collectGeneratorOutput(
      manager.executeTools(mockDoneChunk)
    );

    expect(chunks[0].content).toContain("does not have an execute function");
    expect(toolResults[0].content).toContain(
      "does not have an execute function"
    );
  });

  it("should clear tool calls", () => {
    const manager = new ToolCallManager([mockWeatherTool]);

    manager.addToolCallChunk({
      toolCall: {
        id: "call_123",
        type: "function",
        function: { name: "get_weather", arguments: "{}" },
      },
      index: 0,
    });

    expect(manager.hasToolCalls()).toBe(true);

    manager.clear();

    expect(manager.hasToolCalls()).toBe(false);
    expect(manager.getToolCalls()).toHaveLength(0);
  });

  it("should handle multiple tool calls in same iteration", async () => {
    const calculateTool: Tool = {
      type: "function",
      function: {
        name: "calculate",
        description: "Calculate",
        parameters: {},
      },
      execute: vi.fn(async (args: any) => {
        return JSON.stringify({ result: eval(args.expression) });
      }),
    };

    const manager = new ToolCallManager([mockWeatherTool, calculateTool]);

    // Add two different tool calls
    manager.addToolCallChunk({
      toolCall: {
        id: "call_weather",
        type: "function",
        function: { name: "get_weather", arguments: '{"location":"Paris"}' },
      },
      index: 0,
    });

    manager.addToolCallChunk({
      toolCall: {
        id: "call_calc",
        type: "function",
        function: { name: "calculate", arguments: '{"expression":"5+3"}' },
      },
      index: 1,
    });

    const toolCalls = manager.getToolCalls();
    expect(toolCalls).toHaveLength(2);

    const { chunks, result: toolResults } = await collectGeneratorOutput(
      manager.executeTools(mockDoneChunk)
    );

    // Should emit two tool_result chunks
    expect(chunks).toHaveLength(2);
    expect(chunks[0].toolCallId).toBe("call_weather");
    expect(chunks[1].toolCallId).toBe("call_calc");

    // Should return two tool result messages
    expect(toolResults).toHaveLength(2);
    expect(toolResults[0].toolCallId).toBe("call_weather");
    expect(toolResults[1].toolCallId).toBe("call_calc");
  });
});
