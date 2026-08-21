import { describe, expect, it } from 'vitest'
import { sandboxWaitKind } from './sandboxes-durable'
import type { UIMessage } from '@tanstack/ai'

/**
 * The waiting panel on a durable sandboxed run.
 *
 * Verified against the live route: for the whole of `withSandbox`'s `ensure` the
 * hydration response is `{ messages: [], activeRun: { runId } }` — the run record
 * exists (so the server knows a run is in flight) but the transcript does not,
 * because chat persistence saves the pending turn from `onStart`, after every
 * middleware `setup`. A returning tab therefore has an active run and ZERO
 * messages, which is the state that must still render "Starting sandbox…".
 */
const user: UIMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', content: 'go' }],
}
const assistant: UIMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', content: 'hi' }],
}

describe('sandboxWaitKind', () => {
  it('shows boot for an active run whose transcript has not hydrated yet', () => {
    // THE REGRESSION. Requiring a message here rendered an empty pane for the
    // entire sandbox-setup window — the exact moment the user switches away.
    expect(sandboxWaitKind(false, true, [])).toBe('boot')
  })

  it('shows boot for the tab that started the run, before anything streams', () => {
    expect(sandboxWaitKind(true, false, [user])).toBe('boot')
  })

  it('shows continue when a prior assistant turn exists', () => {
    expect(sandboxWaitKind(false, true, [user, assistant, user])).toBe(
      'continue',
    )
  })

  it('hides once the assistant is the latest message', () => {
    // Streaming has started, so the panel must give way to the real content even
    // though the server still reports the run active.
    expect(sandboxWaitKind(true, true, [user, assistant])).toBe(false)
  })

  it('hides when no run is in flight', () => {
    expect(sandboxWaitKind(false, false, [])).toBe(false)
    expect(sandboxWaitKind(false, false, [user])).toBe(false)
  })
})
