import { describe, expect, it } from 'vitest'
import { realtimeSession } from '../src/index'
import type {
  RealtimeSessionAdapter,
  RealtimeSessionAnswer,
  RealtimeSessionRequest,
} from '../src/realtime/types'

const answer: RealtimeSessionAnswer = {
  provider: 'mock',
  sessionId: 'sess_1',
  sdp: 'v=0 answer',
  config: { voice: 'marin' },
}

/** An adapter that records each call and answers with `answer`. */
function recordingAdapter() {
  const calls: Array<{
    request: RealtimeSessionRequest
    abortSignal: AbortSignal | undefined
  }> = []
  const adapter: RealtimeSessionAdapter = {
    provider: 'mock',
    createSession: (request, options) => {
      calls.push({ request, abortSignal: options?.abortSignal })
      return Promise.resolve(answer)
    },
  }
  return { adapter, calls }
}

describe('realtimeSession()', () => {
  it('rejects a request with no sdp', async () => {
    const { adapter, calls } = recordingAdapter()
    await expect(
      realtimeSession({ adapter, request: { config: {} } }),
    ).rejects.toThrow('non-empty `sdp` string')
    expect(calls).toHaveLength(0)
  })

  it('rejects a request whose config is not an object', async () => {
    const { adapter, calls } = recordingAdapter()
    await expect(
      realtimeSession({ adapter, request: { sdp: 'v=0 offer', config: [] } }),
    ).rejects.toThrow('`config` must be an object')
    expect(calls).toHaveLength(0)
  })

  it('passes only sdp and config to the adapter and returns its answer', async () => {
    const { adapter, calls } = recordingAdapter()
    const result = await realtimeSession({
      adapter,
      request: {
        sdp: 'v=0 offer',
        config: { instructions: 'Be brief.' },
        model: 'attacker-model',
      },
    })
    expect(result).toEqual({
      provider: 'mock',
      sessionId: 'sess_1',
      sdp: 'v=0 answer',
      config: { voice: 'marin' },
    })
    expect(calls).toEqual([
      {
        request: { sdp: 'v=0 offer', config: { instructions: 'Be brief.' } },
        abortSignal: undefined,
      },
    ])
  })

  it('forwards abortSignal and rejects when it aborts', async () => {
    let received: AbortSignal | undefined
    const adapter: RealtimeSessionAdapter = {
      provider: 'mock',
      createSession: (_request, options) => {
        received = options?.abortSignal
        return new Promise(() => {})
      },
    }
    const controller = new AbortController()
    const pending = realtimeSession({
      adapter,
      request: { sdp: 'v=0 offer', config: {} },
      abortSignal: controller.signal,
    })
    expect(received).toBe(controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
