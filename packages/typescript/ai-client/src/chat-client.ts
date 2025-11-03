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
    onToolCall?: (args: {
      toolCallId: string;
      toolName: string;
      input: any;
    }) => Promise<any>;
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
      onToolCall: options.onToolCall,
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
        onApprovalRequested: async (toolCallId, toolName, input, approvalId) => {
          // Update tool call part to show it needs approval
          this.setMessages(
            this.messages.map((msg) => {
              if (msg.id === assistantMessageId) {
                const parts = [...msg.parts];
                const toolCallPart = parts.find(
                  (p): p is ToolCallPart => p.type === "tool-call" && p.id === toolCallId
                ) as ToolCallPart;

                if (toolCallPart) {
                  toolCallPart.state = "approval-requested";
                  toolCallPart.approval = {
                    id: approvalId,
                    needsApproval: true,
                  };
                }

                return { ...msg, parts };
              }
              return msg;
            })
          );
        },
        onToolInputAvailable: async (toolCallId, toolName, input) => {
          // If onToolCall callback exists, execute immediately
          if (this.callbacks.onToolCall) {
            try {
              const output = await this.callbacks.onToolCall({
                toolCallId,
                toolName,
                input,
              });

              // Add result and trigger auto-send
              await this.addToolResult({
                toolCallId,
                tool: toolName,
                output,
                state: "output-available",
              });
            } catch (error: any) {
              await this.addToolResult({
                toolCallId,
                tool: toolName,
                output: null,
                state: "output-error",
                errorText: error.message,
              });
            }
          } else {
            // No callback - just mark as input-complete (UI should handle)
            this.setMessages(
              this.messages.map((msg) => {
                if (msg.id === assistantMessageId) {
                  const parts = [...msg.parts];
                  const toolCallPart = parts.find(
                    (p): p is ToolCallPart => p.type === "tool-call" && p.id === toolCallId
                  ) as ToolCallPart;

                  if (toolCallPart) {
                    toolCallPart.state = "input-complete";
                  }

                  return { ...msg, parts };
                }
                return msg;
              })
            );
          }
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

  /**
   * Add the result of a client-side tool execution
   */
  async addToolResult(result: {
    toolCallId: string;
    tool: string;
    output: any;
    state?: "output-available" | "output-error";
    errorText?: string;
  }): Promise<void> {
    // Update the tool call part with the output
    this.setMessages(
      this.messages.map((msg) => {
        const parts = [...msg.parts];
        const toolCallPart = parts.find(
          (p): p is ToolCallPart => p.type === "tool-call" && p.id === result.toolCallId
        ) as ToolCallPart;

        if (toolCallPart) {
          toolCallPart.output = result.output;
          toolCallPart.state = result.state || "input-complete";
          
          if (result.errorText) {
            toolCallPart.output = { error: result.errorText };
          }
        }

        return { ...msg, parts };
      })
    );

    // Check if we should auto-send
    if (this.shouldAutoSend()) {
      // Continue the flow without adding a new message
      await this.continueFlow();
    }
  }

  /**
   * Respond to a tool approval request
   */
  async addToolApprovalResponse(response: {
    id: string; // approval.id, not toolCallId
    approved: boolean;
  }): Promise<void> {
    // Find and update the tool call part with approval decision
    this.setMessages(
      this.messages.map((msg) => {
        const parts = [...msg.parts];
        const toolCallPart = parts.find(
          (p): p is ToolCallPart =>
            p.type === "tool-call" &&
            p.approval?.id === response.id
        ) as ToolCallPart;

        if (toolCallPart && toolCallPart.approval) {
          toolCallPart.approval.approved = response.approved;
          toolCallPart.state = "approval-responded";
        }

        return { ...msg, parts };
      })
    );

    // Check if we should auto-send
    if (this.shouldAutoSend()) {
      // Continue the flow without adding a new message
      await this.continueFlow();
    }
  }

  /**
   * Continue the agent flow with current messages (for approvals/tool results)
   */
  private async continueFlow(): Promise<void> {
    if (this.isLoading) return;

    try {
      this.setIsLoading(true);
      this.setError(undefined);

      // Process the current conversation state
      await this.processStream(
        this.connection.connect(this.messages, this.body)
      );
    } catch (err: any) {
      this.setError(err);
      this.callbacks.onError(err);
    } finally {
      this.setIsLoading(false);
    }
  }

  /**
   * Check if all tool calls are complete and we should auto-send
   */
  private shouldAutoSend(): boolean {
    const lastAssistant = [...this.messages]
      .reverse()
      .find((m) => m.role === "assistant");

    if (!lastAssistant) return false;

    const toolParts = lastAssistant.parts.filter(
      (p): p is ToolCallPart => p.type === "tool-call"
    );

    if (toolParts.length === 0) return false;

    // All tool calls must be in a terminal state
    return toolParts.every(
      (part) =>
        part.state === "approval-responded" ||
        (part.output !== undefined && !part.approval) // Has output and no approval needed
    );
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
