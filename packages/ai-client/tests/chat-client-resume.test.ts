import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

/**
 * Adapter that records each connect's runContext and yields scripted chunks.
 * A script can be a function of the live `runContext` (so a test can emit a
 * RUN_FINISHED carrying the same runId the client generated and passed in).
 */
type Script =
  | Array<StreamChunk>
  | ((ctx: RunAgentInputContext | undefined) => Array<StreamChunk>)

function recordingAdapter(scripts: Array<Script>) {
  const contexts: Array<RunAgentInputContext | undefined> = []
  let i = 0
  const adapter: ConnectConnectionAdapter = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *connect(_messages, _data, _signal, runContext) {
      contexts.push(runContext)
      const script = scripts[i]
      i++
      const chunks =
        typeof script === 'function' ? script(runContext) : (script ?? [])
      for (const c of chunks) yield c
    },
  }
  return { adapter, contexts }
}

const text = (delta: string, cursor?: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  timestamp: Date.now(),
  delta,
  ...(cursor ? { cursor } : {}),
})
const runStarted: StreamChunk = {
  type: EventType.RUN_STARTED,
  runId: 'run-1',
  threadId: 'thread-1',
  timestamp: Date.now(),
}

describe('ChatClient resume', () => {
  it('tracks the in-band cursor of an interrupted run', async () => {
    // No RUN_FINISHED -> the run is "interrupted", resume state retained.
    const { adapter } = recordingAdapter([
      [runStarted, text('a', '1'), text('b', '2')],
    ])
    const client = new ChatClient({ connection: adapter })
    await client.append({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
      createdAt: new Date(),
    })

    const state = client.getResumeState()
    expect(state).not.toBeNull()
    expect(state?.cursor).toBe('2')
  })

  it('clears resume state once the run finishes', async () => {
    const { adapter } = recordingAdapter([
      (ctx) => [
        runStarted,
        text('a', '1'),
        {
          type: EventType.RUN_FINISHED,
          // Carry the runId the client generated (passed in via runContext) so
          // the terminal correlates to the tracked resume state.
          runId: ctx?.runId ?? 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
          finishReason: 'stop',
        },
      ],
    ])
    const client = new ChatClient({ connection: adapter })
    await client.append({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
      createdAt: new Date(),
    })
    expect(client.getResumeState()).toBeNull()
  })

  it('resume() reconnects with the cursor in runContext', async () => {
    const { adapter, contexts } = recordingAdapter([
      [runStarted, text('a', '7')], // interrupted (no finish)
      [text('b', '8')], // resume continuation
    ])
    const client = new ChatClient({ connection: adapter })
    await client.append({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
      createdAt: new Date(),
    })

    await client.resume()
    expect(contexts).toHaveLength(2)
    // First connect: fresh run, no cursor. Second: resume with the last cursor.
    expect(contexts[0]?.cursor).toBeUndefined()
    expect(contexts[1]?.cursor).toBe('7')
  })

  it('maybeAutoResume is a no-op when autoResume is false', async () => {
    const { adapter, contexts } = recordingAdapter([
      [runStarted, text('a', '7')],
    ])
    const client = new ChatClient({ connection: adapter, autoResume: false })
    await client.append({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
      createdAt: new Date(),
    })
    const resumed = await client.maybeAutoResume()
    expect(resumed).toBe(false)
    expect(contexts).toHaveLength(1)
  })
})
