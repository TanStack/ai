import { memoryPersistence } from '@tanstack/ai-persistence'
import { HarnessSession } from './session'
import type {
  AIPersistence,
  ChatTranscriptStores,
  InboxStore,
} from '@tanstack/ai-persistence'
import type { AnyHarness } from './define'
import type { Principal } from './types'

/**
 * The stores a host needs: a message store, plus any of runs, interrupts,
 * metadata, and inbox. Without an inbox, inputs are kept in memory and a
 * restart loses the ones not yet applied.
 */
export type HarnessPersistence = AIPersistence<
  ChatTranscriptStores & { inbox?: InboxStore }
>

export interface HarnessHostOptions {
  /** Where sessions keep their state. Default: in memory, lost on restart. */
  persistence?: HarnessPersistence
}

export interface OpenSessionOptions {
  /** The conversation id. Opening the same id again returns the live session. */
  threadId: string
  /** Who opened the session. Stored on inputs and run records. */
  principal?: Principal
}

/** Runs sessions for one or more harnesses in this process. */
export interface HarnessHost {
  /**
   * Open a session, or return the live one for this harness and thread.
   * Session plugins are set up here, so a plugin error rejects the promise.
   */
  open: <THarness extends AnyHarness>(
    harness: THarness,
    options: OpenSessionOptions,
  ) => Promise<HarnessSession<THarness>>
  /** Close every live session. */
  close: () => Promise<void>
}

let warned = false

/**
 * Create a host for harness sessions.
 *
 * @example
 * ```ts
 * const host = createHarnessHost({ persistence })
 * const session = await host.open(studio, { threadId: 'thread-1' })
 * const turn = await session.prompt('Write a haiku about the sea.')
 * ```
 */
export function createHarnessHost(
  options: HarnessHostOptions = {},
): HarnessHost {
  if (!options.persistence && !warned) {
    warned = true
    console.warn(
      '[@tanstack/ai-harness] No persistence given: sessions live in memory and are lost on restart.',
    )
  }
  const persistence = options.persistence ?? memoryPersistence()
  // ponytail: a memory inbox when the stores have none. Pass `stores.inbox`
  // to keep accepted inputs across restarts.
  const inbox = persistence.stores.inbox ?? memoryPersistence().stores.inbox
  const sessions = new Map<string, Promise<HarnessSession>>()
  const hostId = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

  return {
    open(harness, { threadId, principal }) {
      const key = `${harness.name}\u0000${threadId}`
      let session = sessions.get(key)
      if (!session) {
        const created = new HarnessSession({
          harness,
          threadId,
          persistence,
          inbox,
          hostId,
          ...(principal ? { principal } : {}),
          onClose: () => sessions.delete(key),
        })
        session = created.open().then(
          () => created,
          (error: unknown) => {
            sessions.delete(key)
            throw error
          },
        )
        sessions.set(key, session)
      }
      return session as Promise<HarnessSession<typeof harness>>
    },
    async close() {
      const live = await Promise.allSettled(sessions.values())
      await Promise.all(
        live
          .filter((entry) => entry.status === 'fulfilled')
          .map((entry) => entry.value.close()),
      )
    },
  }
}
