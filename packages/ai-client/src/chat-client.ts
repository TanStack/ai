import type { Message } from "@tanstack/ai";
import type { ChatMessage, ChatClientOptions, ChatRequestBody } from "./types";
import {
  createResponseStreamSource,
  processStream,
  type StreamEventHandlers,
} from "./stream";

export class ChatClient {
  private messages: ChatMessage[] = [];
  private isLoading: boolean = false;
  private error: Error | undefined = undefined;
  private abortController: AbortController | null = null;
  private uniqueId: string;

  private options: Required<
    Pick<
      ChatClientOptions,
      | "api"
      | "credentials"
      | "onResponse"
      | "onChunk"
      | "onFinish"
      | "onError"
      | "onMessagesChange"
      | "onLoadingChange"
      | "onErrorChange"
    >
  > & {
    headers?: Record<string, string> | Headers;
    body?: Record<string, any>;
    fetch: typeof fetch;
  };

  constructor(options: ChatClientOptions = {}) {
    this.uniqueId = options.id || this.generateUniqueId();
    this.messages = options.initialMessages || [];

    this.options = {
      api: options.api || "/api/chat",
      credentials: options.credentials || "same-origin",
      onResponse: options.onResponse || (() => {}),
      onChunk: options.onChunk || (() => {}),
      onFinish: options.onFinish || (() => {}),
      onError: options.onError || (() => {}),
      onMessagesChange: options.onMessagesChange || (() => {}),
      onLoadingChange: options.onLoadingChange || (() => {}),
      onErrorChange: options.onErrorChange || (() => {}),
      headers: options.headers,
      body: options.body,
      fetch: options.fetch || fetch,
    };
  }

  private generateUniqueId(): string {
    return `chat-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private generateMessageId(): string {
    return `${this.uniqueId}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`;
  }

  private setMessages(messages: ChatMessage[]): void {
    this.messages = messages;
    this.options.onMessagesChange(messages);
  }

  private setIsLoading(isLoading: boolean): void {
    this.isLoading = isLoading;
    this.options.onLoadingChange(isLoading);
  }

  private setError(error: Error | undefined): void {
    this.error = error;
    this.options.onErrorChange(error);
  }

  private async processResponseStream(
    response: Response
  ): Promise<ChatMessage> {
    const assistantMessageId = this.generateMessageId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date(),
    };

    // Add the assistant message placeholder
    this.setMessages([...this.messages, assistantMessage]);

    // Create stream source from response
    const source = createResponseStreamSource(response);

    // Define handlers for stream events
    const handlers: StreamEventHandlers = {
      onChunk: (chunk) => {
        // Call the user's onChunk callback
        this.options.onChunk(chunk);
      },
      onContent: (content) => {
        // Update the assistant message with new content
        this.setMessages(
          this.messages.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, content } : msg
          )
        );
      },
      onToolCall: (index, toolCall) => {
        // Update the assistant message with tool call
        this.setMessages(
          this.messages.map((msg) => {
            if (msg.id === assistantMessageId) {
              const existingToolCalls = msg.toolCalls || [];
              const updatedToolCalls = [...existingToolCalls];

              if (!updatedToolCalls[index]) {
                updatedToolCalls[index] = {
                  id: toolCall.id,
                  type: "function",
                  function: {
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments,
                  },
                };
              } else {
                updatedToolCalls[index].function.arguments +=
                  toolCall.function.arguments;
              }

              return { ...msg, toolCalls: updatedToolCalls };
            }
            return msg;
          })
        );
      },
    };

    // Process the stream
    const result = await processStream(source, handlers);

    // Create final message with accumulated content and tool calls
    const finalMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: result.content,
      createdAt: new Date(),
      ...(result.toolCalls && { toolCalls: result.toolCalls }),
    };

    // Update with final message
    this.setMessages(
      this.messages.map((msg) =>
        msg.id === assistantMessageId ? finalMessage : msg
      )
    );

    return finalMessage;
  }

  async append(message: Message | ChatMessage): Promise<void> {
    const chatMessage: ChatMessage = {
      ...(message as ChatMessage),
      id: (message as ChatMessage).id || this.generateMessageId(),
      createdAt: (message as ChatMessage).createdAt || new Date(),
    };

    // Add user message immediately
    this.setMessages([...this.messages, chatMessage]);
    this.setIsLoading(true);
    this.setError(undefined);

    // Create abort controller for this request
    const abortController = new AbortController();
    this.abortController = abortController;

    try {
      // Prepare request body
      const requestBody: ChatRequestBody = {
        messages: this.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          name: msg.name,
          toolCalls: msg.toolCalls,
          toolCallId: msg.toolCallId,
        })),
        data: this.options.body,
      };

      // Make the request
      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add custom headers
      if (this.options.headers) {
        if (this.options.headers instanceof Headers) {
          this.options.headers.forEach((value, key) => {
            requestHeaders[key] = value;
          });
        } else {
          Object.assign(requestHeaders, this.options.headers);
        }
      }

      const response = await this.options.fetch(this.options.api, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        credentials: this.options.credentials,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`
        );
      }

      // Call onResponse callback
      await this.options.onResponse(response);

      // Process the streaming response
      const assistantMessage = await this.processResponseStream(response);

      // Call onFinish callback
      this.options.onFinish(assistantMessage);
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          // Request was aborted, ignore
          return;
        }

        this.setError(err);
        this.options.onError(err);
      }
    } finally {
      this.setIsLoading(false);
      this.abortController = null;
    }
  }

  async sendMessage(content: string): Promise<void> {
    if (!content.trim() || this.isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: this.generateMessageId(),
      role: "user",
      content: content.trim(),
      createdAt: new Date(),
    };

    await this.append(userMessage);
  }

  async reload(): Promise<void> {
    if (this.messages.length === 0) return;

    // Find the last user message
    let lastUserMessageIndex = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === "user") {
        lastUserMessageIndex = i;
        break;
      }
    }

    if (lastUserMessageIndex === -1) return;

    // Remove all messages after the last user message
    const messagesToKeep = this.messages.slice(0, lastUserMessageIndex + 1);
    this.setMessages(messagesToKeep);

    // Resend the last user message
    await this.append(this.messages[lastUserMessageIndex]);
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.setIsLoading(false);
    }
  }

  clear(): void {
    this.setMessages([]);
    this.setError(undefined);
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  getIsLoading(): boolean {
    return this.isLoading;
  }

  getError(): Error | undefined {
    return this.error;
  }

  setMessagesManually(messages: ChatMessage[]): void {
    this.setMessages(messages);
  }
}
