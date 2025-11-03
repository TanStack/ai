import { useState, useCallback, useRef, useEffect, useId } from "react";
import { ChatClient } from "@tanstack/ai-client";
import type { ModelMessage } from "@tanstack/ai";
import type { UseChatOptions, UseChatReturn, UIMessage } from "./types";

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const hookId = useId();
  const clientId = options.id || hookId;

  const [messages, setMessages] = useState<UIMessage[]>(
    options.initialMessages || []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // Create ChatClient instance with callbacks to sync state
  const clientRef = useRef<ChatClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new ChatClient({
      ...options,
      id: clientId,
      onMessagesChange: (newMessages: UIMessage[]) => {
        setMessages(newMessages);
      },
      onLoadingChange: (newIsLoading: boolean) => {
        setIsLoading(newIsLoading);
      },
      onErrorChange: (newError: Error | undefined) => {
        setError(newError);
      },
    });
  }

  const client = clientRef.current;

  // Sync initial messages if they change
  useEffect(() => {
    if (options.initialMessages && options.initialMessages.length > 0) {
      client.setMessagesManually(options.initialMessages);
    }
  }, []); // Only run on mount

  const sendMessage = useCallback(
    async (content: string) => {
      await client.sendMessage(content);
    },
    [client]
  );

  const append = useCallback(
    async (message: ModelMessage | UIMessage) => {
      await client.append(message);
    },
    [client]
  );

  const reload = useCallback(async () => {
    await client.reload();
  }, [client]);

  const stop = useCallback(() => {
    client.stop();
  }, [client]);

  const clear = useCallback(() => {
    client.clear();
  }, [client]);

  const setMessagesManually = useCallback(
    (newMessages: UIMessage[]) => {
      client.setMessagesManually(newMessages);
    },
    [client]
  );

  const addToolResult = useCallback(
    async (result: {
      toolCallId: string;
      tool: string;
      output: any;
      state?: "output-available" | "output-error";
      errorText?: string;
    }) => {
      await client.addToolResult(result);
    },
    [client]
  );

  const addToolApprovalResponse = useCallback(
    async (response: { id: string; approved: boolean }) => {
      await client.addToolApprovalResponse(response);
    },
    [client]
  );

  return {
    messages,
    sendMessage,
    append,
    reload,
    stop,
    isLoading,
    error,
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    addToolApprovalResponse,
  };
}
