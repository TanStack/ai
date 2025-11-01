import type { Message } from "@tanstack/ai";
import type { ChatMessage, ChatClientOptions } from "./types";
import type { ConnectionAdapter } from "./connection-adapters";
import { processStream, type StreamEventHandlers } from "./stream";
import { StreamProcessor } from "./stream/processor";
import type { ChunkStrategy, StreamParser } from "./stream/types";

export class ChatClient {
  private messages: ChatMessage[] = [];
  private isLoading: boolean = false;
  private error: Error | undefined = undefined;
  private connection: ConnectionAdapter;
  private uniqueId: string;
  private body?: Record<string, any>;
  private streamProcessorConfig?: {
    chunkStrategy?: ChunkStrategy;
    parser?: StreamParser;
  };

  private callbacks: {
    onResponse: (response?: Response) => void | Promise<void>;
    onChunk: (chunk: any) => void;
    onFinish: (message: ChatMessage) => void;
    onError: (error: Error) => void;
    onMessagesChange: (messages: ChatMessage[]) => void;
    onLoadingChange: (isLoading: boolean) => void;
    onErrorChange: (error: Error | undefined) => void;
  };

  constructor(options: ChatClientOptions) {
    this.uniqueId = options.id || this.generateUniqueId();
    this.messages = options.initialMessages || [];
    this.body = options.body;
    this.connection = options.connection;
    this.streamProcessorConfig = options.streamProcessor;

    this.callbacks = {
      onResponse: options.onResponse || (() => {}),
      onChunk: options.onChunk || (() => {}),
      onFinish: options.onFinish || (() => {}),
      onError: options.onError || (() => {}),
      onMessagesChange: options.onMessagesChange || (() => {}),
      onLoadingChange: options.onLoadingChange || (() => {}),
      onErrorChange: options.onErrorChange || (() => {}),
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
    this.callbacks.onMessagesChange(messages);
  }

  private setIsLoading(isLoading: boolean): void {
    this.isLoading = isLoading;
    this.callbacks.onLoadingChange(isLoading);
  }

  private setError(error: Error | undefined): void {
    this.error = error;
    this.callbacks.onErrorChange(error);
  }

  private async processStream(
    source: AsyncIterable<any>
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

    // Use new StreamProcessor if configured
    if (this.streamProcessorConfig) {
      return this.processStreamWithProcessor(source, assistantMessageId);
    }

    // Legacy processing (backward compatible)
    return this.processStreamLegacy(source, assistantMessageId);
  }

  /**
   * Process stream using the new StreamProcessor
   */
  private async processStreamWithProcessor(
    source: AsyncIterable<any>,
    assistantMessageId: string
  ): Promise<ChatMessage> {
    const processor = new StreamProcessor({
      chunkStrategy: this.streamProcessorConfig?.chunkStrategy,
      parser: this.streamProcessorConfig?.parser,
      handlers: {
        onTextUpdate: (content) => {
          // Update the assistant message with new content
          this.setMessages(
            this.messages.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, content } : msg
            )
          );
        },
        onToolCallStart: (index, id, name) => {
          // Initialize tool call in the message
          this.setMessages(
            this.messages.map((msg) => {
              if (msg.id === assistantMessageId) {
                const existingToolCalls = msg.toolCalls || [];
                const updatedToolCalls = [...existingToolCalls];

                updatedToolCalls[index] = {
                  id,
                  type: "function",
                  function: {
                    name,
                    arguments: "",
                  },
                };

                return { ...msg, toolCalls: updatedToolCalls };
              }
              return msg;
            })
          );
        },
        onToolCallDelta: (index, args) => {
          // Append arguments to the tool call (delta is just the new chunk)
          this.setMessages(
            this.messages.map((msg) => {
              if (msg.id === assistantMessageId) {
                const existingToolCalls = msg.toolCalls || [];
                const updatedToolCalls = [...existingToolCalls];

                if (updatedToolCalls[index]) {
                  updatedToolCalls[index].function.arguments += args;
                }

                return { ...msg, toolCalls: updatedToolCalls };
              }
              return msg;
            })
          );
        },
        onToolCallComplete: (_index, _id, _name, _args) => {
          // Tool call is complete - final state is already set via deltas
          // This event can be used for logging or side effects
        },
        onStreamEnd: (content, toolCalls) => {
          // Stream finished - final update
          const finalMessage: ChatMessage = {
            id: assistantMessageId,
            role: "assistant",
            content,
            createdAt: new Date(),
            ...(toolCalls && { toolCalls }),
          };

          this.setMessages(
            this.messages.map((msg) =>
              msg.id === assistantMessageId ? finalMessage : msg
            )
          );
        },
      },
    });

    const result = await processor.process(source);

    // Return the final message
    const finalMessage = this.messages.find(
      (msg) => msg.id === assistantMessageId
    );
    return (
      finalMessage || {
        id: assistantMessageId,
        role: "assistant",
        content: result.content,
        createdAt: new Date(),
        ...(result.toolCalls && { toolCalls: result.toolCalls }),
      }
    );
  }

  /**
   * Legacy stream processing (backward compatible)
   */
  private async processStreamLegacy(
    source: AsyncIterable<any>,
    assistantMessageId: string
  ): Promise<ChatMessage> {
    // Define handlers for stream events
    const handlers: StreamEventHandlers = {
      onChunk: (chunk) => {
        // Call the user's onChunk callback
        this.callbacks.onChunk(chunk);
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

    try {
      // Prepare messages for connection adapter
      const messagesToSend = this.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        name: msg.name,
        toolCalls: msg.toolCalls,
        toolCallId: msg.toolCallId,
      }));

      // Call onResponse callback (no Response object for non-fetch adapters)
      await this.callbacks.onResponse();

      // Connect and get stream from connection adapter
      const stream = this.connection.connect(messagesToSend, this.body);

      // Process the stream
      const assistantMessage = await this.processStream(stream);

      // Call onFinish callback
      this.callbacks.onFinish(assistantMessage);
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          // Request was aborted, ignore
          return;
        }

        this.setError(err);
        this.callbacks.onError(err);
      }
    } finally {
      this.setIsLoading(false);
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
    if (this.connection.abort) {
      this.connection.abort();
    }
    this.setIsLoading(false);
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
