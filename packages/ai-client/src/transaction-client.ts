import { parsePartialJSON } from '@tanstack/ai'
import { ChatClient } from './chat-client.js'
import { GenerationClient } from './generation-client.js'
import type { StreamChunk } from '@tanstack/ai'
import type { TransactionDefinition } from '@tanstack/ai/transaction'
import type {
  ChatVerbOptions,
  OneShotVerbOptions,
  TransactionClientOptions,
  TransactionSubRun,
} from './transaction-types.js'

/** CUSTOM event names of the transaction sub-run protocol (server-emitted). */
const SUB_RUN_EVENTS = {
  STARTED: 'transaction:sub-run:started',
  CHUNK: 'transaction:sub-run:chunk',
  RESULT: 'transaction:sub-run:result',
  ERROR: 'transaction:sub-run:error',
} as const

/**
 * Coalesce reactive `notify`s for streamed text deltas to one per this many
 * chunks, so consumers rendering the live `partial`/`text` (e.g. Markdown)
 * re-render at a bounded rate rather than once per token. The internal
 * sub-run state is still updated on every chunk; only the reactive
 * notification is batched. Status transitions and completion always flush
 * immediately. Mirrors the core StreamProcessor's structured-output batch
 * size so the transaction path streams as smoothly as the chat path.
 */
const SUB_RUN_TEXT_NOTIFY_BATCH = 12

/**
 * Composes one `ChatClient` per chat verb and one `GenerationClient` per
 * one-shot verb declared on a `TransactionDefinition`, sharing the single
 * `connection` adapter passed in `options`.
 *
 * Each sub-client tags its own requests with the verb name — `ChatClient`
 * via `forwardedProps: { verb }`, `GenerationClient` via `body: { verb }` —
 * so the single server endpoint can route on that field.
 *
 * For one-shot verbs, the client also demultiplexes the transaction sub-run
 * events (`transaction:sub-run:*`) the server emits when the verb's
 * `execute` composes siblings via `ctx.call`, exposing them as live
 * per-verb {@link TransactionSubRun} state.
 */
export class TransactionClient<
  TDef extends TransactionDefinition<any> = TransactionDefinition<any>,
> {
  private readonly chats = new Map<string, ChatClient<any>>()
  private readonly oneShots = new Map<string, GenerationClient<any, any, any>>()
  private readonly subRuns = new Map<string, Array<TransactionSubRun>>()
  /** Per-sub-run streamed-text-chunk counter, for batching reactive notifies. */
  private readonly subRunChunkCounts = new Map<string, number>()
  readonly verbs: ReadonlyArray<string>

  constructor(options: TransactionClientOptions<TDef>) {
    const { transaction, connection, id, threadId, verbs, callbacks } = options
    this.verbs = transaction.verbs

    for (const verbName of transaction.verbs) {
      const kind = transaction.verbKinds[verbName]
      if (kind === 'chat') {
        const verbOptions: ChatVerbOptions | undefined =
          verbs?.[verbName as keyof typeof verbs]
        this.chats.set(
          verbName,
          new ChatClient<any>({
            connection,
            id: id ? `${id}:${verbName}` : undefined,
            threadId,
            tools: verbOptions?.tools as any,
            forwardedProps: { ...verbOptions?.forwardedProps, verb: verbName },
            ...callbacks?.chat?.(verbName),
          }),
        )
        continue
      }

      const verbOptions: OneShotVerbOptions<any> | undefined =
        verbs?.[verbName as keyof typeof verbs]
      const oneShotCallbacks = callbacks?.oneShot?.(verbName)
      this.subRuns.set(verbName, [])
      this.oneShots.set(
        verbName,
        new GenerationClient({
          connection,
          id: id ? `${id}:${verbName}` : undefined,
          // Merge per-verb forwardedProps under the routing discriminator.
          body: { ...verbOptions?.forwardedProps, verb: verbName },
          ...(verbOptions?.onResult !== undefined && {
            onResult: verbOptions.onResult,
          }),
          onChunk: (chunk) => {
            this.handleSubRunChunk(
              verbName,
              chunk,
              oneShotCallbacks?.onSubRunsChange,
            )
          },
          ...oneShotCallbacks,
        }),
      )
    }
  }

  /** Whether the transaction declares the given verb. */
  has(verbName: string): boolean {
    return this.verbs.includes(verbName)
  }

  /** The `ChatClient` for a declared chat verb, if any. */
  chat(verbName: string): ChatClient<any> | undefined {
    return this.chats.get(verbName)
  }

  /** The `GenerationClient` for a declared one-shot verb, if any. */
  oneShot(verbName: string): GenerationClient<any, any, any> | undefined {
    return this.oneShots.get(verbName)
  }

  /** Live sub-run state for a one-shot verb's current/last run. */
  getSubRuns(verbName: string): Array<TransactionSubRun> {
    return this.subRuns.get(verbName) ?? []
  }

  /**
   * Demultiplex `transaction:sub-run:*` CUSTOM events from a one-shot verb's
   * response stream into that verb's sub-run array. A RUN_STARTED chunk
   * (the root run beginning) resets the array.
   */
  private handleSubRunChunk(
    verbName: string,
    chunk: StreamChunk,
    notify: ((subRuns: Array<TransactionSubRun>) => void) | undefined,
  ): void {
    const type = (chunk as { type?: string }).type
    if (type === 'RUN_STARTED') {
      this.subRuns.set(verbName, [])
      this.subRunChunkCounts.clear()
      notify?.([])
      return
    }
    if (type !== 'CUSTOM') return
    const { name, value } = chunk as {
      name?: string
      value?: {
        runId?: string
        verb?: string
        index?: number
        result?: unknown
        message?: string
        chunk?: {
          type?: string
          delta?: unknown
          name?: string
          value?: { object?: unknown }
        }
      }
    }
    if (!name || !name.startsWith('transaction:sub-run:') || !value) return

    const current = this.subRuns.get(verbName) ?? []
    const next = current.slice()
    const at = next.findIndex((s) => s.runId === value.runId)
    const existing = at === -1 ? undefined : next[at]

    // Streamed text deltas fire per token; coalesce their reactive notifies so
    // consumers re-render at a bounded rate. Every other event (status change,
    // completion) flushes immediately. Internal state updates on every chunk
    // regardless, so `getSubRuns()` is always current.
    let shouldNotify = true

    if (name === SUB_RUN_EVENTS.STARTED) {
      next.push({
        runId: value.runId ?? '',
        verb: value.verb ?? 'verb',
        index: value.index ?? next.length,
        status: 'running',
        result: null,
        text: '',
      })
    } else if (!existing) {
      return
    } else if (name === SUB_RUN_EVENTS.CHUNK) {
      const inner = value.chunk
      if (
        inner?.type === 'TEXT_MESSAGE_CONTENT' &&
        typeof inner.delta === 'string'
      ) {
        // Accumulate the streamed text. For a structured-output chat verb
        // these deltas are the output's JSON; attempt a partial parse so a
        // live object streams into `partial`. Plain prose yields `undefined`
        // (parsePartialJSON only produces object-shaped values), so `partial`
        // stays unset for non-structured verbs.
        const text = existing.text + inner.delta
        const parsed = parsePartialJSON(text)
        next[at] = {
          ...existing,
          text,
          ...(parsed != null && typeof parsed === 'object'
            ? { partial: parsed }
            : {}),
        }
        // Notify only on batch boundaries; the internal map is still updated.
        const runId = value.runId ?? ''
        const count = (this.subRunChunkCounts.get(runId) ?? 0) + 1
        this.subRunChunkCounts.set(runId, count)
        shouldNotify = count % SUB_RUN_TEXT_NOTIFY_BATCH === 0
      } else if (
        inner?.type === 'CUSTOM' &&
        inner.name === 'structured-output.complete'
      ) {
        // Snap `partial` to the fully-parsed, schema-validated object.
        const object = inner.value?.object
        next[at] =
          object !== undefined ? { ...existing, partial: object } : existing
      } else {
        return
      }
    } else if (name === SUB_RUN_EVENTS.RESULT) {
      next[at] = { ...existing, status: 'success', result: value.result }
    } else if (name === SUB_RUN_EVENTS.ERROR) {
      next[at] = {
        ...existing,
        status: 'error',
        error: value.message ?? 'Sub-run failed',
      }
    } else {
      return
    }

    this.subRuns.set(verbName, next)
    if (shouldNotify) notify?.(next)
  }

  /** Tears down every chat and one-shot sub-client. */
  dispose(): void {
    for (const chat of this.chats.values()) {
      chat.dispose()
    }
    for (const oneShot of this.oneShots.values()) {
      oneShot.dispose()
    }
  }
}
