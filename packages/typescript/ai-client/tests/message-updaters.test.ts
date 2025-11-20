import { describe, it, expect } from "vitest";
import {
  updateTextPart,
  updateToolCallPart,
  updateToolResultPart,
  updateToolCallApproval,
  updateToolCallState,
  updateToolCallWithOutput,
  updateToolCallApprovalResponse,
} from "../src/message-updaters";
import type { UIMessage } from "../src/types";

describe("message-updaters", () => {
  describe("updateTextPart", () => {
    it("should add text part to empty message", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [],
        },
      ];

      const result = updateTextPart(messages, "msg-1", "Hello");

      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0]).toEqual({ type: "text", content: "Hello" });
    });

    it("should update existing text part", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [{ type: "text", content: "Hello" }],
        },
      ];

      const result = updateTextPart(messages, "msg-1", "Hello world");

      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0]).toEqual({
        type: "text",
        content: "Hello world",
      });
    });

    it("should place text part after tool calls", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "input-complete",
            },
          ],
        },
      ];

      const result = updateTextPart(messages, "msg-1", "Hello");

      expect(result[0].parts).toHaveLength(2);
      expect(result[0].parts[0].type).toBe("tool-call");
      expect(result[0].parts[1]).toEqual({ type: "text", content: "Hello" });
    });

    it("should maintain order: tool calls, other parts, text", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "input-complete",
            },
            {
              type: "tool-result",
              toolCallId: "tool-1",
              content: "result",
              state: "complete",
            },
          ],
        },
      ];

      const result = updateTextPart(messages, "msg-1", "Hello");

      expect(result[0].parts).toHaveLength(3);
      expect(result[0].parts[0].type).toBe("tool-call");
      expect(result[0].parts[1].type).toBe("tool-result");
      expect(result[0].parts[2]).toEqual({ type: "text", content: "Hello" });
    });

    it("should not modify other messages", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [],
        },
        {
          id: "msg-2",
          role: "user",
          parts: [{ type: "text", content: "User message" }],
        },
      ];

      const result = updateTextPart(messages, "msg-1", "Hello");

      expect(result[0].parts).toHaveLength(1);
      expect(result[1].parts).toHaveLength(1);
      expect(result[1].parts[0]).toEqual({
        type: "text",
        content: "User message",
      });
    });

    it("should return new array (immutability)", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [],
        },
      ];

      const result = updateTextPart(messages, "msg-1", "Hello");

      expect(result).not.toBe(messages);
      expect(messages[0].parts).toHaveLength(0);
    });
  });

  describe("updateToolCallPart", () => {
    it("should add tool call part to empty message", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [],
        },
      ];

      const result = updateToolCallPart(messages, "msg-1", {
        id: "tool-1",
        name: "test",
        arguments: '{"x": 1}',
        state: "input-complete",
      });

      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0]).toEqual({
        type: "tool-call",
        id: "tool-1",
        name: "test",
        arguments: '{"x": 1}',
        state: "input-complete",
      });
    });

    it("should update existing tool call part", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: '{"x": 1}',
              state: "input-streaming",
            },
          ],
        },
      ];

      const result = updateToolCallPart(messages, "msg-1", {
        id: "tool-1",
        name: "test",
        arguments: '{"x": 1, "y": 2}',
        state: "input-complete",
      });

      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0]).toEqual({
        type: "tool-call",
        id: "tool-1",
        name: "test",
        arguments: '{"x": 1, "y": 2}',
        state: "input-complete",
      });
    });

    it("should insert tool call before text parts", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [{ type: "text", content: "Hello" }],
        },
      ];

      const result = updateToolCallPart(messages, "msg-1", {
        id: "tool-1",
        name: "test",
        arguments: "{}",
        state: "input-complete",
      });

      expect(result[0].parts).toHaveLength(2);
      expect(result[0].parts[0].type).toBe("tool-call");
      expect(result[0].parts[1].type).toBe("text");
    });

    it("should not modify other messages", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [],
        },
        {
          id: "msg-2",
          role: "user",
          parts: [{ type: "text", content: "User message" }],
        },
      ];

      const result = updateToolCallPart(messages, "msg-1", {
        id: "tool-1",
        name: "test",
        arguments: "{}",
        state: "input-complete",
      });

      expect(result[0].parts).toHaveLength(1);
      expect(result[1].parts).toHaveLength(1);
    });
  });

  describe("updateToolResultPart", () => {
    it("should add tool result part to message", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [],
        },
      ];

      const result = updateToolResultPart(
        messages,
        "msg-1",
        "tool-1",
        "result content",
        "complete"
      );

      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0]).toEqual({
        type: "tool-result",
        toolCallId: "tool-1",
        content: "result content",
        state: "complete",
      });
    });

    it("should update existing tool result part", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-result",
              toolCallId: "tool-1",
              content: "old content",
              state: "streaming",
            },
          ],
        },
      ];

      const result = updateToolResultPart(
        messages,
        "msg-1",
        "tool-1",
        "new content",
        "complete"
      );

      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0]).toEqual({
        type: "tool-result",
        toolCallId: "tool-1",
        content: "new content",
        state: "complete",
      });
    });

    it("should include error when provided", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [],
        },
      ];

      const result = updateToolResultPart(
        messages,
        "msg-1",
        "tool-1",
        "error content",
        "error",
        "Something went wrong"
      );

      expect(result[0].parts[0]).toEqual({
        type: "tool-result",
        toolCallId: "tool-1",
        content: "error content",
        state: "error",
        error: "Something went wrong",
      });
    });
  });

  describe("updateToolCallApproval", () => {
    it("should add approval metadata to tool call", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "input-complete",
            },
          ],
        },
      ];

      const result = updateToolCallApproval(
        messages,
        "msg-1",
        "tool-1",
        "approval-123"
      );

      const toolCall = result[0].parts[0];
      expect(toolCall.type).toBe("tool-call");
      if (toolCall.type === "tool-call") {
        expect(toolCall.state).toBe("approval-requested");
        expect(toolCall.approval).toEqual({
          id: "approval-123",
          needsApproval: true,
        });
      }
    });

    it("should not modify tool call if not found", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "input-complete",
            },
          ],
        },
      ];

      const result = updateToolCallApproval(
        messages,
        "msg-1",
        "tool-2",
        "approval-123"
      );

      const toolCall = result[0].parts[0];
      if (toolCall.type === "tool-call") {
        expect(toolCall.state).toBe("input-complete");
        expect(toolCall.approval).toBeUndefined();
      }
    });
  });

  describe("updateToolCallState", () => {
    it("should update tool call state", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "input-streaming",
            },
          ],
        },
      ];

      const result = updateToolCallState(
        messages,
        "msg-1",
        "tool-1",
        "input-complete"
      );

      const toolCall = result[0].parts[0];
      if (toolCall.type === "tool-call") {
        expect(toolCall.state).toBe("input-complete");
      }
    });

    it("should not modify tool call if not found", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "input-streaming",
            },
          ],
        },
      ];

      const result = updateToolCallState(
        messages,
        "msg-1",
        "tool-2",
        "input-complete"
      );

      const toolCall = result[0].parts[0];
      if (toolCall.type === "tool-call") {
        expect(toolCall.state).toBe("input-streaming");
      }
    });
  });

  describe("updateToolCallWithOutput", () => {
    it("should update tool call with output", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "input-complete",
            },
          ],
        },
      ];

      const result = updateToolCallWithOutput(
        messages,
        "tool-1",
        { result: "success" }
      );

      const toolCall = result[0].parts[0];
      if (toolCall.type === "tool-call") {
        expect(toolCall.output).toEqual({ result: "success" });
        expect(toolCall.state).toBe("input-complete");
      }
    });

    it("should update state when provided", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "input-complete",
            },
          ],
        },
      ];

      const result = updateToolCallWithOutput(
        messages,
        "tool-1",
        { result: "success" },
        "approval-requested"
      );

      const toolCall = result[0].parts[0];
      if (toolCall.type === "tool-call") {
        expect(toolCall.state).toBe("approval-requested");
      }
    });

    it("should handle error text", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "input-complete",
            },
          ],
        },
      ];

      const result = updateToolCallWithOutput(
        messages,
        "tool-1",
        null,
        undefined,
        "Error occurred"
      );

      const toolCall = result[0].parts[0];
      if (toolCall.type === "tool-call") {
        expect(toolCall.output).toEqual({ error: "Error occurred" });
      }
    });

    it("should search across all messages", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [],
        },
        {
          id: "msg-2",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "input-complete",
            },
          ],
        },
      ];

      const result = updateToolCallWithOutput(
        messages,
        "tool-1",
        { result: "success" }
      );

      expect(result[0].parts).toHaveLength(0);
      const toolCall = result[1].parts[0];
      if (toolCall.type === "tool-call") {
        expect(toolCall.output).toEqual({ result: "success" });
      }
    });
  });

  describe("updateToolCallApprovalResponse", () => {
    it("should update approval response", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "approval-requested",
              approval: {
                id: "approval-123",
                needsApproval: true,
              },
            },
          ],
        },
      ];

      const result = updateToolCallApprovalResponse(
        messages,
        "approval-123",
        true
      );

      const toolCall = result[0].parts[0];
      if (toolCall.type === "tool-call" && toolCall.approval) {
        expect(toolCall.approval.approved).toBe(true);
        expect(toolCall.state).toBe("approval-responded");
      }
    });

    it("should handle denied approval", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "approval-requested",
              approval: {
                id: "approval-123",
                needsApproval: true,
              },
            },
          ],
        },
      ];

      const result = updateToolCallApprovalResponse(
        messages,
        "approval-123",
        false
      );

      const toolCall = result[0].parts[0];
      if (toolCall.type === "tool-call" && toolCall.approval) {
        expect(toolCall.approval.approved).toBe(false);
        expect(toolCall.state).toBe("approval-responded");
      }
    });

    it("should search across all messages", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [],
        },
        {
          id: "msg-2",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "approval-requested",
              approval: {
                id: "approval-123",
                needsApproval: true,
              },
            },
          ],
        },
      ];

      const result = updateToolCallApprovalResponse(
        messages,
        "approval-123",
        true
      );

      expect(result[0].parts).toHaveLength(0);
      const toolCall = result[1].parts[0];
      if (toolCall.type === "tool-call" && toolCall.approval) {
        expect(toolCall.approval.approved).toBe(true);
      }
    });

    it("should not modify if approval not found", () => {
      const messages: UIMessage[] = [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              id: "tool-1",
              name: "test",
              arguments: "{}",
              state: "approval-requested",
              approval: {
                id: "approval-123",
                needsApproval: true,
              },
            },
          ],
        },
      ];

      const result = updateToolCallApprovalResponse(
        messages,
        "approval-999",
        true
      );

      const toolCall = result[0].parts[0];
      if (toolCall.type === "tool-call" && toolCall.approval) {
        expect(toolCall.approval.approved).toBeUndefined();
        expect(toolCall.state).toBe("approval-requested");
      }
    });
  });
});

