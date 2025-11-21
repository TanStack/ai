import type {
  AIAdapter,
  ChatCompletionOptions,
  StreamChunk,
  ModelMessage,
  Tool,
  ToolCall,
  DoneStreamChunk,
  AgentLoopStrategy,
} from "./types";
import type { AIEventEmitter } from "./events.js";
import {
  executeToolCalls,
  type ApprovalRequest,
  type ClientToolRequest,
  type ToolResult,
} from "./agent/executor";
import { ToolCallManager } from "./tool-call-manager";
import { maxIterations as maxIterationsStrategy } from "./agent-loop-strategies";
import { prependSystemPrompts } from "./utils";

interface ChatEngineConfig<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>,
  TParams extends ChatCompletionOptions<any, any> = ChatCompletionOptions<any>
> {
  adapter: TAdapter;
  events: AIEventEmitter;
  systemPrompts?: string[];
  params: TParams;
}

type ToolPhaseResult = "continue" | "stop" | "wait";
type CyclePhase = "processChat" | "executeToolCalls";

export class ChatEngine<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>,
  TParams extends ChatCompletionOptions<any, any> = ChatCompletionOptions<any>
> {
  private readonly adapter: TAdapter;
  private readonly events: AIEventEmitter;
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
    this.events = config.events;
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
    const { model, tools } = this.params;

    this.events.chatStarted({
      requestId: this.requestId,
      model: model as string,
      messageCount: this.initialMessageCount,
      hasTools: !!tools && tools.length > 0,
      streaming: true,
    });

    this.events.streamStarted({
      streamId: this.streamId,
      model,
      provider: this.adapter.name,
    });
  }

  private afterChat(): void {
    if (!this.shouldEmitStreamEnd) {
      return;
    }

    this.events.streamEnded({
      streamId: this.streamId,
      totalChunks: this.totalChunkCount,
      duration: Date.now() - this.streamStartTime,
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
    const providerOptions = this.params.providerOptions as any;
    const tools = this.params.tools as Tool[] | undefined;

    for await (const chunk of this.adapter.chatStream({
      model: this.params.model as string,
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
      default:
        break;
    }
  }

  private handleContentChunk(chunk: Extract<StreamChunk, { type: "content" }>) {
    this.accumulatedContent = chunk.content;
    this.events.streamChunkContent({
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      content: chunk.content,
      delta: chunk.delta,
    });
  }

  private handleToolCallChunk(
    chunk: Extract<StreamChunk, { type: "tool_call" }>
  ): void {
    this.toolCallManager.addToolCallChunk(chunk);
    this.events.streamChunkToolCall({
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      toolCallId: chunk.toolCall.id,
      toolName: chunk.toolCall.function.name,
      index: chunk.index,
      arguments: chunk.toolCall.function.arguments,
    });
  }

  private handleToolResultChunk(
    chunk: Extract<StreamChunk, { type: "tool_result" }>
  ): void {
    this.events.streamChunkToolResult({
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      toolCallId: chunk.toolCallId,
      result: chunk.content,
    });
  }

  private handleDoneChunk(chunk: DoneStreamChunk): void {
    // Don't overwrite a tool_calls finishReason with a stop finishReason
    // This can happen when adapters send multiple done chunks
    if (this.doneChunk?.finishReason === "tool_calls" && chunk.finishReason === "stop") {
      // Still emit the event and update lastFinishReason, but don't overwrite doneChunk
      this.lastFinishReason = chunk.finishReason;
      this.events.streamChunkDone({
        streamId: this.streamId,
        messageId: this.currentMessageId || undefined,
        finishReason: chunk.finishReason,
        usage: chunk.usage,
      });
      return;
    }

    this.doneChunk = chunk;
    this.lastFinishReason = chunk.finishReason;
    this.events.streamChunkDone({
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      finishReason: chunk.finishReason,
      usage: chunk.usage,
    });
  }

  private handleErrorChunk(
    chunk: Extract<StreamChunk, { type: "error" }>
  ): void {
    this.events.streamChunkError({
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      error: chunk.error.message,
    });
    this.earlyTermination = true;
    this.shouldEmitStreamEnd = false;
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

    this.events.chatIteration({
      requestId: this.requestId,
      iterationNumber: this.iterationCount + 1,
      messageCount: this.messages.length,
      toolCallCount: pendingToolCalls.length,
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

    this.events.chatIteration({
      requestId: this.requestId,
      iterationNumber: this.iterationCount + 1,
      messageCount: this.messages.length,
      toolCallCount: toolCalls.length,
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
      this.events.streamApprovalRequested({
        streamId: this.streamId,
        messageId: this.currentMessageId || undefined,
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        input: approval.input,
        approvalId: approval.approvalId,
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
      this.events.streamToolInputAvailable({
        streamId: this.streamId,
        toolCallId: clientTool.toolCallId,
        toolName: clientTool.toolName,
        input: clientTool.input,
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
      this.events.toolCallCompleted({
        streamId: this.streamId,
        toolCallId: result.toolCallId,
        toolName: result.toolCallId,
        result: result.result,
        duration: 0,
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
      model: this.params.model as string,
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
