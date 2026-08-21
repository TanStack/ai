import { describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import type { ResumableConnectConnectionAdapter } from '../src/connection-adapters'
import type { ChatClientPersistence, ChatPersistedState } from '../src/types'

/** A client-authoritative store, pre-seeded as if a live run were persisted. */
function seededStore(): {
  adapter: ChatClientPersistence
  read: () => ChatPersistedState | undefined
} {
  let value: ChatPersistedState | undefined = {
    messages: [],
    resume: { resumeState: { threadId: 't1', runId: 'r1' } },
  }
  return {
    adapter: {
      getItem: () => value,
      setItem: (_id, state) => {
        value = state
      },
      removeItem: () => {
        value = undefined
      },
    },
    read: () => value,
  }
}

/**
 * Construct a client and ATTACH it — what a framework wrapper does on mount.
 * Tailing no longer starts in the constructor, so a discarded client opens nothing.
 */
function mountedChatClient(
  options: ConstructorParameters<typeof ChatClient>[0],
) {
  const client = new ChatClient(options)
  client.attach()
  return client
}

/**
 * A DISPOSED client must never open a tail.
 *
 * Mount hydration is async. If the component unmounts while that fetch is in
 * flight, the fetch still resolves â€” and the old code went straight on to
 * `maybeRejoinInFlight`, opening a tail for a client nobody holds any more. Nothing
 * will ever abort that tail, and a browser allows only ~6 connections per origin,
 * so a handful of thread switches starves the page: every later request queues.
 *
 * Measured before the fix, with three runs and ten thread switches: tails climbed
 * to 6 and stopped there, and an in-page fetch then took 93 SECONDS while the
 * identical request from outside the browser took 17ms. The visible symptoms were
 * the message disappearing, no UI updates until a run finished, and a 40s reload.
 */
describe('dispose stops a late hydration from opening a tail', () => {
  it('does not join a run when hydration resolves after dispose', async () => {
    const joinRun = vi.fn(async function* () {
      // Never yields: a real tail parks until the run produces.
      await new Promise(() => {})
    })

    // Hold hydration open so the test can dispose FIRST, deterministically.
    let releaseHydration: (() => void) | undefined
    const hydrationGate = new Promise<void>((resolve) => {
      releaseHydration = resolve
    })

    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: async () => {
        await hydrationGate
        return {
          messages: [],
          activeRun: { runId: 'r1' },
          interrupts: null,
        }
      },
    }

    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
    })

    // The component goes away while hydration is still in flight.
    client.dispose()
    releaseHydration?.()
    // Let the hydration continuation run.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(joinRun).not.toHaveBeenCalled()
  })

  it('aborts an OPEN tail when the client is disposed', async () => {
    // The leak the guards above do not cover: a tail opened while the pane was
    // alive. `dispose()` means the client is unreachable, so that stream can never
    // be read and nothing else will abort it â€” it holds one of the browser's ~6
    // connections per origin for the rest of the page's life. Measured before this:
    // tails reached the ceiling of 5 with only TWO threads, and an in-page fetch
    // then took over 2 minutes.
    let sawAbort = false
    const joinRun = vi.fn(async function* (
      _runId: string,
      abortSignal?: AbortSignal,
    ) {
      await new Promise<void>((resolve) => {
        if (!abortSignal) return
        abortSignal.addEventListener(
          'abort',
          () => {
            sawAbort = true
            resolve()
          },
          { once: true },
        )
      })
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: () =>
        Promise.resolve({
          messages: [],
          activeRun: { runId: 'r1' },
          interrupts: null,
        }),
    }

    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
    })
    // Let the tail open first â€” this is the "pane was alive" case.
    await vi.waitFor(() => {
      expect(joinRun).toHaveBeenCalled()
    })

    client.dispose()

    await vi.waitFor(() => {
      expect(sawAbort).toBe(true)
    })
  })

  it('detach drops the connection, and attach picks the run back up', async () => {
    // The lifecycle the UI wrappers use: only the view on screen holds a stream.
    // You can start 40 sandboxes, so the other 39 must sit idle with no connection
    // â€” a browser allows ~6 per origin, and holding one per view starves the page.
    let opens = 0
    let aborts = 0
    const joinRun = vi.fn(async function* (
      _runId: string,
      abortSignal?: AbortSignal,
    ) {
      opens++
      await new Promise<void>((resolve) => {
        abortSignal?.addEventListener(
          'abort',
          () => {
            aborts++
            resolve()
          },
          { once: true },
        )
      })
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: () =>
        Promise.resolve({
          messages: [],
          activeRun: { runId: 'r1' },
          interrupts: null,
        }),
    }

    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
    })
    await vi.waitFor(() => expect(opens).toBe(1))

    // Off screen: the connection must go.
    client.detach()
    await vi.waitFor(() => expect(aborts).toBe(1))

    // Back on screen: it must tail the SAME run again. The resume pointer has to
    // have survived the detach for this to work.
    client.attach()
    await vi.waitFor(() => expect(opens).toBe(2))
    expect(joinRun).toHaveBeenLastCalledWith('r1', expect.anything())

    client.dispose()
  })

  it('attach is idempotent, so a wrapper mount after construction is free', async () => {
    const joinRun = vi.fn(async function* () {
      await new Promise(() => {})
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: () =>
        Promise.resolve({
          messages: [],
          activeRun: { runId: 'r1' },
          interrupts: null,
        }),
    }
    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
    })
    await vi.waitFor(() => expect(joinRun).toHaveBeenCalledTimes(1))

    client.attach()
    client.attach()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(joinRun).toHaveBeenCalledTimes(1)
    client.dispose()
  })

  it('detach must not wipe a PERSISTED resume pointer', async () => {
    // The hazard the `tailing` conjunct exists for. A join aborted before its
    // first chunk normally means "this run is unreachable", and the cleanup then
    // clears the stored pointer so it does not re-pin the UI next load. A detach
    // aborts in exactly the same shape â€” but the run is alive and we intend to
    // come back. Without the conjunct, leaving a view would delete the pointer and
    // the run could never be re-joined on any later load.
    const store = seededStore()
    const joinRun = vi.fn(async function* (
      _runId: string,
      abortSignal?: AbortSignal,
    ) {
      // Never yields, so `attached` stays false and the cleanup branch is reached.
      await new Promise<void>((resolve) => {
        abortSignal?.addEventListener('abort', () => resolve(), { once: true })
      })
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
    }

    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: store.adapter,
    })
    await vi.waitFor(() => expect(joinRun).toHaveBeenCalled())

    client.detach()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(store.read()?.resume?.resumeState).toEqual({
      threadId: 't1',
      runId: 'r1',
    })
    client.dispose()
  })

  it('an EPHEMERAL chat makes no request on attach or re-attach', async () => {
    // A page can hold 40 chats that are not persisted. Those must cost nothing
    // when their view mounts: no hydration GET, no join. Both actions in `attach`
    // are gated â€” the rejoin needs a persisted run pointer, and the hydration
    // needs server-authoritative mode (`persistence: true`) â€” so an ephemeral
    // client attaches for free. This test exists so that stays true.
    const hydrate = vi.fn(() =>
      Promise.resolve({ messages: [], activeRun: null, interrupts: null }),
    )
    const joinRun = vi.fn(async function* () {
      await new Promise(() => {})
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate,
    }

    // No `persistence` at all.
    const client = mountedChatClient({ threadId: 't1', connection })
    await new Promise((resolve) => setTimeout(resolve, 10))

    client.detach()
    client.attach()
    client.detach()
    client.attach()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(hydrate).not.toHaveBeenCalled()
    expect(joinRun).not.toHaveBeenCalled()
    client.dispose()
  })

  it('a hydration that resolves after DETACH must not open a tail', async () => {
    // THE LEAK, exactly. A view switch calls `detach()`, not `dispose()`. The
    // hydration already in flight resolves a moment later and reaches
    // `maybeRejoinInFlight`, which opens a tail for a view that has gone â€” and
    // nothing will ever abort it. Traced with CDP: connection ids 1366/1397/1429/
    // 1460 were still held after eight switches, and a later request waited 97
    // seconds for a free slot (`stallMs: 97691`).
    let releaseHydration: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseHydration = resolve
    })
    const joinRun = vi.fn(async function* () {
      await new Promise(() => {})
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: async () => {
        await gate
        return { messages: [], activeRun: { runId: 'r1' }, interrupts: null }
      },
    }

    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
    })

    // The view goes away while hydration is still in flight â€” NOT disposed,
    // because the client is expected back.
    client.detach()
    releaseHydration?.()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(joinRun).not.toHaveBeenCalled()
    client.dispose()
  })

  it('still joins the run when hydration resolves before dispose', async () => {
    // The guard must not break the ordinary path it protects.
    const joinRun = vi.fn(async function* () {
      await new Promise(() => {})
    })
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun,
      hydrate: () =>
        Promise.resolve({
          messages: [],
          activeRun: { runId: 'r1' },
          interrupts: null,
        }),
    }

    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: true,
    })

    await vi.waitFor(() => {
      expect(joinRun).toHaveBeenCalledWith('r1', expect.anything())
    })
    client.dispose()
  })
})
