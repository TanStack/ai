import { describe, it, expect, vi } from "vitest";
import { StreamProcessor } from "../src/stream/processor";

describe("StreamProcessor - Tool Call Handling", () => {
  it("should handle multiple tool calls with same index correctly", async () => {
    // REAL chunks captured from actual OpenAI stream
    const rawChunks = [
      // First response: getGuitars
      {
        type: "tool_call",
        id: "chatcmpl-CXZrKuhSRu4G2qbT1mNYCEvNd8DMJ",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703060,
        toolCall: {
          id: "call_RhSbfkt2O34Wozns6KFxSvL7",
          type: "function",
          function: {
            name: "getGuitars",
            arguments: "",
          },
        },
        index: 0,
      },
      {
        type: "tool_call",
        id: "chatcmpl-CXZrKuhSRu4G2qbT1mNYCEvNd8DMJ",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703060,
        toolCall: {
          id: "call_RhSbfkt2O34Wozns6KFxSvL7",
          type: "function",
          function: {
            name: "getGuitars",
            arguments: "{}",
          },
        },
        index: 0,
      },
      {
        type: "done",
        id: "chatcmpl-CXZrKuhSRu4G2qbT1mNYCEvNd8DMJ",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703060,
        finishReason: "tool_calls",
      },
      // Tool result
      {
        type: "tool_result",
        id: "chatcmpl-CXZrKuhSRu4G2qbT1mNYCEvNd8DMJ",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703087,
        toolCallId: "call_RhSbfkt2O34Wozns6KFxSvL7",
        content: '[{"id":6,"name":"Travelin\' Man Guitar"}]',
      },
      // Second response: recommendGuitar (ALSO index 0!)
      {
        type: "tool_call",
        id: "chatcmpl-CXZrLsKvaT7GXnWB6MY7v0uxylC4I",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703598,
        toolCall: {
          id: "call_SP6fjKyNURSf4EebfrnsdpTM",
          type: "function",
          function: {
            name: "recommendGuitar",
            arguments: "",
          },
        },
        index: 0,
      },
      {
        type: "tool_call",
        id: "chatcmpl-CXZrLsKvaT7GXnWB6MY7v0uxylC4I",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703598,
        toolCall: {
          id: "call_SP6fjKyNURSf4EebfrnsdpTM",
          type: "function",
          function: {
            name: "recommendGuitar",
            arguments: '{"',
          },
        },
        index: 0,
      },
      {
        type: "tool_call",
        id: "chatcmpl-CXZrLsKvaT7GXnWB6MY7v0uxylC4I",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703598,
        toolCall: {
          id: "call_SP6fjKyNURSf4EebfrnsdpTM",
          type: "function",
          function: {
            name: "recommendGuitar",
            arguments: "id",
          },
        },
        index: 0,
      },
      {
        type: "tool_call",
        id: "chatcmpl-CXZrLsKvaT7GXnWB6MY7v0uxylC4I",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703598,
        toolCall: {
          id: "call_SP6fjKyNURSf4EebfrnsdpTM",
          type: "function",
          function: {
            name: "recommendGuitar",
            arguments: '":"',
          },
        },
        index: 0,
      },
      {
        type: "tool_call",
        id: "chatcmpl-CXZrLsKvaT7GXnWB6MY7v0uxylC4I",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703598,
        toolCall: {
          id: "call_SP6fjKyNURSf4EebfrnsdpTM",
          type: "function",
          function: {
            name: "recommendGuitar",
            arguments: "6",
          },
        },
        index: 0,
      },
      {
        type: "tool_call",
        id: "chatcmpl-CXZrLsKvaT7GXnWB6MY7v0uxylC4I",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703598,
        toolCall: {
          id: "call_SP6fjKyNURSf4EebfrnsdpTM",
          type: "function",
          function: {
            name: "recommendGuitar",
            arguments: '"}',
          },
        },
        index: 0,
      },
      {
        type: "done",
        id: "chatcmpl-CXZrLsKvaT7GXnWB6MY7v0uxylC4I",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703598,
        finishReason: "tool_calls",
      },
      // Tool result for recommendGuitar
      {
        type: "tool_result",
        id: "chatcmpl-CXZrLsKvaT7GXnWB6MY7v0uxylC4I",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118703715,
        toolCallId: "call_SP6fjKyNURSf4EebfrnsdpTM",
        content: '{"id":"6"}',
      },
      // Final response with text content
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: "Complete",
        content: "Complete",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: "!",
        content: "Complete!",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: " If",
        content: "Complete! If",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: " you",
        content: "Complete! If you",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: " need",
        content: "Complete! If you need",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: " anything",
        content: "Complete! If you need anything",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: " else",
        content: "Complete! If you need anything else",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: ",",
        content: "Complete! If you need anything else,",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: " feel",
        content: "Complete! If you need anything else, feel",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: " free",
        content: "Complete! If you need anything else, feel free",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: " to",
        content: "Complete! If you need anything else, feel free to",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: " ask",
        content: "Complete! If you need anything else, feel free to ask",
        role: "assistant",
      },
      {
        type: "content",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        delta: ".",
        content: "Complete! If you need anything else, feel free to ask.",
        role: "assistant",
      },
      {
        type: "done",
        id: "chatcmpl-CXZrLlrA0MSqH2JAUVEz6OWwc7z81",
        model: "gpt-4o-2024-08-06",
        timestamp: 1762118704048,
        finishReason: "stop",
      },
    ];

    // Track what handlers are called
    const events: any[] = [];

    const processor = new StreamProcessor({
      handlers: {
        onTextUpdate: (content) => {
          events.push({ type: "text", content });
        },
        onToolCallStateChange: (index, id, name, state, args) => {
          events.push({ type: "tool-call", index, id, name, state, args });
        },
      },
    });

    // Convert chunks to async iterable
    async function* createStream() {
      for (const chunk of rawChunks) {
        yield chunk;
      }
    }

    const result = await processor.process(createStream());

    console.log("Result:", result);
    console.log("Events:", events);

    // Expected: TWO tool calls with different IDs
    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls!.length).toBe(2);

    // First tool call: getGuitars
    const getGuitarsCall = result.toolCalls![0];
    expect(getGuitarsCall.function.name).toBe("getGuitars");
    expect(getGuitarsCall.function.arguments).toBe("{}");
    expect(getGuitarsCall.id).toBe("call_RhSbfkt2O34Wozns6KFxSvL7");

    // Second tool call: recommendGuitar
    const recommendCall = result.toolCalls![1];
    expect(recommendCall.function.name).toBe("recommendGuitar");
    expect(recommendCall.function.arguments).toBe('{"id":"6"}');
    expect(recommendCall.id).toBe("call_SP6fjKyNURSf4EebfrnsdpTM");

    // Text content should be present
    expect(result.content).toBe(
      "Complete! If you need anything else, feel free to ask."
    );
  });
});
