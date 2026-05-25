/**
 * No-op devtools bridge implementations + factories.
 *
 * The chat / generation / video clients depend on the *types* of the
 * real bridge classes (via `import type`) and accept a factory in
 * options. When no factory is supplied, the client falls back to the
 * no-op factories exported from this file, which never touch
 * `aiEventClient` or any of the heavy preview/fixture machinery in
 * `./devtools`.
 *
 * This keeps `./devtools` (the real implementations) outside the
 * dependency graph of the main entry — consumers who want functional
 * devtools must opt in by importing from `@tanstack/ai-client/devtools`
 * (see `package.json#exports`) and passing the resulting factory.
 */
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
import type { StreamChunk } from '@tanstack/ai'
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

// ===========================================================================
// No-op event emitter — extends the abstract base so it satisfies the type
// without dragging in any of the event-bus runtime cost.
// ===========================================================================

class NoOpChatClientEventEmitter extends ChatClientEventEmitter {
  protected emitEvent(): void {
    // intentionally empty
  }
}

// ===========================================================================
// No-op bridges. Methods exist to satisfy the structural shape of the real
// classes; every emit/record call short-circuits.
// ===========================================================================

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
  setCurrentStreamId(_streamId: string | null): void {}
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
    // Real factories supply a stable id; the no-op still returns a
    // unique value because the generation client passes this run id to
    // the adapter's RunAgentInputContext.
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
  recordStatusChange(_status: string): void {}
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

// ===========================================================================
// Factories — these are what the clients call when no real factory was
// supplied in options.
// ===========================================================================

export const createNoOpChatDevtoolsBridge: ChatDevtoolsBridgeFactory = (
  options,
) => {
  // Cast through `unknown`: the no-op class is structurally compatible
  // with the real class's public surface but does not extend it (so the
  // real class stays out of the main-entry import graph).
  // eslint-disable-next-line no-restricted-syntax -- no-op bridge is structurally compatible with the real bridge but intentionally does not extend it
  return new NoOpChatDevtoolsBridge(options) as unknown as ChatDevtoolsBridge
}

export const createNoOpGenerationDevtoolsBridge: GenerationDevtoolsBridgeFactory =
  <TOutput>(options: GenerationDevtoolsBridgeOptions<TOutput>) =>
    // eslint-disable-next-line no-restricted-syntax -- no-op bridge is structurally compatible with the real bridge but intentionally does not extend it
    new NoOpGenerationDevtoolsBridge<TOutput>(
      options,
    ) as unknown as GenerationDevtoolsBridge<TOutput>

export const createNoOpVideoDevtoolsBridge: VideoDevtoolsBridgeFactory = <
  TOutput,
>(
  options: VideoDevtoolsBridgeOptions<TOutput>,
) =>
  // eslint-disable-next-line no-restricted-syntax -- no-op bridge is structurally compatible with the real bridge but intentionally does not extend it
  new NoOpVideoDevtoolsBridge<TOutput>(
    options,
  ) as unknown as VideoDevtoolsBridge<TOutput>
