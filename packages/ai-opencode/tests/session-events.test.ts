import { afterEach, describe, expect, it, vi } from 'vitest'
import { startOpencodeSession } from '../src/process/server'
import type { OpencodePermissionRequest } from '../src/process/permissions'

/**
 * A fake OpenCode client. The test pushes events into the event stream and
 * resolves the HTTP response of the prompt. The event shapes come from an
 * `opencode serve` 1.19.6 run.
 */
function fakeClient() {
  const queue: Array<unknown> = []
  let waiting: ((result: IteratorResult<unknown>) => void) | undefined
  let closed = false
  let answerPrompt: ((value: unknown) => void) | undefined
  const replies: Array<unknown> = []
  /** The HTTP status of the reply to each request. The default is 200. */
  const replyStatus = new Map<string, number>()
  const stream: AsyncIterableIterator<unknown> = {
    [Symbol.asyncIterator]() {
      return stream
    },
    next() {
      if (queue.length > 0) {
        return Promise.resolve({ done: false, value: queue.shift() })
      }
      if (closed) return Promise.resolve({ done: true, value: undefined })
      return new Promise((resolve) => {
        waiting = resolve
      })
    },
    return() {
      closed = true
      waiting?.({ done: true, value: undefined })
      return Promise.resolve({ done: true, value: undefined })
    },
  }
  return {
    replies,
    replyStatus,
    push(event: unknown) {
      const resolve = waiting
      waiting = undefined
      if (resolve) resolve({ done: false, value: event })
      else queue.push(event)
    },
    answerPrompt(text: string) {
      answerPrompt?.({
        data: {
          info: { id: 'msg-2', role: 'assistant', finish: 'stop' },
          parts: [{ type: 'text', text }],
        },
      })
    },
    client: {
      session: {
        create: () => Promise.resolve({ data: { id: 'ses-1' } }),
        prompt: () =>
          new Promise((resolve) => {
            answerPrompt = resolve
          }),
        abort: () => Promise.resolve(),
      },
      event: { subscribe: () => Promise.resolve({ stream }) },
      // Like the SDK: with `throwOnError`, a failed reply throws its error
      // body. Without it, the result carries the error and the response.
      postSessionIdPermissionsPermissionId: (request: {
        path: { permissionID: string }
        throwOnError?: boolean
      }) => {
        replies.push(request)
        const status = replyStatus.get(request.path.permissionID) ?? 200
        if (status < 300) {
          return Promise.resolve({ data: true, response: { status } })
        }
        const error = { name: 'PermissionNotFoundError' }
        if (request.throwOnError === true) return Promise.reject(error)
        return Promise.resolve({ data: undefined, error, response: { status } })
      },
    },
  }
}

const current = vi.hoisted(() => ({ client: undefined as unknown }))

vi.mock('@opencode-ai/sdk', () => ({
  createOpencode: vi.fn(),
  createOpencodeClient: () => current.client,
}))

afterEach(() => {
  vi.useRealTimers()
})

function start(
  fake: ReturnType<typeof fakeClient>,
  seen: Array<string>,
  onPermissionRequest: (
    request: OpencodePermissionRequest,
  ) => 'once' | 'reject' = () => 'once',
  errors: Array<unknown> = [],
) {
  current.client = fake.client
  return startOpencodeSession({
    baseUrl: 'http://opencode.test',
    providerID: 'opencode',
    modelID: 'test-model',
    onError: (error) => errors.push(error),
    onEvent: (event) => {
      const part =
        event.type === 'message.part.updated'
          ? event.properties.part
          : undefined
      seen.push(
        part?.type === 'text' && 'text' in part
          ? `text:${part.text}`
          : event.type,
      )
    },
    onPermissionRequest,
  })
}

describe('startOpencodeSession with OpenCode 1.x events', () => {
  it('answers a permission.asked request', async () => {
    const fake = fakeClient()
    const asked: Array<OpencodePermissionRequest> = []
    const handle = await start(fake, [], (request) => {
      asked.push(request)
      return 'once'
    })

    fake.push({
      type: 'permission.asked',
      properties: {
        id: 'per-1',
        sessionID: 'ses-1',
        permission: 'bash',
        patterns: ['echo approval-check-one'],
        metadata: { command: 'echo approval-check-one' },
        always: ['echo *'],
        tool: { messageID: 'msg-2', callID: 'call-1' },
      },
    })

    await vi.waitFor(() => expect(fake.replies).toHaveLength(1))
    expect(asked).toEqual([
      {
        id: 'per-1',
        sessionID: 'ses-1',
        type: 'bash',
        title: 'echo approval-check-one',
        callID: 'call-1',
      },
    ])
    expect(fake.replies[0]).toMatchObject({
      path: { id: 'ses-1', permissionID: 'per-1' },
      body: { response: 'once' },
    })
    await handle.dispose()
  })

  // OpenCode 1.19.6 rejects every pending request of a session when it gets
  // one `reject`. A reply to such a request then gets a 404.
  it('treats a reply to a request that OpenCode already settled as done', async () => {
    const fake = fakeClient()
    fake.replyStatus.set('per-2', 404)
    const errors: Array<unknown> = []
    const handle = await start(fake, [], () => 'reject', errors)

    for (const [id, command] of [
      ['per-1', 'echo one'],
      ['per-2', 'echo two'],
    ]) {
      fake.push({
        type: 'permission.asked',
        properties: {
          id,
          sessionID: 'ses-1',
          permission: 'bash',
          patterns: [command],
        },
      })
    }

    await vi.waitFor(() => expect(fake.replies).toHaveLength(2))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(errors).toEqual([])
    await handle.dispose()
  })

  it('reports a reply that fails for another reason', async () => {
    const fake = fakeClient()
    fake.replyStatus.set('per-1', 500)
    const errors: Array<unknown> = []
    const handle = await start(fake, [], () => 'reject', errors)

    fake.push({
      type: 'permission.asked',
      properties: {
        id: 'per-1',
        sessionID: 'ses-1',
        permission: 'bash',
        patterns: ['echo one'],
      },
    })

    await vi.waitFor(() => expect(errors).toHaveLength(1))
    await handle.dispose()
  })

  it('ends a prompt only after the last parts of the turn arrive', async () => {
    const fake = fakeClient()
    const seen: Array<string> = []
    const handle = await start(fake, seen)
    const prompt = handle.prompt('Reply with ONE').then((result) => {
      seen.push(`prompt resolved: ${result.text}`)
    })

    // OpenCode answers the HTTP request first. The last text update and
    // session.idle come a few milliseconds later on the event stream.
    fake.answerPrompt('ONE')
    await new Promise((resolve) => setTimeout(resolve, 10))
    fake.push({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'prt-1',
          sessionID: 'ses-1',
          messageID: 'msg-2',
          type: 'text',
          text: 'ONE',
        },
      },
    })
    fake.push({ type: 'session.idle', properties: { sessionID: 'ses-1' } })
    await prompt

    expect(seen).toEqual(['text:ONE', 'session.idle', 'prompt resolved: ONE'])
    await handle.dispose()
  })

  it('ends a prompt after a short wait when no session.idle arrives', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fake = fakeClient()
    const seen: Array<string> = []
    const handle = await start(fake, seen)
    const prompt = handle.prompt('Reply with ONE').then(() => {
      seen.push('prompt resolved')
    })

    fake.answerPrompt('ONE')
    await vi.advanceTimersByTimeAsync(5_000)
    await prompt

    expect(seen).toEqual(['prompt resolved'])
    await handle.dispose()
  })
})
