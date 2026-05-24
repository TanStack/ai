import {
  StreamProcessor,
  convertSchemaToJsonSchema,
  generateMessageId,
  normalizeToUIMessage,
} from '@tanstack/ai'
import { DefaultChatClientEventEmitter } from './events'
import { ClientDevtoolsBridge } from './devtools'
import { normalizeConnectionAdapter } from './connection-adapters'
import type {
  AnyClientTool,
  ContentPart,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import type {
  ConnectionAdapter,
  SubscribeConnectionAdapter,
} from './connection-adapters'
import type {
  ChatClientEventEmitter,
  ChatClientRunEventContext,
} from './events'
import type { AIDevtoolsChatSnapshot, AIDevtoolsToolFixture } from './devtools'
import type {
  ChatClientOptions,
  ChatClientState,
  ConnectionStatus,
  MessagePart,
  MultimodalContent,
  ToolCallPart,
  UIMessage,
} from './types'

export class ChatClient {
  private readonly processor: StreamProcessor
  private connection: SubscribeConnectionAdapter
  private readonly uniqueId: string
  private readonly threadId: string
  // Track the legacy `body` option and the canonical `forwardedProps`
  // option as separate slots so that `updateOptions({ forwardedProps })`
  // doesn't wipe a previously-set `body` (and vice versa). They are
  // merged on every send, with `forwardedProps` winning on key collision.
  private bodyOption: Record<string, any> = {}
  private forwardedPropsOption: Record<string, any> = {}
  private pendingMessageBody: Record<string, any> | undefined = undefined
  private isLoading = false
  private isSubscribed = false
  private error: Error | undefined = undefined
  private status: ChatClientState = 'ready'
  private connectionStatus: ConnectionStatus = 'disconnected'
  private abortController: AbortController | null = null
  private readonly events: ChatClientEventEmitter
  private readonly clientToolsRef: { current: Map<string, AnyClientTool> }
  private readonly devtoolsBridge: ClientDevtoolsBridge<AIDevtoolsChatSnapshot>
  private currentStreamId: string | null = null
  private currentMessageId: string | null = null
  private currentRunId: string | null = null
  private currentRunThreadId: string | null = null
  private lastStreamId: string | null = null
  private lastRunEventContext: ChatClientRunEventContext | undefined
  private readonly postStreamActions: Array<() => Promise<void>> = []
  // Track pending client tool executions to await them before stream finalization
  private readonly pendingToolExecutions: Map<string, Promise<void>> = new Map()
  // Flag to deduplicate continuation checks during action draining
  private continuationPending = false
  private subscriptionAbortController: AbortController | null = null
  private processingResolve: (() => void) | null = null
  private errorReportedGeneration: number | null = null
  private streamGeneration = 0
  // Tracks whether a queued checkForContinuation was skipped because
  // continuationPending was true (chained approval scenario)
  private continuationSkipped = false
  private draining = false
  private sessionGenerating = false
  private readonly activeRunIds = new Set<string>()
  private devtoolsMounted = false

  private readonly callbacksRef: {
    current: {
      onResponse: (response?: Response) => void | Promise<void>
      onChunk: (chunk: StreamChunk) => void
      onFinish: (message: UIMessage) => void
      onError: (error: Error) => void
      onMessagesChange: (messages: Array<UIMessage>) => void
      onLoadingChange: (isLoading: boolean) => void
      onErrorChange: (error: Error | undefined) => void
      onStatusChange: (status: ChatClientState) => void
      onSubscriptionChange: (isSubscribed: boolean) => void
      onConnectionStatusChange: (status: ConnectionStatus) => void
      onSessionGeneratingChange: (isGenerating: boolean) => void
      onCustomEvent: (
        eventType: string,
        data: unknown,
        context: { toolCallId?: string },
      ) => void
    }
  }

  constructor(options: ChatClientOptions) {
    this.uniqueId = options.id || this.generateUniqueId('chat')
    this.threadId = options.threadId || this.generateUniqueId('thread')
    // Both `body` (deprecated) and `forwardedProps` populate the AG-UI
    // `RunAgentInput.forwardedProps` wire field. They are stored
    // separately so `updateOptions` can replace one without touching the
    // other; the merge happens at send time, with `forwardedProps`
    // winning on key collision.
    this.bodyOption = options.body || {}
    this.forwardedPropsOption = options.forwardedProps || {}
    this.connection = normalizeConnectionAdapter(options.connection)
    this.events = new DefaultChatClientEventEmitter(this.uniqueId)

    // Build client tools map
    this.clientToolsRef = { current: new Map() }
    if (options.tools) {
      for (const tool of options.tools) {
        this.clientToolsRef.current.set(tool.name, tool)
      }
    }

    this.devtoolsBridge = new ClientDevtoolsBridge({
      hookId: this.uniqueId,
      clientId: this.uniqueId,
      threadId: this.threadId,
      metadata: {
        hookName: options.devtools?.hookName ?? 'useChat',
        outputKind: options.devtools?.outputKind ?? 'chat',
        ...(options.devtools?.framework
          ? { framework: options.devtools.framework }
          : {}),
      },
      getSnapshot: () => this.getDevtoolsSnapshot(),
      getTools: () => this.clientToolsRef.current.values(),
      applyToolFixture: (fixture) => {
        return this.applyToolFixture(fixture)
      },
    })

    this.callbacksRef = {
      current: {
        onResponse: options.onResponse || (() => {}),
        onChunk: options.onChunk || (() => {}),
        onFinish: options.onFinish || (() => {}),
        onError: options.onError || (() => {}),
        onMessagesChange: options.onMessagesChange || (() => {}),
        onLoadingChange: options.onLoadingChange || (() => {}),
        onErrorChange: options.onErrorChange || (() => {}),
        onStatusChange: options.onStatusChange || (() => {}),
        onSubscriptionChange: options.onSubscriptionChange || (() => {}),
        onConnectionStatusChange:
          options.onConnectionStatusChange || (() => {}),
        onSessionGeneratingChange:
          options.onSessionGeneratingChange || (() => {}),
        onCustomEvent: options.onCustomEvent || (() => {}),
      },
    }

    // Create StreamProcessor with event handlers.
    // Use conditional spreads so we don't pass `undefined` into
    // `StreamProcessorOptions` fields under `exactOptionalPropertyTypes`.
    this.processor = new StreamProcessor({
      ...(options.streamProcessor?.chunkStrategy
        ? { chunkStrategy: options.streamProcessor.chunkStrategy }
        : {}),
      ...(options.initialMessages
        ? { initialMessages: options.initialMessages }
        : {}),
      events: {
        onMessagesChange: (messages) => {
          this.callbacksRef.current.onMessagesChange(
            messages as Array<UIMessage>,
          )
        },
        onStreamStart: () => {
          this.setStatus('streaming')
          const assistantMessageId =
            this.processor.getCurrentAssistantMessageId()
          if (!assistantMessageId) {
            return
          }
          const messages = this.processor.getMessages() as Array<UIMessage>
          const assistantMessage = messages.find(
            (m) => m.id === assistantMessageId,
          )
          if (assistantMessage) {
            this.currentMessageId = assistantMessage.id
            this.events.messageAppended(
              assistantMessage,
              this.currentStreamId || undefined,
              this.getCurrentRunEventContext(),
            )
          }
        },
        onStreamEnd: (message) => {
          this.callbacksRef.current.onFinish(message as UIMessage)
          this.setStatus('ready')
          // Resolve the processing-complete promise so streamResponse can continue
          this.resolveProcessing()
        },
        onError: (error: Error) => {
          this.reportStreamError(error)
        },
        onTextUpdate: (messageId: string, content: string) => {
          // Emit text update to devtools
          if (this.currentStreamId) {
            this.events.textUpdated(
              this.currentStreamId,
              messageId,
              content,
              this.getCurrentRunEventContext(),
            )
          }
        },
        onThinkingUpdate: (messageId: string, content: string) => {
          // Emit thinking update to devtools
          if (this.currentStreamId) {
            this.events.thinkingUpdated(
              this.currentStreamId,
              messageId,
              content,
              undefined,
              this.getCurrentRunEventContext(),
            )
          }
        },
        onStructuredOutputChange: (args) => {
          const streamId =
            this.currentStreamId ??
            this.lastStreamId ??
            this.generateUniqueId('stream')
          const eventName =
            args.phase === 'start'
              ? 'structured-output:started'
              : args.phase === 'complete'
                ? 'structured-output:completed'
                : args.phase === 'error'
                  ? 'structured-output:errored'
                  : 'structured-output:updated'

          this.currentMessageId = args.messageId
          this.events.structuredOutputChanged(
            eventName,
            streamId,
            args.messageId,
            {
              status: args.status,
              raw: args.raw,
              ...(args.partial !== undefined ? { partial: args.partial } : {}),
              ...(args.data !== undefined ? { data: args.data } : {}),
              ...(args.reasoning !== undefined
                ? { reasoning: args.reasoning }
                : {}),
              ...(args.errorMessage !== undefined
                ? { errorMessage: args.errorMessage }
                : {}),
              ...(args.delta !== undefined ? { delta: args.delta } : {}),
            },
            this.getCurrentOrLastRunEventContext(),
          )
          this.emitDevtoolsSnapshot()
        },
        onToolCallStateChange: (
          messageId: string,
          toolCallId: string,
          state: string,
          args: string,
        ) => {
          // Get the tool name from the messages
          const messages = this.processor.getMessages() as Array<UIMessage>
          const message = messages.find((m) => m.id === messageId)
          const toolCallPart = message?.parts.find(
            (p: MessagePart): p is ToolCallPart =>
              p.type === 'tool-call' && p.id === toolCallId,
          )
          const toolName = toolCallPart?.name || 'unknown'

          // Emit tool call state change to devtools
          if (this.currentStreamId) {
            this.events.toolCallStateChanged(
              this.currentStreamId,
              messageId,
              toolCallId,
              toolName,
              state,
              args,
              this.getCurrentRunEventContext(),
            )
          }
        },
        onToolCall: (args: {
          toolCallId: string
          toolName: string
          input: any
        }) => {
          // Handle client-side tool execution automatically
          const clientTool = this.clientToolsRef.current.get(args.toolName)
          const executeFunc = clientTool?.execute
          if (executeFunc) {
            const runEventContext = this.getCurrentRunEventContext()
            // Create and track the execution promise
            const executionPromise = (async () => {
              try {
                const output = await executeFunc(args.input)
                await this.addToolResultInternal(
                  {
                    toolCallId: args.toolCallId,
                    tool: args.toolName,
                    output,
                    state: 'output-available',
                  },
                  runEventContext,
                )
              } catch (error: any) {
                await this.addToolResultInternal(
                  {
                    toolCallId: args.toolCallId,
                    tool: args.toolName,
                    output: null,
                    state: 'output-error',
                    errorText: error.message,
                  },
                  runEventContext,
                )
              } finally {
                // Remove from pending when complete
                this.pendingToolExecutions.delete(args.toolCallId)
              }
            })()

            // Track the pending execution
            this.pendingToolExecutions.set(args.toolCallId, executionPromise)
          }
        },
        onApprovalRequest: (args: {
          toolCallId: string
          toolName: string
          input: any
          approvalId: string
        }) => {
          const toolCallContext = this.findToolCallContext(args.toolCallId)
          const streamId =
            this.currentStreamId ??
            this.lastStreamId ??
            this.generateUniqueId('stream')

          this.events.approvalRequested(
            streamId,
            toolCallContext?.messageId ?? this.currentMessageId ?? '',
            args.toolCallId,
            args.toolName,
            args.input,
            args.approvalId,
            this.getCurrentOrLastRunEventContext(),
          )
          this.emitDevtoolsSnapshot()
        },
        onCustomEvent: (
          eventType: string,
          data: unknown,
          context: { toolCallId?: string },
        ) => {
          this.callbacksRef.current.onCustomEvent(eventType, data, context)
        },
      },
    })
  }

  mountDevtools(): void {
    if (this.devtoolsMounted) {
      return
    }

    this.devtoolsMounted = true
    this.events.clientCreated(this.processor.getMessages().length)
    this.devtoolsBridge.emitRegistered()
    this.devtoolsBridge.emitToolsRegistered()
    this.devtoolsBridge.emitSnapshot()
  }

  private generateUniqueId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }

  private setIsLoading(isLoading: boolean): void {
    this.isLoading = isLoading
    this.callbacksRef.current.onLoadingChange(isLoading)
    this.events.loadingChanged(isLoading)
    this.emitDevtoolsSnapshot()
  }

  private setStatus(status: ChatClientState): void {
    this.status = status
    this.callbacksRef.current.onStatusChange(status)
    this.emitDevtoolsSnapshot()
  }

  private setIsSubscribed(isSubscribed: boolean): void {
    this.isSubscribed = isSubscribed
    this.callbacksRef.current.onSubscriptionChange(isSubscribed)
    this.emitDevtoolsSnapshot()
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status
    this.callbacksRef.current.onConnectionStatusChange(status)
    this.emitDevtoolsSnapshot()
  }

  private setSessionGenerating(isGenerating: boolean): void {
    if (this.sessionGenerating === isGenerating) return
    this.sessionGenerating = isGenerating
    this.callbacksRef.current.onSessionGeneratingChange(isGenerating)
    this.emitDevtoolsSnapshot()
  }

  private resetSessionGenerating(): void {
    this.activeRunIds.clear()
    this.setSessionGenerating(false)
  }

  private setError(error: Error | undefined): void {
    this.error = error
    this.callbacksRef.current.onErrorChange(error)
    this.events.errorChanged(error?.message || null)
    this.emitDevtoolsSnapshot()
  }

  private getDevtoolsSnapshot(): AIDevtoolsChatSnapshot {
    return {
      messages: this.processor.getMessages() as Array<UIMessage>,
      status: this.status,
      isLoading: this.isLoading,
      isSubscribed: this.isSubscribed,
      connectionStatus: this.connectionStatus,
      sessionGenerating: this.sessionGenerating,
      activeRunIds: Array.from(this.activeRunIds),
      ...(this.error ? { error: this.error.message } : {}),
    }
  }

  private emitDevtoolsSnapshot(): void {
    this.devtoolsBridge.emitSnapshot()
  }

  private getCurrentRunEventContext(): ChatClientRunEventContext | undefined {
    if (!this.currentRunId) {
      return undefined
    }

    return {
      threadId: this.currentRunThreadId ?? this.threadId,
      runId: this.currentRunId,
    }
  }

  private getCurrentOrLastRunEventContext():
    | ChatClientRunEventContext
    | undefined {
    return this.getCurrentRunEventContext() ?? this.lastRunEventContext
  }

  private findToolCallContext(
    toolCallId: string,
  ): { messageId: string; part: ToolCallPart } | undefined {
    const messages = this.processor.getMessages() as Array<UIMessage>
    for (const message of messages) {
      const part = message.parts.find(
        (candidate): candidate is ToolCallPart =>
          candidate.type === 'tool-call' && candidate.id === toolCallId,
      )
      if (part) {
        return { messageId: message.id, part }
      }
    }
    return undefined
  }

  private prepareRunContextForChunk(chunk: StreamChunk): void {
    if (chunk.type !== 'RUN_STARTED') {
      return
    }

    this.currentRunId = chunk.runId
    this.currentRunThreadId =
      typeof chunk.threadId === 'string' ? chunk.threadId : this.threadId
    this.lastRunEventContext = {
      threadId: this.currentRunThreadId,
      runId: this.currentRunId,
    }
  }

  private clearRunContextAfterChunk(chunk: StreamChunk): void {
    if (chunk.type !== 'RUN_FINISHED' && chunk.type !== 'RUN_ERROR') {
      return
    }

    const runId =
      'runId' in chunk && typeof chunk.runId === 'string'
        ? chunk.runId
        : undefined

    if (!runId || runId === this.currentRunId) {
      this.currentRunId = null
      this.currentRunThreadId = null
    }
  }

  private async applyToolFixture(
    _fixture: AIDevtoolsToolFixture,
  ): Promise<void> {
    const fixture = _fixture
    const messages = this.processor.getMessages() as Array<UIMessage>
    const threadId = fixture.threadId ?? this.threadId
    if (fixture.execute) {
      await this.executeToolFixture(fixture, messages, threadId)
      return
    }

    const replay = this.createReplayMessageFromFixture(fixture, messages)
    const message = replay.message
    const toolCallId = replay.toolCallId
    const messageId = message.id

    this.events.messageAppended(message, undefined, {
      threadId,
      toolCallId,
      ...(fixture.runId ? { runId: fixture.runId } : {}),
    })

    this.processor.setMessages([...messages, message])
    this.events.toolFixtureApplied({
      hookId: this.uniqueId,
      threadId,
      ...(fixture.runId ? { runId: fixture.runId } : {}),
      toolName: fixture.toolName,
      input: fixture.input,
      output: fixture.output,
      messageId,
      toolCallId,
      ...(fixture.execute !== undefined ? { execute: fixture.execute } : {}),
      ...(fixture.message ? { message: fixture.message } : {}),
      ...(fixture.errorText ? { errorText: fixture.errorText } : {}),
    })
    this.emitDevtoolsSnapshot()
  }

  private async executeToolFixture(
    fixture: AIDevtoolsToolFixture,
    messages: Array<UIMessage>,
    threadId: string,
  ): Promise<void> {
    const toolCallId = this.resolveFixtureToolCallId(
      fixture.toolCallId,
      messages,
    )
    const messageId = this.resolveFixtureMessageId(fixture.messageId, messages)
    const message: UIMessage = {
      id: messageId,
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          id: toolCallId,
          name: fixture.toolName,
          arguments: this.stringifyFixtureValue(fixture.input),
          input: fixture.input,
          state: 'input-complete',
        },
      ],
      createdAt: new Date(),
    }

    this.events.messageAppended(message, undefined, {
      threadId,
      toolCallId,
      ...(fixture.runId ? { runId: fixture.runId } : {}),
    })
    this.processor.setMessages([...messages, message])
    this.emitDevtoolsSnapshot()

    const clientTool = this.clientToolsRef.current.get(fixture.toolName)
    const executeFunc = clientTool?.execute
    if (!executeFunc) {
      this.addToolResultForFixture({
        fixture,
        messageId,
        toolCallId,
        threadId,
        output: fixture.output,
        errorText: fixture.errorText,
      })
      return
    }

    try {
      const output = await executeFunc(fixture.input)
      this.addToolResultForFixture({
        fixture,
        messageId,
        toolCallId,
        threadId,
        output,
      })
    } catch (error) {
      this.addToolResultForFixture({
        fixture,
        messageId,
        toolCallId,
        threadId,
        output: null,
        errorText:
          error instanceof Error ? error.message : 'Tool execution failed.',
      })
    }
  }

  private addToolResultForFixture(options: {
    fixture: AIDevtoolsToolFixture
    messageId: string
    toolCallId: string
    threadId: string
    output: unknown
    errorText?: string
  }): void {
    const state = options.errorText ? 'output-error' : 'output-available'
    this.events.toolResultAdded(
      options.toolCallId,
      options.fixture.toolName,
      options.output,
      state,
      {
        threadId: options.threadId,
        ...(options.fixture.runId ? { runId: options.fixture.runId } : {}),
        toolCallId: options.toolCallId,
      },
    )
    this.processor.addToolResult(
      options.toolCallId,
      options.output,
      options.errorText,
    )
    this.events.toolFixtureApplied({
      hookId: this.uniqueId,
      threadId: options.threadId,
      ...(options.fixture.runId ? { runId: options.fixture.runId } : {}),
      toolName: options.fixture.toolName,
      input: options.fixture.input,
      output: options.output,
      execute: true,
      messageId: options.messageId,
      toolCallId: options.toolCallId,
      ...(options.errorText ? { errorText: options.errorText } : {}),
    })
    this.emitDevtoolsSnapshot()
  }

  private createReplayMessageFromFixture(
    fixture: AIDevtoolsToolFixture,
    messages: Array<UIMessage>,
  ): { message: UIMessage; toolCallId: string } {
    const clonedMessage = this.cloneFixtureSourceMessage(fixture, messages)
    if (clonedMessage) return clonedMessage

    const toolCallId = this.resolveFixtureToolCallId(
      fixture.toolCallId,
      messages,
    )
    const messageId = this.resolveFixtureMessageId(fixture.messageId, messages)
    const state = fixture.errorText ? 'error' : 'complete'

    return {
      toolCallId,
      message: {
        id: messageId,
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: toolCallId,
            name: fixture.toolName,
            arguments: this.stringifyFixtureValue(fixture.input),
            input: fixture.input,
            state: 'input-complete',
            output: fixture.output,
          },
          {
            type: 'tool-result',
            toolCallId,
            content: this.stringifyFixtureValue(fixture.output),
            state,
            ...(fixture.errorText ? { error: fixture.errorText } : {}),
          },
        ],
        createdAt: new Date(),
      },
    }
  }

  private cloneFixtureSourceMessage(
    fixture: AIDevtoolsToolFixture,
    messages: Array<UIMessage>,
  ): { message: UIMessage; toolCallId: string } | undefined {
    const sourceMessage = fixture.message
    if (!sourceMessage || !Array.isArray(sourceMessage.parts)) {
      return undefined
    }

    const toolCallIds = this.createFixtureToolCallIdMap(
      sourceMessage.parts,
      messages,
    )
    const parts = sourceMessage.parts
      .map((part) => this.cloneFixtureMessagePart(part, toolCallIds))
      .filter((part): part is MessagePart => Boolean(part))
    const mappedFixtureToolCallId = fixture.toolCallId
      ? toolCallIds.get(fixture.toolCallId)
      : undefined
    this.hydrateToolCallOutputs(parts, {
      ...(mappedFixtureToolCallId
        ? { mappedToolCallId: mappedFixtureToolCallId }
        : {}),
      output: fixture.output,
    })

    if (parts.length === 0) return undefined

    const toolCallId =
      (fixture.toolCallId ? toolCallIds.get(fixture.toolCallId) : undefined) ??
      this.firstToolCallId(parts)
    if (!toolCallId) return undefined

    return {
      toolCallId,
      message: {
        id: this.resolveFixtureMessageId(sourceMessage.id, messages),
        role: sourceMessage.role,
        parts,
        createdAt: new Date(),
      },
    }
  }

  private createFixtureToolCallIdMap(
    parts: Array<unknown>,
    messages: Array<UIMessage>,
  ): Map<string, string> {
    const ids = new Map<string, string>()
    for (const part of parts) {
      if (!isRecord(part) || part.type !== 'tool-call') continue
      if (typeof part.id !== 'string') continue
      ids.set(part.id, this.resolveFixtureToolCallId(part.id, messages))
    }
    return ids
  }

  private cloneFixtureMessagePart(
    part: unknown,
    toolCallIds: Map<string, string>,
  ): MessagePart | undefined {
    if (!isRecord(part) || typeof part.type !== 'string') return undefined
    const cloned: Record<string, unknown> = { ...part }

    if (part.type === 'tool-call' && typeof part.id === 'string') {
      cloned.id = toolCallIds.get(part.id) ?? part.id
    }

    if (part.type === 'tool-result' && typeof part.toolCallId === 'string') {
      cloned.toolCallId = toolCallIds.get(part.toolCallId) ?? part.toolCallId
    }

    return cloned as MessagePart
  }

  private firstToolCallId(parts: Array<MessagePart>): string | undefined {
    const toolCall = parts.find((part) => part.type === 'tool-call')
    return toolCall?.type === 'tool-call' ? toolCall.id : undefined
  }

  private hydrateToolCallOutputs(
    parts: Array<MessagePart>,
    fixtureOutput: {
      mappedToolCallId?: string
      output: unknown
    },
  ): void {
    for (const part of parts) {
      if (part.type !== 'tool-result') continue
      const toolCall = parts.find(
        (candidate): candidate is ToolCallPart =>
          candidate.type === 'tool-call' &&
          candidate.id === part.toolCallId &&
          candidate.output === undefined,
      )
      if (toolCall) {
        toolCall.output = this.parseFixtureResultContent(part.content)
      }
    }

    if (fixtureOutput.mappedToolCallId && fixtureOutput.output !== undefined) {
      const toolCall = parts.find(
        (candidate): candidate is ToolCallPart =>
          candidate.type === 'tool-call' &&
          candidate.id === fixtureOutput.mappedToolCallId &&
          candidate.output === undefined,
      )
      if (toolCall) {
        toolCall.output = fixtureOutput.output
      }
    }
  }

  private parseFixtureResultContent(content: string): unknown {
    try {
      return JSON.parse(content)
    } catch {
      return content
    }
  }

  private resolveFixtureMessageId(
    messageId: string | undefined,
    messages: Array<UIMessage>,
  ): string {
    if (messageId && !messages.some((message) => message.id === messageId)) {
      return messageId
    }
    return this.generateUniqueId('fixture-msg')
  }

  private resolveFixtureToolCallId(
    toolCallId: string | undefined,
    messages: Array<UIMessage>,
  ): string {
    if (toolCallId && !this.hasToolCallId(messages, toolCallId)) {
      return toolCallId
    }
    return this.generateUniqueId('fixture-tool-call')
  }

  private hasToolCallId(
    messages: Array<UIMessage>,
    toolCallId: string,
  ): boolean {
    return messages.some((message) =>
      message.parts.some((part) => {
        if (part.type === 'tool-call') {
          return part.id === toolCallId
        }
        if (part.type === 'tool-result') {
          return part.toolCallId === toolCallId
        }
        return false
      }),
    )
  }

  private stringifyFixtureValue(value: unknown): string {
    if (typeof value === 'string') {
      return value
    }
    if (
      value === undefined ||
      typeof value === 'function' ||
      typeof value === 'symbol'
    ) {
      return String(value)
    }

    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  private abortSubscriptionLoop(): void {
    this.subscriptionAbortController?.abort()
    this.subscriptionAbortController = null
  }

  private resolveProcessing(): void {
    this.processingResolve?.()
    this.processingResolve = null
  }

  private cancelInFlightStream(options?: {
    setReadyStatus?: boolean
    abortSubscription?: boolean
  }): void {
    this.abortController?.abort()
    this.abortController = null
    if (options?.abortSubscription) {
      this.abortSubscriptionLoop()
    }
    this.resolveProcessing()
    this.setIsLoading(false)
    if (options?.setReadyStatus) {
      this.setStatus('ready')
    }
  }

  private reportStreamError(error: Error): void {
    const alreadyReported =
      this.errorReportedGeneration === this.streamGeneration
    this.setError(error)
    // Preserve request-level error semantics even if a RUN_ERROR arrives
    // slightly after loading flips false during stream teardown.
    if (
      this.isLoading ||
      this.status === 'submitted' ||
      this.status === 'streaming'
    ) {
      this.setStatus('error')
    }
    if (!alreadyReported) {
      this.errorReportedGeneration = this.streamGeneration
      this.callbacksRef.current.onError(error)
    }
  }

  /**
   * Start the background subscription loop.
   */
  private startSubscription(): void {
    this.subscriptionAbortController = new AbortController()
    const signal = this.subscriptionAbortController.signal

    this.consumeSubscription(signal)
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          this.setConnectionStatus('error')
          this.resetSessionGenerating()
          this.setIsSubscribed(false)
          this.reportStreamError(err)
        }
        // Resolve pending processing so streamResponse doesn't hang
        this.resolveProcessing()
      })
      .finally(() => {
        // Ignore stale loops that were superseded by a restart.
        if (this.subscriptionAbortController?.signal !== signal) {
          return
        }
        this.subscriptionAbortController = null
        if (!signal.aborted && this.isSubscribed) {
          this.setIsSubscribed(false)
          if (this.connectionStatus !== 'error') {
            this.setConnectionStatus('disconnected')
          }
        }
      })
  }

  /**
   * Consume chunks from the connection subscription.
   */
  private async consumeSubscription(signal: AbortSignal): Promise<void> {
    const stream = this.connection.subscribe(signal)
    for await (const chunk of stream) {
      if (signal.aborted) break
      if (this.connectionStatus === 'connecting') {
        this.setConnectionStatus('connected')
      }
      this.callbacksRef.current.onChunk(chunk)
      if (chunk.type === 'RUN_STARTED') {
        this.activeRunIds.add(chunk.runId)
        this.setSessionGenerating(true)
      }
      this.prepareRunContextForChunk(chunk)
      this.processor.processChunk(chunk)
      // RUN_FINISHED / RUN_ERROR signal run completion — resolve processing
      // (redundant if onStreamEnd already resolved it, harmless)
      if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
        // RUN_FINISHED has runId in its schema; RUN_ERROR carries it via the
        // AG-UI passthrough so adapters can correlate per-run errors. Extract
        // both so a RUN_ERROR with a runId only clears that run, not every
        // active run in the session.
        const runId =
          chunk.type === 'RUN_FINISHED'
            ? chunk.runId
            : (chunk as { runId?: string }).runId
        if (runId) {
          this.activeRunIds.delete(runId)
        } else if (chunk.type === 'RUN_ERROR') {
          // RUN_ERROR without runId is a session-level error; clear all runs
          this.activeRunIds.clear()
        }
        this.setSessionGenerating(this.activeRunIds.size > 0)
        this.resolveProcessing()
      }
      this.clearRunContextAfterChunk(chunk)
      // Yield control back to event loop for UI updates
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  /**
   * Ensure subscription loop is running, starting it if needed.
   */
  private ensureSubscription(): void {
    if (!this.isSubscribed) {
      this.subscribe()
      return
    }
    if (
      !this.subscriptionAbortController ||
      this.subscriptionAbortController.signal.aborted
    ) {
      this.subscribe({ restart: true })
    }
  }

  /**
   * Create a promise that resolves when onStreamEnd fires.
   * Used by streamResponse to await processing completion.
   */
  private waitForProcessing(): Promise<void> {
    // Resolve any stale promise (e.g., from a previous aborted request)
    this.resolveProcessing()
    return new Promise<void>((resolve) => {
      this.processingResolve = resolve
    })
  }

  /**
   * Send a message and stream the response.
   * Supports both simple string content and multimodal content (images, audio, video, documents).
   *
   * @param content - The message content. Can be:
   *   - A simple string for text-only messages
   *   - A MultimodalContent object with content array and optional custom ID
   * @param body - Optional body parameters to merge with the client's base body for this request.
   *               Uses shallow merge with per-message body taking priority.
   *
   * @example
   * ```ts
   * // Simple text message
   * await client.sendMessage('Hello!')
   *
   * // Text message with custom body params
   * await client.sendMessage('Hello!', { temperature: 0.7 })
   *
   * // Multimodal message with image
   * await client.sendMessage({
   *   content: [
   *     { type: 'text', content: 'What is in this image?' },
   *     { type: 'image', source: { type: 'url', value: 'https://example.com/photo.jpg' } }
   *   ]
   * })
   *
   * // Multimodal message with custom ID and body params
   * await client.sendMessage(
   *   {
   *     content: [
   *       { type: 'text', content: 'Describe this audio' },
   *       { type: 'audio', source: { type: 'data', value: 'base64...' } }
   *     ],
   *     id: 'custom-message-id'
   *   },
   *   { model: 'gpt-4-audio' }
   * )
   * ```
   */
  async sendMessage(
    content: string | MultimodalContent,
    body?: Record<string, any>,
  ): Promise<void> {
    this.mountDevtools()
    const emptyMessage = typeof content === 'string' && !content.trim()
    if (emptyMessage || this.isLoading) {
      return
    }
    // Normalize input to extract content, id, and validate
    const normalizedContent = this.normalizeMessageInput(content)

    // Store the per-message body for use in streamResponse
    this.pendingMessageBody = body

    // Add user message via processor
    const userMessage = this.processor.addUserMessage(
      normalizedContent.content,
      normalizedContent.id,
    )
    this.events.messageSent(userMessage.id, normalizedContent.content)
    this.emitDevtoolsSnapshot()

    await this.streamResponse()
  }

  /**
   * Normalize the message input to extract content and optional id.
   * Trims string content automatically.
   */
  private normalizeMessageInput(input: string | MultimodalContent): {
    content: string | Array<ContentPart>
    id?: string
  } {
    if (typeof input === 'string') {
      return { content: input.trim() }
    }
    return { content: input.content, id: input.id }
  }

  /**
   * Append a message and stream the response
   */
  async append(message: UIMessage | ModelMessage): Promise<void> {
    this.mountDevtools()
    // Normalize the message to ensure it has id and createdAt
    const normalizedMessage = normalizeToUIMessage(message, generateMessageId)

    // Skip system messages - they're handled via systemPrompts, not UIMessages
    if (normalizedMessage.role === 'system') {
      return
    }

    // Type assertion: after checking for system, we know it's user or assistant
    const uiMessage = normalizedMessage as UIMessage

    // Emit message appended event
    this.events.messageAppended(uiMessage)

    // Add to messages
    const messages = this.processor.getMessages() as Array<UIMessage>
    this.processor.setMessages([...messages, uiMessage])
    this.emitDevtoolsSnapshot()

    // If stream is in progress, queue the response for after it ends
    if (this.isLoading) {
      this.queuePostStreamAction(async () => {
        await this.streamResponse()
      })
      return
    }

    await this.streamResponse()
  }

  /**
   * Stream a response from the LLM.
   * Returns true if the stream completed successfully, false on abort or error.
   */
  private async streamResponse(): Promise<boolean> {
    // Guard against concurrent streams - if already loading, skip
    if (this.isLoading) {
      return false
    }

    // Track generation so a superseded stream's cleanup doesn't clobber the new one
    const generation = ++this.streamGeneration

    this.setIsLoading(true)
    this.setStatus('submitted')
    this.setError(undefined)
    this.errorReportedGeneration = null
    this.abortController = new AbortController()
    // Capture the signal immediately so that a concurrent stop() or
    // sendMessage() that reassigns this.abortController cannot cause
    // connect() to receive a stale or null signal.
    const signal = this.abortController.signal
    // Reset pending tool executions for the new stream
    this.pendingToolExecutions.clear()
    let streamCompletedSuccessfully = false
    let activeDevtoolsRunId: string | null = null
    let runTerminalEventEmitted = false

    try {
      // Get UIMessages with parts (preserves approval state and client tool results)
      const messages = this.processor.getMessages() as Array<UIMessage>

      // Call onResponse callback
      await this.callbacksRef.current.onResponse()

      // If the stream was cancelled during the onResponse await (e.g. stop()
      // from a callback or unmount, or reload() superseding this stream),
      // bail out before allocating waitForProcessing() — otherwise the
      // resolveProcessing() that ran during cancellation is a no-op and the
      // await processingComplete below would deadlock.
      if (signal.aborted) {
        return false
      }

      // Merge sources for the wire `forwardedProps` field, in priority
      // order (later spreads win):
      //   1. Legacy `body` option (deprecated).
      //   2. Canonical `forwardedProps` option (wins over `body`).
      //   3. Per-message `body` arg passed to `sendMessage` (highest).
      // The AG-UI standard `threadId` is sent at the wire's top level for
      // run/conversation correlation, so we no longer auto-emit a separate
      // `conversationId` here — `chat({ threadId })` server-side covers the
      // same role for devtools/observability.
      const mergedBody = {
        ...this.bodyOption,
        ...this.forwardedPropsOption,
        ...this.pendingMessageBody,
      }

      // Clear the pending message body after use
      this.pendingMessageBody = undefined

      // Generate stream ID — assistant message will be created by stream events
      this.currentStreamId = this.generateUniqueId('stream')
      this.lastStreamId = this.currentStreamId
      this.currentMessageId = null

      // Reset processor stream state for new response — prevents stale
      // messageStates entries (from a previous stream) from blocking
      // creation of a new assistant message (e.g. after reload).
      this.processor.prepareAssistantMessage()

      // Ensure subscription loop is running
      this.ensureSubscription()

      // Set up promise that resolves when onStreamEnd fires
      const processingComplete = this.waitForProcessing()

      // Build per-send run context for AG-UI compliance
      // Note: mergedBody already contains the merged this.body + pendingMessageBody
      // (pendingMessageBody was cleared above, so we use mergedBody as forwardedProps)
      // Convert each client tool's `inputSchema` (a Standard Schema:
      // Zod, ArkType, Valibot, etc.) to JSON Schema for the wire. Foreign
      // AG-UI servers consuming `RunAgentInput.tools[].parameters` expect
      // JSON Schema; sending a Standard Schema instance directly would
      // serialize to an unusable shape.
      const runContext = {
        threadId: this.threadId,
        runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        clientTools: Array.from(this.clientToolsRef.current.values()).map(
          (t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema
              ? convertSchemaToJsonSchema(t.inputSchema)
              : { type: 'object' },
          }),
        ),
        forwardedProps: { ...mergedBody },
      }
      this.currentRunId = runContext.runId
      this.lastRunEventContext = {
        threadId: this.threadId,
        runId: runContext.runId,
      }
      activeDevtoolsRunId = runContext.runId
      this.devtoolsBridge.emitRunLifecycle(
        'run:created',
        runContext.runId,
        'created',
      )
      this.devtoolsBridge.emitRunLifecycle(
        'run:started',
        runContext.runId,
        'started',
      )
      this.emitDevtoolsSnapshot()

      // Send through normalized connection (pushes chunks to subscription queue)
      await this.connection.send(messages, mergedBody, signal, runContext)

      // Wait for subscription loop to finish processing all chunks
      await processingComplete

      // If this stream was superseded (e.g. by reload()), bail out —
      // the new stream owns the processor and processingResolve now.
      if (generation !== this.streamGeneration) {
        return false
      }

      // A RUN_ERROR from the stream transitions status to error.
      // Do not treat this stream as a successful completion.
      if (this.status === 'error') {
        if (activeDevtoolsRunId) {
          this.devtoolsBridge.emitRunLifecycle(
            'run:errored',
            activeDevtoolsRunId,
            'errored',
            this.error ? { error: this.error.message } : {},
          )
          runTerminalEventEmitted = true
        }
        return false
      }

      // Wait for pending client tool executions
      if (this.pendingToolExecutions.size > 0) {
        await Promise.all(this.pendingToolExecutions.values())
      }

      // Finalize (idempotent — may already be done by RUN_FINISHED handler)
      this.processor.finalizeStream()
      streamCompletedSuccessfully = true
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          if (activeDevtoolsRunId) {
            this.devtoolsBridge.emitRunLifecycle(
              'run:cancelled',
              activeDevtoolsRunId,
              'cancelled',
            )
            runTerminalEventEmitted = true
          }
          return false
        }
        if (generation === this.streamGeneration) {
          this.reportStreamError(err)
          if (activeDevtoolsRunId) {
            this.devtoolsBridge.emitRunLifecycle(
              'run:errored',
              activeDevtoolsRunId,
              'errored',
              { error: err.message },
            )
            runTerminalEventEmitted = true
          }
        }
      }
    } finally {
      // Only clean up if this is still the active stream.
      // A superseded stream (e.g. reload() started a new one) must not
      // clobber the new stream's abortController or isLoading state.
      if (generation === this.streamGeneration) {
        this.currentStreamId = null
        this.currentMessageId = null
        this.currentRunId = null
        this.currentRunThreadId = null
        this.abortController = null
        this.setIsLoading(false)
        this.pendingMessageBody = undefined // Ensure it's cleared even on error

        if (activeDevtoolsRunId && !runTerminalEventEmitted) {
          if (streamCompletedSuccessfully) {
            this.devtoolsBridge.emitRunLifecycle(
              'run:completed',
              activeDevtoolsRunId,
              'completed',
            )
          } else if (signal.aborted) {
            this.devtoolsBridge.emitRunLifecycle(
              'run:cancelled',
              activeDevtoolsRunId,
              'cancelled',
            )
          }
        }

        // Drain any actions that were queued while the stream was in progress
        await this.drainPostStreamActions()

        // Continue conversation if the stream ended with a tool result (server tool completed)
        // but ONLY if the model indicated it wants to continue (finishReason !== 'stop').
        // When finishReason is 'stop', the model is done — don't re-send.
        if (streamCompletedSuccessfully) {
          const messages = this.processor.getMessages() as Array<UIMessage>
          const lastPart = messages.at(-1)?.parts.at(-1)
          const { finishReason } = this.processor.getState()

          if (
            lastPart?.type === 'tool-result' &&
            finishReason !== 'stop' &&
            this.shouldAutoSend()
          ) {
            try {
              await this.checkForContinuation()
            } catch (error) {
              console.error('Failed to continue flow after tool result:', error)
            }
          }
        }
      }
    }

    return streamCompletedSuccessfully
  }

  /**
   * Start the client subscription loop.
   * This controls the connection lifecycle independently from request lifecycle.
   */
  subscribe(options?: { restart?: boolean }): void {
    const restart = options?.restart === true
    if (this.isSubscribed && !restart) {
      return
    }

    if (this.isSubscribed && restart) {
      this.abortSubscriptionLoop()
    }

    this.setIsSubscribed(true)
    this.setConnectionStatus('connecting')
    this.startSubscription()
  }

  /**
   * Unsubscribe and fully tear down live behavior.
   * This aborts an in-flight request and the subscription loop.
   */
  unsubscribe(): void {
    this.cancelInFlightStream({
      setReadyStatus: true,
      abortSubscription: true,
    })
    this.resetSessionGenerating()
    this.setIsSubscribed(false)
    this.setConnectionStatus('disconnected')
  }

  /**
   * Reload the last assistant message
   */
  async reload(): Promise<void> {
    const messages = this.processor.getMessages() as Array<UIMessage>
    if (messages.length === 0) return

    // Find the last user message
    const lastUserMessageIndex = messages.findLastIndex(
      (m) => m.role === 'user',
    )

    if (lastUserMessageIndex === -1) return

    // Cancel any active stream before reloading
    if (this.isLoading) {
      this.cancelInFlightStream()
    }

    this.events.reloaded(lastUserMessageIndex)

    // Remove all messages after the last user message
    this.processor.removeMessagesAfter(lastUserMessageIndex)
    this.emitDevtoolsSnapshot()

    // Resend
    await this.streamResponse()
  }

  /**
   * Stop the current stream
   */
  stop(): void {
    this.cancelInFlightStream({ setReadyStatus: true })
    this.events.stopped()
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.processor.clearMessages()
    this.setError(undefined)
    this.events.messagesCleared()
    this.emitDevtoolsSnapshot()
  }

  /**
   * Add the result of a client-side tool execution
   */
  async addToolResult(result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }): Promise<void> {
    await this.addToolResultInternal(result, this.getCurrentRunEventContext())
  }

  private async addToolResultInternal(
    result: {
      toolCallId: string
      tool: string
      output: any
      state?: 'output-available' | 'output-error'
      errorText?: string
    },
    context?: ChatClientRunEventContext,
  ): Promise<void> {
    this.events.toolResultAdded(
      result.toolCallId,
      result.tool,
      result.output,
      result.state || 'output-available',
      context,
    )

    // Add result via processor
    this.processor.addToolResult(
      result.toolCallId,
      result.output,
      result.errorText,
    )

    // If stream is in progress, queue continuation check for after it ends
    if (this.isLoading) {
      this.queuePostStreamAction(() => this.checkForContinuation())
      return
    }

    await this.checkForContinuation()
  }

  /**
   * Respond to a tool approval request
   */
  async addToolApprovalResponse(response: {
    id: string // approval.id, not toolCallId
    approved: boolean
  }): Promise<void> {
    // Find the tool call ID from the approval ID
    const messages = this.processor.getMessages() as Array<UIMessage>
    let foundToolCallId: string | undefined

    for (const msg of messages) {
      const toolCallPart = msg.parts.find(
        (p: MessagePart): p is ToolCallPart =>
          p.type === 'tool-call' && p.approval?.id === response.id,
      )
      if (toolCallPart) {
        foundToolCallId = toolCallPart.id
        break
      }
    }

    if (foundToolCallId) {
      this.events.toolApprovalResponded(
        response.id,
        foundToolCallId,
        response.approved,
        this.getCurrentOrLastRunEventContext(),
      )
    }

    // Add response via processor
    this.processor.addToolApprovalResponse(response.id, response.approved)
    this.emitDevtoolsSnapshot()

    // If stream is in progress, queue continuation check for after it ends
    if (this.isLoading) {
      this.queuePostStreamAction(() => this.checkForContinuation())
      return
    }

    await this.checkForContinuation()
  }

  /**
   * Queue an action to be executed after the current stream ends
   */
  private queuePostStreamAction(action: () => Promise<void>): void {
    this.postStreamActions.push(action)
  }

  /**
   * Drain and execute all queued post-stream actions
   */
  private async drainPostStreamActions(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      let action: (() => Promise<void>) | undefined
      while ((action = this.postStreamActions.shift()) !== undefined) {
        await action()
      }
    } finally {
      this.draining = false
    }
  }

  /**
   * Check if we should continue the flow and do so if needed
   */
  private async checkForContinuation(): Promise<void> {
    // Prevent duplicate continuation attempts
    if (this.continuationPending || this.isLoading) {
      this.continuationSkipped = true
      return
    }

    if (this.shouldAutoSend()) {
      this.continuationPending = true
      this.continuationSkipped = false
      let succeeded = false
      try {
        succeeded = await this.streamResponse()
      } finally {
        this.continuationPending = false
      }
      // If a queued check was skipped while continuationPending was true
      // (e.g. a chained approval responded to during the stream), re-evaluate
      // now that the flag is cleared. Only replay after a successful stream —
      // aborted or errored streams should not trigger further continuation.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- mutated asynchronously during await
      if (this.continuationSkipped && succeeded) {
        this.continuationSkipped = false
        await this.checkForContinuation()
      }
    }
  }

  /**
   * Check if all tool calls are complete and we should auto-send.
   * Requires that there is at least one tool call in the last assistant message;
   * a text-only response has nothing to auto-send.
   */
  private shouldAutoSend(): boolean {
    const messages = this.processor.getMessages() as Array<UIMessage>
    const lastAssistant = messages.findLast((m) => m.role === 'assistant')
    if (!lastAssistant) return false
    const hasToolCalls = lastAssistant.parts.some((p) => p.type === 'tool-call')
    if (!hasToolCalls) return false
    return this.processor.areAllToolsComplete()
  }

  /**
   * Get current messages
   */
  getMessages(): Array<UIMessage> {
    return this.processor.getMessages() as Array<UIMessage>
  }

  /**
   * Get loading state
   */
  getIsLoading(): boolean {
    return this.isLoading
  }

  /**
   * Get current status
   */
  getStatus(): ChatClientState {
    return this.status
  }

  /**
   * Get whether the subscription loop is active
   */
  getIsSubscribed(): boolean {
    return this.isSubscribed
  }

  /**
   * Get current connection lifecycle status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus
  }

  /**
   * Whether the shared session is actively generating.
   * Derived from stream run events (RUN_STARTED / RUN_FINISHED / RUN_ERROR).
   * Unlike `isLoading` (request-local), this reflects shared generation
   * activity visible to all subscribers (e.g. across tabs/devices).
   */
  getSessionGenerating(): boolean {
    return this.sessionGenerating
  }

  /**
   * Get current error
   */
  getError(): Error | undefined {
    return this.error
  }

  /**
   * Manually set messages
   */
  setMessagesManually(messages: Array<UIMessage>): void {
    this.processor.setMessages(messages)
    this.emitDevtoolsSnapshot()
  }

  /**
   * Update options refs (for use in React hooks to avoid recreating client)
   */
  updateOptions(options: {
    connection?: ConnectionAdapter
    /** @deprecated Use `forwardedProps` instead. */
    body?: Record<string, any>
    forwardedProps?: Record<string, any>
    tools?: ReadonlyArray<AnyClientTool>
    onResponse?: (response?: Response) => void | Promise<void>
    onChunk?: (chunk: StreamChunk) => void
    onFinish?: (message: UIMessage) => void
    onError?: (error: Error) => void
    onSubscriptionChange?: (isSubscribed: boolean) => void
    onConnectionStatusChange?: (status: ConnectionStatus) => void
    onSessionGeneratingChange?: (isGenerating: boolean) => void
    onCustomEvent?: (
      eventType: string,
      data: unknown,
      context: { toolCallId?: string },
    ) => void
  }): void {
    if (options.connection !== undefined) {
      const wasSubscribed = this.isSubscribed

      if (this.isLoading) {
        this.cancelInFlightStream({
          setReadyStatus: true,
          abortSubscription: true,
        })
      } else if (wasSubscribed) {
        this.abortSubscriptionLoop()
      }

      this.resetSessionGenerating()
      this.setIsSubscribed(false)
      this.setConnectionStatus('disconnected')
      this.connection = normalizeConnectionAdapter(options.connection)

      if (wasSubscribed) {
        this.subscribe()
      }
    }
    // Replace each slot independently so callers can update one without
    // wiping the other. (Passing `undefined` for either field is a "leave
    // unchanged" signal - to clear a slot, pass an empty object `{}`.)
    if (options.body !== undefined) {
      this.bodyOption = options.body
    }
    if (options.forwardedProps !== undefined) {
      this.forwardedPropsOption = options.forwardedProps
    }
    if (options.tools !== undefined) {
      this.clientToolsRef.current = new Map()
      for (const tool of options.tools) {
        this.clientToolsRef.current.set(tool.name, tool)
      }
      this.devtoolsBridge.emitToolsRegistered()
      this.emitDevtoolsSnapshot()
    }
    if (options.onResponse !== undefined) {
      this.callbacksRef.current.onResponse = options.onResponse
    }
    if (options.onChunk !== undefined) {
      this.callbacksRef.current.onChunk = options.onChunk
    }
    if (options.onFinish !== undefined) {
      this.callbacksRef.current.onFinish = options.onFinish
    }
    if (options.onError !== undefined) {
      this.callbacksRef.current.onError = options.onError
    }
    if (options.onSubscriptionChange !== undefined) {
      this.callbacksRef.current.onSubscriptionChange =
        options.onSubscriptionChange
    }
    if (options.onConnectionStatusChange !== undefined) {
      this.callbacksRef.current.onConnectionStatusChange =
        options.onConnectionStatusChange
    }
    if (options.onSessionGeneratingChange !== undefined) {
      this.callbacksRef.current.onSessionGeneratingChange =
        options.onSessionGeneratingChange
    }
    if (options.onCustomEvent !== undefined) {
      this.callbacksRef.current.onCustomEvent = options.onCustomEvent
    }
  }

  dispose(): void {
    this.unsubscribe()
    this.devtoolsBridge.dispose()
    this.devtoolsMounted = false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
