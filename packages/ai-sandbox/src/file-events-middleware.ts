/**
 * `withSandboxFileEvents()` — surface sandbox file create/change/delete events
 * into the `chat()` stream as CUSTOM AG-UI events, so any UI consuming the
 * stream sees the agent's edits live without wiring its own watcher.
 *
 * It REQUIRES the {@link SandboxCapability} that `withSandbox` provides: in
 * `setup` it starts a {@link watchWorkspace} watcher on the provided handle and
 * buffers events; in `onChunk` it drains the buffer and interleaves the events
 * with the agent's output (chunk expansion). The watcher is stopped on the
 * terminal hook.
 *
 * The trailing `RUN_FINISHED` chunk flushes any final buffered events. Events
 * that arrive after the stream has ended are dropped (the run is over).
 */
import { EventType, defineChatMiddleware } from '@tanstack/ai'
import { SandboxCapability, getSandbox } from './capabilities'
import { watchWorkspace } from './watch'
import type {
  ChatMiddlewareContext,
  DefinedChatMiddleware,
  StreamChunk,
} from '@tanstack/ai'
import type { FileEvent, SandboxWatchHandle } from './watch'

/** CUSTOM event name emitted for each sandbox file event. */
export const SANDBOX_FILE_EVENT = 'sandbox.file'

export interface SandboxFileEventsOptions {
  /** CUSTOM event name. Defaults to `'sandbox.file'`. */
  eventName?: string
  /** Workspace root to watch. Defaults to `/workspace`. */
  root?: string
  /** Poll interval (exec-poll providers), in ms. */
  intervalMs?: number
  /** Directory-name fragments to ignore. Defaults to `['.git', 'node_modules']`. */
  ignore?: Array<string>
}

interface RunState {
  queue: Array<FileEvent>
  watcher: SandboxWatchHandle
}

export function withSandboxFileEvents(
  options: SandboxFileEventsOptions = {},
): DefinedChatMiddleware<
  unknown,
  readonly [typeof SandboxCapability],
  readonly []
> {
  const eventName = options.eventName ?? SANDBOX_FILE_EVENT
  const runState = new WeakMap<object, RunState>()

  const toCustom = (
    ctx: ChatMiddlewareContext,
    event: FileEvent,
  ): StreamChunk => ({
    type: EventType.CUSTOM,
    name: eventName,
    value: { ...event },
    timestamp: event.timestamp,
    threadId: ctx.threadId,
    runId: ctx.runId,
  })

  const stop = async (ctx: ChatMiddlewareContext): Promise<void> => {
    const state = runState.get(ctx)
    if (!state) return
    runState.delete(ctx)
    await state.watcher.stop()
  }

  return defineChatMiddleware({
    name: 'sandbox-file-events',
    requires: [SandboxCapability] as const,

    async setup(ctx) {
      const handle = getSandbox(ctx)
      const queue: Array<FileEvent> = []
      const watcher = await watchWorkspace(handle, {
        onEvent: (event) => {
          queue.push(event)
        },
        ...(options.root !== undefined && { root: options.root }),
        ...(options.intervalMs !== undefined && {
          intervalMs: options.intervalMs,
        }),
        ...(options.ignore !== undefined && { ignore: options.ignore }),
        ...(ctx.signal !== undefined && { signal: ctx.signal }),
      })
      runState.set(ctx, { queue, watcher })
    },

    onChunk(ctx, chunk) {
      const state = runState.get(ctx)
      if (!state || state.queue.length === 0) return
      const drained = state.queue.splice(0, state.queue.length)
      return [chunk, ...drained.map((event) => toCustom(ctx, event))]
    },

    onFinish: (ctx) => stop(ctx),
    onAbort: (ctx) => stop(ctx),
    onError: (ctx) => stop(ctx),
  })
}
