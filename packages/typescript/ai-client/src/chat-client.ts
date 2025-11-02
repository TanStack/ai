import type { ModelMessage } from "@tanstack/ai";
import type { UIMessage, MessagePart, ToolCallPart, ToolResultPart, ChatClientOptions } from "./types";
import type { ConnectionAdapter } from "./connection-adapters";
import { processStream, type StreamEventHandlers } from "./stream";
import { StreamProcessor } from "./stream/processor";
import type { ChunkStrategy, StreamParser } from "./stream/types";
import { uiMessageToModelMessages } from "./message-converters";

export class ChatClient {
  private messages: UIMessage[] = [];
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
    onFinish: (message: UIMessage) => void;
    onError: (error: Error) => void;
    onMessagesChange: (messages: UIMessage[]) => void;
    onLoadingChange: (isLoading: boolean) => void;
    onErrorChange: (error: Error | undefined) => void;
  };

  constructor(options: ChatClientOptions) {
    this.uniqueId = options.id || this.generateUniqueId();
    this.messages = options.initialMessages || [];
    this.body = options.body;
    this.connection = options.connection;
    // Always use StreamProcessor with default config
    this.streamProcessorConfig = options.streamProcessor || {};

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

  private setMessages(messages: UIMessage[]): void {
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
  ): Promise<UIMessage> {
    const assistantMessageId = this.generateMessageId();
    const assistantMessage: UIMessage = {
      id: assistantMessageId,
      role: "assistant",
      parts: [],
      createdAt: new Date(),
    };

    // Add the assistant message placeholder
    this.setMessages([...this.messages, assistantMessage]);

    // Always use the new StreamProcessor
    return this.processStreamWithProcessor(source, assistantMessageId);
  }

  /**
   * Process stream using the new StreamProcessor with parts-based messages
   */
  private async processStreamWithProcessor(
    source: AsyncIterable<any>,
    assistantMessageId: string
  ): Promise<UIMessage> {
    // Collect raw chunks for debugging
    const rawChunks: any[] = [];
    
    const processor = new StreamProcessor({
      chunkStrategy: this.streamProcessorConfig?.chunkStrategy,
      parser: this.streamProcessorConfig?.parser,
      handlers: {
        onTextUpdate: (content) => {
          // Update the text part in the message
          this.setMessages(
            this.messages.map((msg) => {
              if (msg.id === assistantMessageId) {
                let parts = [...msg.parts];
                const textPartIndex = parts.findIndex(p => p.type === "text");
                
                // Always add/update text part at the end (after tool calls)
                if (textPartIndex >= 0) {
                  parts[textPartIndex] = { type: "text", content };
                } else {
                  // Remove existing parts temporarily to ensure order
                  const toolCallParts = parts.filter(p => p.type === "tool-call");
                  const otherParts = parts.filter(p => p.type !== "tool-call" && p.type !== "text");
                  
                  // Rebuild: tool calls first, then other parts, then text
                  parts = [...toolCallParts, ...otherParts, { type: "text", content }];
                }
                
                return { ...msg, parts };
              }
              return msg;
            })
          );
        },
        onToolCallStateChange: (index, id, name, state, args) => {
          // Update or create tool call part with state
          this.setMessages(
            this.messages.map((msg) => {
              if (msg.id === assistantMessageId) {
                let parts = [...msg.parts];
                // Find by ID, not index!
                const existingPartIndex = parts.findIndex(
                  (p): p is ToolCallPart => p.type === "tool-call" && p.id === id
                );

                const toolCallPart: ToolCallPart = {
                  type: "tool-call",
                  id,
                  name,
                  arguments: args,
                  state,
                };

                if (existingPartIndex >= 0) {
                  // Update existing tool call
                  parts[existingPartIndex] = toolCallPart;
                } else {
                  // Insert tool call before any text parts
                  const textPartIndex = parts.findIndex(p => p.type === "text");
                  if (textPartIndex >= 0) {
                    parts.splice(textPartIndex, 0, toolCallPart);
                  } else {
                    parts.push(toolCallPart);
                  }
                }

                return { ...msg, parts };
              }
              return msg;
            })
          );
        },
        onToolResultStateChange: (toolCallId, content, state, error) => {
          // Update or create tool result part
          this.setMessages(
            this.messages.map((msg) => {
              if (msg.id === assistantMessageId) {
                const parts = [...msg.parts];
                const resultPartIndex = parts.findIndex(
                  (p): p is ToolResultPart => p.type === "tool-result" && p.toolCallId === toolCallId
                );

                const toolResultPart: ToolResultPart = {
                  type: "tool-result",
                  toolCallId,
                  content,
                  state,
                  ...(error && { error }),
                };

                if (resultPartIndex >= 0) {
                  parts[resultPartIndex] = toolResultPart;
                } else {
                  parts.push(toolResultPart);
                }

                return { ...msg, parts };
              }
              return msg;
            })
          );
        },
        onStreamEnd: () => {
          // Stream finished - parts are already updated
        },
      },
    });

    // Wrap source to collect raw chunks
    const wrappedSource = async function* (this: ChatClient) {
      for await (const chunk of source) {
        rawChunks.push(chunk);
        this.callbacks.onChunk(chunk);
        yield chunk;
      }
    }.call(this);

    await processor.process(wrappedSource);

    // Return the final message
    const finalMessage = this.messages.find(
      (msg) => msg.id === assistantMessageId
    );
    
    return finalMessage || {
      id: assistantMessageId,
      role: "assistant",
      parts: [],
      createdAt: new Date(),
    };
  }

  async append(message: UIMessage | ModelMessage): Promise<void> {
    // Convert ModelMessage to UIMessage if needed
    let uiMessage: UIMessage;
    
    if ('parts' in message) {
      // Already a UIMessage
      uiMessage = {
        ...message,
        id: message.id || this.generateMessageId(),
        createdAt: message.createdAt || new Date(),
      };
    } else {
      // ModelMessage - convert to UIMessage
      const parts: MessagePart[] = [];
      if (message.content) {
        parts.push({ type: "text", content: message.content });
      }
      if (message.toolCalls) {
        for (const tc of message.toolCalls) {
          parts.push({
            type: "tool-call",
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
            state: "input-complete",
          });
        }
      }
      if (message.role === "tool" && message.toolCallId) {
        parts.push({
          type: "tool-result",
          toolCallId: message.toolCallId,
          content: message.content || "",
          state: "complete",
        });
      }
      
      uiMessage = {
        id: this.generateMessageId(),
        role: message.role === "tool" ? "assistant" : message.role,
        parts,
        createdAt: new Date(),
      };
    }

    // Add message immediately
    this.setMessages([...this.messages, uiMessage]);
    this.setIsLoading(true);
    this.setError(undefined);

    try {
      // Convert UIMessages to ModelMessages for connection adapter
      const modelMessages: ModelMessage[] = [];
      for (const msg of this.messages) {
        modelMessages.push(...uiMessageToModelMessages(msg));
      }

      // Call onResponse callback (no Response object for non-fetch adapters)
      await this.callbacks.onResponse();

      // Connect and get stream from connection adapter
      const stream = this.connection.connect(modelMessages, this.body);

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

    const userMessage: UIMessage = {
      id: this.generateMessageId(),
      role: "user",
      parts: [{ type: "text", content: content.trim() }],
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

  getMessages(): UIMessage[] {
    return this.messages;
  }

  getIsLoading(): boolean {
    return this.isLoading;
  }

  getError(): Error | undefined {
    return this.error;
  }

  setMessagesManually(messages: UIMessage[]): void {
    this.setMessages(messages);
  }
}
