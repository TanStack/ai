import type { ModelMessage } from "@tanstack/ai";
import type { UIMessage, ToolCallPart, ChatClientOptions } from "./types";
import type { ConnectionAdapter } from "./connection-adapters";
import { StreamProcessor } from "./stream/processor";
import type { ChunkStrategy, StreamParser } from "./stream/types";
import {
  uiMessageToModelMessages,
  normalizeToUIMessage,
} from "./message-converters";
import {
  updateTextPart,
  updateToolCallPart,
  updateToolResultPart,
  updateToolCallApproval,
  updateToolCallState,
  updateToolCallWithOutput,
  updateToolCallApprovalResponse,
} from "./message-updaters";
import {
  ChatClientEventEmitter,
  DefaultChatClientEventEmitter,
} from "./events";

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
  private abortController: AbortController | null = null;
  private events: ChatClientEventEmitter;

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
    this.uniqueId = options.id || this.generateUniqueId("chat");
    this.messages = options.initialMessages || [];
    this.body = options.body;
    this.connection = options.connection;
    this.streamProcessorConfig = options.streamProcessor || {};
    this.events = new DefaultChatClientEventEmitter(this.uniqueId);

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

    this.events.clientCreated(this.messages.length);
  }

  private generateUniqueId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private generateMessageId(): string {
    return this.generateUniqueId(this.uniqueId);
  }

  private setMessages(messages: UIMessage[]): void {
    this.messages = messages;
    this.callbacks.onMessagesChange(messages);
  }

  private setIsLoading(isLoading: boolean): void {
    this.isLoading = isLoading;
    this.callbacks.onLoadingChange(isLoading);
    this.events.loadingChanged(isLoading);
  }

  private setError(error: Error | undefined): void {
    this.error = error;
    this.callbacks.onErrorChange(error);
    this.events.errorChanged(error?.message || null);
  }

  private async processStream(source: AsyncIterable<any>): Promise<UIMessage> {
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
    const streamId = this.generateUniqueId("stream");

    const processor = new StreamProcessor({
      chunkStrategy: this.streamProcessorConfig?.chunkStrategy,
      parser: this.streamProcessorConfig?.parser,
      handlers: {
        onTextUpdate: (content) => {
          this.events.textUpdated(streamId, assistantMessageId, content);
          this.setMessages(
            updateTextPart(this.messages, assistantMessageId, content)
          );
        },
        onToolCallStateChange: (_index, id, name, state, args) => {
          this.events.toolCallStateChanged(
            streamId,
            assistantMessageId,
            id,
            name,
            state,
            args
          );

          // Update or create tool call part with state
          this.setMessages(
            updateToolCallPart(this.messages, assistantMessageId, {
              id,
              name,
              arguments: args,
              state,
            })
          );
        },
        onToolResultStateChange: (toolCallId, content, state, error) => {
          this.events.toolResultStateChanged(
            streamId,
            toolCallId,
            content,
            state,
            error
          );

          // Update or create tool result part
          this.setMessages(
            updateToolResultPart(
              this.messages,
              assistantMessageId,
              toolCallId,
              content,
              state,
              error
            )
          );
        },
        onApprovalRequested: async (
          toolCallId,
          toolName,
          input,
          approvalId
        ) => {
          this.events.approvalRequested(
            assistantMessageId,
            toolCallId,
            toolName,
            input,
            approvalId
          );

          // Update tool call part to show it needs approval
          this.setMessages(
            updateToolCallApproval(
              this.messages,
              assistantMessageId,
              toolCallId,
              approvalId
            )
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
              updateToolCallState(
                this.messages,
                assistantMessageId,
                toolCallId,
                "input-complete"
              )
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

    const finalMessage = this.messages.find(
      (msg) => msg.id === assistantMessageId
    );

    return (
      finalMessage || {
        id: assistantMessageId,
        role: "assistant",
        parts: [],
        createdAt: new Date(),
      }
    );
  }

  async append(message: UIMessage | ModelMessage): Promise<void> {
    // Normalize message to UIMessage with guaranteed id and createdAt
    const uiMessage = normalizeToUIMessage(message, () =>
      this.generateMessageId()
    );

    // Emit message appended event
    this.events.messageAppended(uiMessage);

    // Add message immediately
    this.setMessages([...this.messages, uiMessage]);
    this.setIsLoading(true);
    this.setError(undefined);

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      // Convert UIMessages to ModelMessages for connection adapter
      const modelMessages: ModelMessage[] = [];
      for (const msg of this.messages) {
        modelMessages.push(...uiMessageToModelMessages(msg));
      }

      // Call onResponse callback (no Response object for non-fetch adapters)
      await this.callbacks.onResponse();

      // Connect and get stream from connection adapter, passing abort signal
      const stream = this.connection.connect(
        modelMessages,
        this.body,
        this.abortController.signal
      );

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
      this.abortController = null;
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

    this.events.messageSent(userMessage.id, content.trim());

    await this.append(userMessage);
  }

  async reload(): Promise<void> {
    if (this.messages.length === 0) return;

    // Find the last user message
    const lastUserMessageIndex = this.messages.findLastIndex(
      (m: UIMessage) => m.role === "user"
    );

    if (lastUserMessageIndex === -1) return;

    this.events.reloaded(lastUserMessageIndex);

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
    }
    this.setIsLoading(false);
    this.events.stopped();
  }

  clear(): void {
    this.setMessages([]);
    this.setError(undefined);
    this.events.messagesCleared();
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
    this.events.toolResultAdded(
      result.toolCallId,
      result.tool,
      result.output,
      result.state || "output-available"
    );

    // Update the tool call part with the output
    this.setMessages(
      updateToolCallWithOutput(
        this.messages,
        result.toolCallId,
        result.output,
        result.state === "output-error" ? "input-complete" : undefined,
        result.errorText
      )
    );

    // Check if we should auto-send
    if (this.shouldAutoSend()) {
      // Continue the flow without adding a new message
      await this.continueFlow();
    }
  }

  /**
   * Find the tool call ID for a given approval ID
   */
  private findToolCallIdByApprovalId(approvalId: string): string | undefined {
    for (const msg of this.messages) {
      const toolCallPart = msg.parts.find(
        (p): p is ToolCallPart =>
          p.type === "tool-call" && p.approval?.id === approvalId
      ) as ToolCallPart | undefined;

      if (toolCallPart) {
        return toolCallPart.id;
      }
    }
    return undefined;
  }

  /**
   * Respond to a tool approval request
   */
  async addToolApprovalResponse(response: {
    id: string; // approval.id, not toolCallId
    approved: boolean;
  }): Promise<void> {
    const foundToolCallId = this.findToolCallIdByApprovalId(response.id);

    if (foundToolCallId) {
      this.events.toolApprovalResponded(
        response.id,
        foundToolCallId,
        response.approved
      );
    }

    // Find and update the tool call part with approval decision
    this.setMessages(
      updateToolCallApprovalResponse(
        this.messages,
        response.id,
        response.approved
      )
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

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      this.setIsLoading(true);
      this.setError(undefined);

      // Convert UIMessages to ModelMessages for connection adapter
      const modelMessages: ModelMessage[] = [];
      for (const msg of this.messages) {
        modelMessages.push(...uiMessageToModelMessages(msg));
      }

      // Process the current conversation state, passing abort signal
      await this.processStream(
        this.connection.connect(
          modelMessages,
          this.body,
          this.abortController.signal
        )
      );
    } catch (err: any) {
      if (err instanceof Error && err.name === "AbortError") {
        // Request was aborted, ignore
        return;
      }
      this.setError(err);
      this.callbacks.onError(err);
    } finally {
      this.abortController = null;
      this.setIsLoading(false);
    }
  }

  /**
   * Check if all tool calls are complete and we should auto-send
   */
  private shouldAutoSend(): boolean {
    const lastAssistant = this.messages.findLast(
      (m: UIMessage) => m.role === "assistant"
    );

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
