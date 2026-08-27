import { ChatClientEventEmitter } from './events'
import type {
  AIDevtoolsToolFixture,
  ChatDevtoolsBridge,
  ChatDevtoolsBridgeOptions,
  GenerationDevtoolsBridge,
  GenerationDevtoolsBridgeOptions,
  VideoDevtoolsBridge,
  VideoDevtoolsBridgeOptions,
} from './devtools'
import type { StreamChunk } from '@tanstack/ai/client'
import type {
  ChatClientEventContext,
  ChatClientRunEventContext,
} from './events'

export type ChatDevtoolsBridgeFactory = (
  options: ChatDevtoolsBridgeOptions,
) => ChatDevtoolsBridge

export type GenerationDevtoolsBridgeFactory = <TOutput>(
  options: GenerationDevtoolsBridgeOptions<TOutput>,
) => GenerationDevtoolsBridge<TOutput>

export type VideoDevtoolsBridgeFactory = <TOutput>(
  options: VideoDevtoolsBridgeOptions<TOutput>,
) => VideoDevtoolsBridge<TOutput>

class NoOpChatClientEventEmitter extends ChatClientEventEmitter {
  protected emitEvent(): void {
    // intentionally empty
  }
}

export class NoOpChatDevtoolsBridge {
  readonly events: ChatClientEventEmitter

  constructor(options: ChatDevtoolsBridgeOptions) {
    this.events = new NoOpChatClientEventEmitter(options.clientId)
  }

  // base bridge surface
  emitRegistered(): void {}
  emitUpdated(): void {}
  emitSnapshot(): void {}
  emitToolsRegistered(): void {}
  emitRunLifecycle(
    _eventType: unknown,
    _runId: string,
    _status: unknown,
    _options?: { error?: string },
  ): void {}
  deactivate(): void {}
  supersede(): void {}
  dispose(): void {}

  // chat-specific surface
  mountWithTools(_initialMessageCount: number): void {}
  notifyToolsChanged(): void {}
  setCurrentStreamId(_streamId: string | null): void {}
  recordStreamId(_streamId: string): void {}
  getCurrentStreamId(): string | null {
    return null
  }
  getLastStreamId(): string | null {
    return null
  }
  resolveStreamId(): string {
    return ''
  }
  observeChunk(_chunk: StreamChunk): void {}
  recordMemoryState(_value: unknown): void {}
  recordSkillsState(_value: unknown): void {}
  beginRun(_runId: string, _threadId: string): void {}
  getCurrentRunEventContext(): ChatClientRunEventContext | undefined {
    return undefined
  }
  getCurrentOrLastRunEventContext(): ChatClientRunEventContext | undefined {
    return undefined
  }
  findToolCallContext(toolCallId: string): ChatClientEventContext {
    return { toolCallId }
  }
  async applyFixture(_fixture: AIDevtoolsToolFixture): Promise<void> {
    // intentionally empty
  }
}

export class NoOpGenerationDevtoolsBridge<TOutput> {
  constructor(_options: GenerationDevtoolsBridgeOptions<TOutput>) {}

  // base bridge surface
  emitRegistered(): void {}
  emitUpdated(): void {}
  emitSnapshot(): void {}
  emitToolsRegistered(): void {}
  emitRunLifecycle(): void {}
  deactivate(): void {}
  supersede(): void {}
  dispose(): void {}

  // generation-specific surface
  beginRun(_input: unknown): string {
    return `noop-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  ensureRunStarted(_runId: string): void {}
  finishRun(
    _runId: string,
    _eventType: 'run:completed' | 'run:errored' | 'run:cancelled',
    _status: 'completed' | 'errored' | 'cancelled',
    _error?: string,
  ): void {}
  getActiveRunId(): string | null {
    return null
  }
  resetRuns(): void {}
  recordResultChange(): void {}
  recordLoadingChange(): void {}
  recordErrorChange(_error: Error | undefined): void {}
  recordStatusChange(): void {}
  recordProgressChange(): void {}
  emitState(): void {}
}

export class NoOpVideoDevtoolsBridge<
  TOutput,
> extends NoOpGenerationDevtoolsBridge<TOutput> {
  constructor(options: VideoDevtoolsBridgeOptions<TOutput>) {
    super(options)
  }

  recordJobIdChange(): void {}
  recordVideoStatusChange(): void {}
}

type AssertBridgeParity<TMissing extends never> = TMissing
type _ChatBridgeMissing = Exclude<
  keyof ChatDevtoolsBridge,
  keyof NoOpChatDevtoolsBridge
>
type _GenerationBridgeMissing = Exclude<
  keyof GenerationDevtoolsBridge<unknown>,
  keyof NoOpGenerationDevtoolsBridge<unknown>
>
type _VideoBridgeMissing = Exclude<
  keyof VideoDevtoolsBridge<unknown>,
  keyof NoOpVideoDevtoolsBridge<unknown>
>
const _bridgeParity:
  | [
      AssertBridgeParity<_ChatBridgeMissing>,
      AssertBridgeParity<_GenerationBridgeMissing>,
      AssertBridgeParity<_VideoBridgeMissing>,
    ]
  | undefined = undefined
void _bridgeParity

export const createNoOpChatDevtoolsBridge: ChatDevtoolsBridgeFactory = (
  options,
) =>
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- see comment above
  new NoOpChatDevtoolsBridge(options) as unknown as ChatDevtoolsBridge

export const createNoOpGenerationDevtoolsBridge: GenerationDevtoolsBridgeFactory =
  <TOutput>(options: GenerationDevtoolsBridgeOptions<TOutput>) =>
    // oxlint-disable-next-line eslint-js/no-restricted-syntax -- see comment above
    new NoOpGenerationDevtoolsBridge<TOutput>(
      options,
    ) as unknown as GenerationDevtoolsBridge<TOutput>

export const createNoOpVideoDevtoolsBridge: VideoDevtoolsBridgeFactory = <
  TOutput,
>(
  options: VideoDevtoolsBridgeOptions<TOutput>,
) =>
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- see comment above
  new NoOpVideoDevtoolsBridge<TOutput>(
    options,
  ) as unknown as VideoDevtoolsBridge<TOutput>
