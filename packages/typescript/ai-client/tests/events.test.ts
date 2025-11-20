import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ChatClientEventEmitter,
  DefaultChatClientEventEmitter,
} from "../src/events";
import { aiEventClient } from "@tanstack/ai/event-client";
import type { UIMessage } from "../src/types";

// Mock the event client
vi.mock("@tanstack/ai/event-client", () => ({
  aiEventClient: {
    emit: vi.fn(),
  },
}));

describe("events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DefaultChatClientEventEmitter", () => {
    let emitter: DefaultChatClientEventEmitter;

    beforeEach(() => {
      emitter = new DefaultChatClientEventEmitter("test-client-id");
    });

    it("should emit client:created event with clientId and timestamp", () => {
      emitter.clientCreated(5);

      expect(aiEventClient.emit).toHaveBeenCalledWith("client:created", {
        initialMessageCount: 5,
        clientId: "test-client-id",
        timestamp: expect.any(Number),
      });
    });

    it("should emit client:loading-changed event", () => {
      emitter.loadingChanged(true);

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        "client:loading-changed",
        {
          isLoading: true,
          clientId: "test-client-id",
          timestamp: expect.any(Number),
        }
      );
    });

    it("should emit client:error-changed event with null", () => {
      emitter.errorChanged(null);

      expect(aiEventClient.emit).toHaveBeenCalledWith("client:error-changed", {
        error: null,
        clientId: "test-client-id",
        timestamp: expect.any(Number),
      });
    });

    it("should emit client:error-changed event with error string", () => {
      emitter.errorChanged("Something went wrong");

      expect(aiEventClient.emit).toHaveBeenCalledWith("client:error-changed", {
        error: "Something went wrong",
        clientId: "test-client-id",
        timestamp: expect.any(Number),
      });
    });

    it("should emit processor:text-updated and client:assistant-message-updated", () => {
      emitter.textUpdated("stream-1", "msg-1", "Hello world");

      expect(aiEventClient.emit).toHaveBeenCalledTimes(2);
      expect(aiEventClient.emit).toHaveBeenNthCalledWith(
        1,
        "processor:text-updated",
        {
          streamId: "stream-1",
          content: "Hello world",
          timestamp: expect.any(Number),
        }
      );
      expect(aiEventClient.emit).toHaveBeenNthCalledWith(
        2,
        "client:assistant-message-updated",
        {
          messageId: "msg-1",
          content: "Hello world",
          clientId: "test-client-id",
          timestamp: expect.any(Number),
        }
      );
    });

    it("should emit processor:tool-call-state-changed and client:tool-call-updated", () => {
      emitter.toolCallStateChanged(
        "stream-1",
        "msg-1",
        "call-1",
        "get_weather",
        "input-complete",
        '{"city": "NYC"}'
      );

      expect(aiEventClient.emit).toHaveBeenCalledTimes(2);
      expect(aiEventClient.emit).toHaveBeenNthCalledWith(
        1,
        "processor:tool-call-state-changed",
        {
          streamId: "stream-1",
          toolCallId: "call-1",
          toolName: "get_weather",
          state: "input-complete",
          arguments: '{"city": "NYC"}',
          timestamp: expect.any(Number),
        }
      );
      expect(aiEventClient.emit).toHaveBeenNthCalledWith(
        2,
        "client:tool-call-updated",
        {
          messageId: "msg-1",
          toolCallId: "call-1",
          toolName: "get_weather",
          state: "input-complete",
          arguments: '{"city": "NYC"}',
          clientId: "test-client-id",
          timestamp: expect.any(Number),
        }
      );
    });

    it("should emit processor:tool-result-state-changed event", () => {
      emitter.toolResultStateChanged(
        "stream-1",
        "call-1",
        "Result content",
        "complete"
      );

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        "processor:tool-result-state-changed",
        {
          streamId: "stream-1",
          toolCallId: "call-1",
          content: "Result content",
          state: "complete",
          timestamp: expect.any(Number),
        }
      );
    });

    it("should emit processor:tool-result-state-changed with error", () => {
      emitter.toolResultStateChanged(
        "stream-1",
        "call-1",
        "Error occurred",
        "error",
        "Something failed"
      );

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        "processor:tool-result-state-changed",
        {
          streamId: "stream-1",
          toolCallId: "call-1",
          content: "Error occurred",
          state: "error",
          error: "Something failed",
          timestamp: expect.any(Number),
        }
      );
    });

    it("should emit client:approval-requested event", () => {
      emitter.approvalRequested(
        "msg-1",
        "call-1",
        "get_weather",
        { city: "NYC" },
        "approval-1"
      );

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        "client:approval-requested",
        {
          messageId: "msg-1",
          toolCallId: "call-1",
          toolName: "get_weather",
          input: { city: "NYC" },
          approvalId: "approval-1",
          clientId: "test-client-id",
          timestamp: expect.any(Number),
        }
      );
    });

    it("should emit client:message-appended with content preview", () => {
      const uiMessage: UIMessage = {
        id: "msg-1",
        role: "user",
        parts: [
          { type: "text", content: "Hello" },
          { type: "text", content: "World" },
        ],
        createdAt: new Date(),
      };

      emitter.messageAppended(uiMessage);

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        "client:message-appended",
        {
          messageId: "msg-1",
          role: "user",
          contentPreview: "Hello World",
          clientId: "test-client-id",
          timestamp: expect.any(Number),
        }
      );
    });

    it("should truncate content preview to 100 characters", () => {
      const longContent = "a".repeat(150);
      const uiMessage: UIMessage = {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", content: longContent }],
        createdAt: new Date(),
      };

      emitter.messageAppended(uiMessage);

      const call = (aiEventClient.emit as any).mock.calls[0];
      expect(call[1].contentPreview).toHaveLength(100);
    });

    it("should handle message with no text parts", () => {
      const uiMessage: UIMessage = {
        id: "msg-1",
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            id: "call-1",
            name: "tool1",
            arguments: "{}",
            state: "input-complete",
          },
        ],
        createdAt: new Date(),
      };

      emitter.messageAppended(uiMessage);

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        "client:message-appended",
        {
          messageId: "msg-1",
          role: "assistant",
          contentPreview: "",
          clientId: "test-client-id",
          timestamp: expect.any(Number),
        }
      );
    });

    it("should emit client:message-sent event", () => {
      emitter.messageSent("msg-1", "Hello world");

      expect(aiEventClient.emit).toHaveBeenCalledWith("client:message-sent", {
        messageId: "msg-1",
        content: "Hello world",
        clientId: "test-client-id",
        timestamp: expect.any(Number),
      });
    });

    it("should emit client:reloaded event", () => {
      emitter.reloaded(3);

      expect(aiEventClient.emit).toHaveBeenCalledWith("client:reloaded", {
        fromMessageIndex: 3,
        clientId: "test-client-id",
        timestamp: expect.any(Number),
      });
    });

    it("should emit client:stopped event", () => {
      emitter.stopped();

      expect(aiEventClient.emit).toHaveBeenCalledWith("client:stopped", {
        clientId: "test-client-id",
        timestamp: expect.any(Number),
      });
    });

    it("should emit client:messages-cleared event", () => {
      emitter.messagesCleared();

      expect(aiEventClient.emit).toHaveBeenCalledWith("client:messages-cleared", {
        clientId: "test-client-id",
        timestamp: expect.any(Number),
      });
    });

    it("should emit tool:result-added event", () => {
      emitter.toolResultAdded("call-1", "get_weather", { temp: 72 }, "output-available");

      expect(aiEventClient.emit).toHaveBeenCalledWith("tool:result-added", {
        toolCallId: "call-1",
        toolName: "get_weather",
        output: { temp: 72 },
        state: "output-available",
        clientId: "test-client-id",
        timestamp: expect.any(Number),
      });
    });

    it("should emit tool:approval-responded event", () => {
      emitter.toolApprovalResponded("approval-1", "call-1", true);

      expect(aiEventClient.emit).toHaveBeenCalledWith("tool:approval-responded", {
        approvalId: "approval-1",
        toolCallId: "call-1",
        approved: true,
        clientId: "test-client-id",
        timestamp: expect.any(Number),
      });
    });
  });
});

