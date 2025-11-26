import type {
  AIAdapter,
  ChatOptions,
  StreamChunk,
  ModelMessage,
  Tool,
  ToolCall,
  DoneStreamChunk,
  AgentLoopStrategy,
  ChatStreamOptionsUnion,
} from "../types";
import { aiEventClient } from "../event-client.js";
import {
  executeToolCalls,
  type ApprovalRequest,
  type ClientToolRequest,
  type ToolResult,
  ToolCallManager,
} from "../tools/tool-calls";
import { maxIterations as maxIterationsStrategy } from "../utilities/agent-loop-strategies";

function prependSystemPrompts(
  messages: ModelMessage[],
  systemPrompts?: string[],
  defaultPrompts: string[] = []
): ModelMessage[] {
  const prompts =
    systemPrompts && systemPrompts.length > 0 ? systemPrompts : defaultPrompts;

  if (!prompts || prompts.length === 0) {
    return messages;
  }

  const systemMessages = prompts.map((content) => ({
    role: "system" as const,
    content,
  }));

  return [...systemMessages, ...messages];
}

interface ChatEngineConfig<
  TAdapter extends AIAdapter<any, any, any, any>,
  TParams extends ChatOptions<any, any> = ChatOptions<any>
> {
  adapter: TAdapter;
  systemPrompts?: string[];
  params: TParams;
}

type ToolPhaseResult = "continue" | "stop" | "wait";
type CyclePhase = "processChat" | "executeToolCalls";

class ChatEngine<
  TAdapter extends AIAdapter<any, any, any, any>,
  TParams extends ChatOptions<any, any> = ChatOptions<any>
> {
  private readonly adapter: TAdapter;
  private readonly params: TParams;
  private readonly systemPrompts: string[];
  private readonly tools: ReadonlyArray<Tool>;
  private readonly loopStrategy: AgentLoopStrategy;
  private readonly toolCallManager: ToolCallManager;
  private readonly initialMessageCount: number;
  private readonly requestId: string;
  private readonly streamId: string;
  private readonly effectiveRequest?: Request | RequestInit;
  private readonly effectiveSignal?: AbortSignal;

  private messages: ModelMessage[];
  private iterationCount = 0;
  private lastFinishReason: string | null = null;
  private streamStartTime = 0;
  private totalChunkCount = 0;
  private currentMessageId: string | null = null;
  private accumulatedContent = "";
  private doneChunk: DoneStreamChunk | null = null;
  private shouldEmitStreamEnd = true;
  private earlyTermination = false;
  private toolPhase: ToolPhaseResult = "continue";
  private cyclePhase: CyclePhase = "processChat";

  constructor(config: ChatEngineConfig<TAdapter, TParams>) {
    this.adapter = config.adapter;
    this.params = config.params;
    this.systemPrompts = config.systemPrompts || [];
    this.tools = config.params.tools || [];
    this.loopStrategy =
      config.params.agentLoopStrategy || maxIterationsStrategy(5);
    this.toolCallManager = new ToolCallManager(this.tools);
    this.initialMessageCount = config.params.messages.length;
    this.messages = prependSystemPrompts(
      config.params.messages,
      config.params.systemPrompts,
      this.systemPrompts
    );
    this.requestId = this.createId("chat");
    this.streamId = this.createId("stream");
    this.effectiveRequest = config.params.abortController
      ? { signal: config.params.abortController.signal }
      : undefined;
    this.effectiveSignal = config.params.abortController?.signal;
  }

  async *chat(): AsyncGenerator<StreamChunk> {
    this.beforeChat();

    try {
      const pendingPhase = yield* this.checkForPendingToolCalls();
      if (pendingPhase === "wait") {
        return;
      }

      do {
        if (this.earlyTermination || this.isAborted()) {
          return;
        }

        this.beginCycle();

        if (this.cyclePhase === "processChat") {
          yield* this.streamModelResponse();
        } else {
          yield* this.processToolCalls();
        }

        this.endCycle();
      } while (this.shouldContinue());
    } finally {
      this.afterChat();
    }
  }

  private beforeChat(): void {
    this.streamStartTime = Date.now();
    const { model, tools, options, providerOptions } = this.params;

    aiEventClient.emit("chat:started", {
      requestId: this.requestId,
      model: model,
      messageCount: this.initialMessageCount,
      hasTools: !!tools && tools.length > 0,
      streaming: true,
      timestamp: Date.now(),
      toolNames: tools?.map((t) => t.function.name),
      options: options as Record<string, unknown> | undefined,
      providerOptions: providerOptions as Record<string, unknown> | undefined,
    });

    aiEventClient.emit("stream:started", {
      streamId: this.streamId,
      model,
      provider: this.adapter.name,
      timestamp: Date.now(),
    });
  }

  private afterChat(): void {
    if (!this.shouldEmitStreamEnd) {
      return;
    }

    aiEventClient.emit("stream:ended", {
      streamId: this.streamId,
      totalChunks: this.totalChunkCount,
      duration: Date.now() - this.streamStartTime,
      timestamp: Date.now(),
    });
  }

  private beginCycle(): void {
    if (this.cyclePhase === "processChat") {
      this.beginIteration();
    }
  }

  private endCycle(): void {
    if (this.cyclePhase === "processChat") {
      this.cyclePhase = "executeToolCalls";
      return;
    }

    this.cyclePhase = "processChat";
    this.iterationCount++;
  }

  private beginIteration(): void {
    this.currentMessageId = this.createId("msg");
    this.accumulatedContent = "";
    this.doneChunk = null;
  }

  private async *streamModelResponse(): AsyncGenerator<StreamChunk> {
    const adapterOptions = this.params.options || {};
    const providerOptions = this.params.providerOptions;
    const tools = this.params.tools;

    for await (const chunk of this.adapter.chatStream({
      model: this.params.model,
      messages: this.messages,
      tools,
      options: adapterOptions,
      request: this.effectiveRequest,
      providerOptions,
    })) {
      if (this.isAborted()) {
        break;
      }

      this.totalChunkCount++;

      yield chunk;
      this.handleStreamChunk(chunk);

      if (this.earlyTermination) {
        break;
      }
    }
  }

  private handleStreamChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case "content":
        this.handleContentChunk(chunk);
        break;
      case "tool_call":
        this.handleToolCallChunk(chunk);
        break;
      case "tool_result":
        this.handleToolResultChunk(chunk);
        break;
      case "done":
        this.handleDoneChunk(chunk);
        break;
      case "error":
        this.handleErrorChunk(chunk);
        break;
      case "thinking":
        this.handleThinkingChunk(chunk);
        break;
      default:
        break;
    }
  }

  private handleContentChunk(chunk: Extract<StreamChunk, { type: "content" }>) {
    this.accumulatedContent = chunk.content;
    aiEventClient.emit("stream:chunk:content", {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      content: chunk.content,
      delta: chunk.delta,
      timestamp: Date.now(),
    });
  }

  private handleToolCallChunk(
    chunk: Extract<StreamChunk, { type: "tool_call" }>
  ): void {
    this.toolCallManager.addToolCallChunk(chunk);
    aiEventClient.emit("stream:chunk:tool-call", {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      toolCallId: chunk.toolCall.id,
      toolName: chunk.toolCall.function.name,
      index: chunk.index,
      arguments: chunk.toolCall.function.arguments,
      timestamp: Date.now(),
    });
  }

  private handleToolResultChunk(
    chunk: Extract<StreamChunk, { type: "tool_result" }>
  ): void {
    aiEventClient.emit("stream:chunk:tool-result", {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      toolCallId: chunk.toolCallId,
      result: chunk.content,
      timestamp: Date.now(),
    });
  }

  private handleDoneChunk(chunk: DoneStreamChunk): void {
    // Don't overwrite a tool_calls finishReason with a stop finishReason
    // This can happen when adapters send multiple done chunks
    if (
      this.doneChunk?.finishReason === "tool_calls" &&
      chunk.finishReason === "stop"
    ) {
      // Still emit the event and update lastFinishReason, but don't overwrite doneChunk
      this.lastFinishReason = chunk.finishReason;
      aiEventClient.emit("stream:chunk:done", {
        streamId: this.streamId,
        messageId: this.currentMessageId || undefined,
        finishReason: chunk.finishReason,
        usage: chunk.usage,
        timestamp: Date.now(),
      });

      if (chunk.usage) {
        aiEventClient.emit("usage:tokens", {
          requestId: this.requestId,
          messageId: this.currentMessageId || undefined,
          model: this.params.model,
          usage: chunk.usage,
          timestamp: Date.now(),
        });
      }
      return;
    }

    this.doneChunk = chunk;
    this.lastFinishReason = chunk.finishReason;
    aiEventClient.emit("stream:chunk:done", {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      finishReason: chunk.finishReason,
      usage: chunk.usage,
      timestamp: Date.now(),
    });

    if (chunk.usage) {
      aiEventClient.emit("usage:tokens", {
        requestId: this.requestId,
        messageId: this.currentMessageId || undefined,
        model: this.params.model,
        usage: chunk.usage,
        timestamp: Date.now(),
      });
    }
  }

  private handleErrorChunk(
    chunk: Extract<StreamChunk, { type: "error" }>
  ): void {
    aiEventClient.emit("stream:chunk:error", {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      error: chunk.error.message,
      timestamp: Date.now(),
    });
    this.earlyTermination = true;
    this.shouldEmitStreamEnd = false;
  }

  private handleThinkingChunk(
    chunk: Extract<StreamChunk, { type: "thinking" }>
  ): void {
    aiEventClient.emit("stream:chunk:thinking", {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      content: chunk.content,
      delta: chunk.delta,
      timestamp: Date.now(),
    });
  }

  private async *checkForPendingToolCalls(): AsyncGenerator<
    StreamChunk,
    ToolPhaseResult,
    void
  > {
    const pendingToolCalls = this.getPendingToolCallsFromMessages();
    if (pendingToolCalls.length === 0) {
      return "continue";
    }

    const doneChunk = this.createSyntheticDoneChunk();

    aiEventClient.emit("chat:iteration", {
      requestId: this.requestId,
      iterationNumber: this.iterationCount + 1,
      messageCount: this.messages.length,
      toolCallCount: pendingToolCalls.length,
      timestamp: Date.now(),
    });

    const { approvals, clientToolResults } = this.collectClientState();

    const executionResult = await executeToolCalls(
      pendingToolCalls,
      this.tools,
      approvals,
      clientToolResults
    );

    if (
      executionResult.needsApproval.length > 0 ||
      executionResult.needsClientExecution.length > 0
    ) {
      for (const chunk of this.emitApprovalRequests(
        executionResult.needsApproval,
        doneChunk
      )) {
        yield chunk;
      }

      for (const chunk of this.emitClientToolInputs(
        executionResult.needsClientExecution,
        doneChunk
      )) {
        yield chunk;
      }

      this.shouldEmitStreamEnd = false;
      return "wait";
    }

    const toolResultChunks = this.emitToolResults(
      executionResult.results,
      doneChunk
    );

    for (const chunk of toolResultChunks) {
      yield chunk;
    }

    return "continue";
  }

  private async *processToolCalls(): AsyncGenerator<StreamChunk, void, void> {
    if (!this.shouldExecuteToolPhase()) {
      this.setToolPhase("stop");
      return;
    }

    const toolCalls = this.toolCallManager.getToolCalls();
    const doneChunk = this.doneChunk;

    if (!doneChunk || toolCalls.length === 0) {
      this.setToolPhase("stop");
      return;
    }

    aiEventClient.emit("chat:iteration", {
      requestId: this.requestId,
      iterationNumber: this.iterationCount + 1,
      messageCount: this.messages.length,
      toolCallCount: toolCalls.length,
      timestamp: Date.now(),
    });

    this.addAssistantToolCallMessage(toolCalls);

    const { approvals, clientToolResults } = this.collectClientState();

    const executionResult = await executeToolCalls(
      toolCalls,
      this.tools,
      approvals,
      clientToolResults
    );

    if (
      executionResult.needsApproval.length > 0 ||
      executionResult.needsClientExecution.length > 0
    ) {
      for (const chunk of this.emitApprovalRequests(
        executionResult.needsApproval,
        doneChunk
      )) {
        yield chunk;
      }

      for (const chunk of this.emitClientToolInputs(
        executionResult.needsClientExecution,
        doneChunk
      )) {
        yield chunk;
      }

      this.setToolPhase("wait");
      return;
    }

    const toolResultChunks = this.emitToolResults(
      executionResult.results,
      doneChunk
    );

    for (const chunk of toolResultChunks) {
      yield chunk;
    }

    this.toolCallManager.clear();

    this.setToolPhase("continue");
  }

  private shouldExecuteToolPhase(): boolean {
    return (
      this.doneChunk?.finishReason === "tool_calls" &&
      this.tools.length > 0 &&
      this.toolCallManager.hasToolCalls()
    );
  }

  private addAssistantToolCallMessage(toolCalls: ToolCall[]): void {
    this.messages = [
      ...this.messages,
      {
        role: "assistant",
        content: this.accumulatedContent || null,
        toolCalls,
      },
    ];
  }

  private collectClientState(): {
    approvals: Map<string, boolean>;
    clientToolResults: Map<string, any>;
  } {
    const approvals = new Map<string, boolean>();
    const clientToolResults = new Map<string, any>();

    for (const message of this.messages) {
      // todo remove any and fix this
      if (message.role === "assistant" && (message as any).parts) {
        const parts = (message as any).parts;
        for (const part of parts) {
          if (
            part.type === "tool-call" &&
            part.state === "approval-responded" &&
            part.approval
          ) {
            approvals.set(part.approval.id, part.approval.approved);
          }

          if (
            part.type === "tool-call" &&
            part.output !== undefined &&
            !part.approval
          ) {
            clientToolResults.set(part.id, part.output);
          }
        }
      }
    }

    return { approvals, clientToolResults };
  }

  private emitApprovalRequests(
    approvals: ApprovalRequest[],
    doneChunk: DoneStreamChunk
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    for (const approval of approvals) {
      aiEventClient.emit("stream:approval-requested", {
        streamId: this.streamId,
        messageId: this.currentMessageId || undefined,
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        input: approval.input,
        approvalId: approval.approvalId,
        timestamp: Date.now(),
      });

      chunks.push({
        type: "approval-requested",
        id: doneChunk.id,
        model: doneChunk.model,
        timestamp: Date.now(),
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        input: approval.input,
        approval: {
          id: approval.approvalId,
          needsApproval: true,
        },
      });
    }

    return chunks;
  }

  private emitClientToolInputs(
    clientRequests: ClientToolRequest[],
    doneChunk: DoneStreamChunk
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    for (const clientTool of clientRequests) {
      aiEventClient.emit("stream:tool-input-available", {
        streamId: this.streamId,
        toolCallId: clientTool.toolCallId,
        toolName: clientTool.toolName,
        input: clientTool.input,
        timestamp: Date.now(),
      });

      chunks.push({
        type: "tool-input-available",
        id: doneChunk.id,
        model: doneChunk.model,
        timestamp: Date.now(),
        toolCallId: clientTool.toolCallId,
        toolName: clientTool.toolName,
        input: clientTool.input,
      });
    }

    return chunks;
  }

  private emitToolResults(
    results: ToolResult[],
    doneChunk: DoneStreamChunk
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    for (const result of results) {
      aiEventClient.emit("tool:call-completed", {
        streamId: this.streamId,
        toolCallId: result.toolCallId,
        toolName: result.toolCallId,
        result: result.result,
        duration: 0,
        timestamp: Date.now(),
      });

      const content = JSON.stringify(result.result);
      const chunk: Extract<StreamChunk, { type: "tool_result" }> = {
        type: "tool_result",
        id: doneChunk.id,
        model: doneChunk.model,
        timestamp: Date.now(),
        toolCallId: result.toolCallId,
        content,
      };

      chunks.push(chunk);

      this.messages = [
        ...this.messages,
        {
          role: "tool",
          content,
          toolCallId: result.toolCallId,
        },
      ];
    }

    return chunks;
  }

  private getPendingToolCallsFromMessages(): ToolCall[] {
    const completedToolIds = new Set(
      this.messages
        .filter((message) => message.role === "tool" && message.toolCallId)
        .map((message) => message.toolCallId!) // toolCallId exists due to filter
    );

    const pending: ToolCall[] = [];

    for (const message of this.messages) {
      if (message.role === "assistant" && message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          if (!completedToolIds.has(toolCall.id)) {
            pending.push(toolCall);
          }
        }
      }
    }

    return pending;
  }

  private createSyntheticDoneChunk(): DoneStreamChunk {
    return {
      type: "done",
      id: this.createId("pending"),
      model: this.params.model,
      timestamp: Date.now(),
      finishReason: "tool_calls",
    };
  }

  private shouldContinue(): boolean {
    if (this.cyclePhase === "executeToolCalls") {
      return true;
    }

    return (
      this.loopStrategy({
        iterationCount: this.iterationCount,
        messages: this.messages,
        finishReason: this.lastFinishReason,
      }) && this.toolPhase === "continue"
    );
  }

  private isAborted(): boolean {
    return !!this.effectiveSignal?.aborted;
  }

  private setToolPhase(phase: ToolPhaseResult): void {
    this.toolPhase = phase;
    if (phase === "wait") {
      this.shouldEmitStreamEnd = false;
    }
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * Standalone chat streaming function with type inference from adapter
 * Returns an async iterable of StreamChunks for streaming responses
 * Includes automatic tool execution loop
 *
 * @param options Chat options
 * @param options.adapter - AI adapter instance to use
 * @param options.model - Model name (autocompletes based on adapter)
 * @param options.messages - Conversation messages
 * @param options.tools - Optional tools for function calling (auto-executed)
 * @param options.agentLoopStrategy - Optional strategy for controlling tool execution loop
 *
 * @example
 * ```typescript
 * const stream = chat({
 *   adapter: openai(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   tools: [weatherTool], // Optional: auto-executed when called
 * }); 
 *
 * for await (const chunk of stream) {
 *   if (chunk.type === 'content') {
 *     console.log(chunk.delta);
 *   }
 * }
 * ```
 */
export async function* chat<
  TAdapter extends AIAdapter<any, any, any, any, any>,
  const TModel extends TAdapter extends AIAdapter<
    infer Models,
    any,
    any,
    any,
    any
  >
  ? Models[number]
  : string
>(
  options: Omit<
    ChatStreamOptionsUnion<TAdapter>,
    "providerOptions" | "model"
  > & {
    adapter: TAdapter;
    model: TModel;
    providerOptions?: TAdapter extends AIAdapter<
      any,
      any,
      any,
      any,
      infer ModelProviderOptions
    >
    ? TModel extends keyof ModelProviderOptions
    ? ModelProviderOptions[TModel]
    : never
    : never;
  }
): AsyncIterable<StreamChunk> {
  const { adapter, ...chatOptions } = options;

  const engine = new ChatEngine({
    adapter,
    params: chatOptions as ChatOptions<
      string,
      Record<string, any>,
      undefined,
      Record<string, any>
    >,
  });

  for await (const chunk of engine.chat()) {
    yield chunk;
  }
}
