import { test, expect } from './fixtures'
import type { APIRequestContext, APIResponse } from '@playwright/test'

/**
 * Access on a `membersOnly()` host: the owner shares a thread with one
 * member. A user of the same tenant who is not a member is refused (403),
 * and a user of another tenant does not find the thread (404). The
 * `x-harness-access: members` header picks that host in the route.
 */

const BASE = '/api/harness-protocol'
const ANSWER = 'Hello over the harness protocol.'
const FORBIDDEN = { status: 403, body: { error: 'forbidden' } }
const NOT_FOUND = { status: 404, body: { error: 'not found' } }

/** The text of the answer in a POST run stream. */
const answerOf = async (response: APIResponse) =>
  (await response.text())
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)))
    .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
    .map((event) => event.delta)
    .join('')

/** The status and the JSON body of a refused request. */
const refusalOf = async (response: APIResponse) => ({
  status: response.status(),
  body: await response.json(),
})

/**
 * Open the session stream of a thread, read its first frame after the
 * `harness.hello`, and close the stream. `: ping` comments have no `data:`
 * line, so they are skipped. A refused request answers with JSON, not with
 * a stream.
 */
async function firstEvent(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers })
  if (!response.ok || !response.body) {
    return { status: response.status, body: await response.json() }
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let body: { type?: string } | null = null
  while (body === null) {
    const read = await reader.read()
    if (read.done) break
    buffer += read.value
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const data = block.split('\n').find((line) => line.startsWith('data: '))
      if (!data) continue
      const frame: { type?: string } = JSON.parse(data.slice('data: '.length))
      if (frame.type === 'harness.hello') continue
      body = frame
      break
    }
  }
  await reader.cancel()
  return { status: response.status, body }
}

/** One user of the `membersOnly()` host, by the token of the route. */
function asUser(
  request: APIRequestContext,
  {
    testId,
    aimockPort,
    baseURL,
  }: { testId: string; aimockPort: number; baseURL: string | undefined },
  token: string,
) {
  const headers = {
    authorization: `Bearer ${token}`,
    'x-test-id': testId,
    'x-aimock-port': String(aimockPort),
    'x-harness-access': 'members',
  }
  const json = { ...headers, 'content-type': 'application/json' }
  return {
    /** Send the hello prompt of the protocol fixture as the run `runId`. */
    send: (threadId: string, runId: string) =>
      request.post(`${BASE}/run`, {
        headers: json,
        data: {
          threadId,
          runId,
          messages: [
            { id: 'u1', role: 'user', content: '[harness-protocol] hello' },
          ],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        },
      }),
    sessions: (body: object) =>
      request.post(`${BASE}/sessions`, { headers: json, data: body }),
    events: (threadId: string) =>
      firstEvent(
        `${baseURL}${BASE}/events?threadId=${threadId}&from=0`,
        headers,
      ),
    /** What a `ChatClient` with `persistence` loads for the thread. */
    hydrate: (threadId: string) =>
      request.get(`${BASE}/run?threadId=${threadId}`, { headers }),
  }
}

test.describe('harness access', () => {
  test('a shared thread serves its two members, refuses a third user, and stays hidden from another tenant', async ({
    request,
    baseURL,
    testId,
    aimockPort,
  }) => {
    const user = (token: string) =>
      asUser(request, { testId, aimockPort, baseURL }, token)
    const owner = user('e2e-token')
    const bob = user('e2e-token-bob')
    const carol = user('e2e-token-carol')
    const mallory = user('e2e-token-mallory')
    const threadId = `access-${testId}`

    // 1. The owner starts the thread.
    expect(
      await answerOf(await owner.send(threadId, `access-owner-${testId}`)),
    ).toBe(ANSWER)

    // 2. The owner shares the thread with bob.
    const shared = await owner.sessions({
      op: 'share',
      threadId,
      userId: 'bob',
      role: 'member',
    })
    expect((await shared.json()).members).toEqual([
      { userId: 'e2e', role: 'owner' },
      { userId: 'bob', role: 'member' },
    ])

    // 3. Bob reads the session stream and sends a prompt.
    expect(await bob.events(threadId)).toMatchObject({
      status: 200,
      body: { type: 'harness.event' },
    })
    expect(
      await answerOf(await bob.send(threadId, `access-bob-${testId}`)),
    ).toBe(ANSWER)

    // 4. Carol is in the same tenant, but she is not a member.
    expect(await carol.events(threadId)).toEqual(FORBIDDEN)
    expect(
      await refusalOf(await carol.send(threadId, `access-carol-${testId}`)),
    ).toEqual(FORBIDDEN)

    // 5. Mallory is in another tenant, where this thread does not exist.
    expect(await mallory.events(threadId)).toEqual(NOT_FOUND)
    expect(await (await mallory.hydrate(threadId)).json()).toEqual({
      messages: [],
      activeRun: null,
      interrupts: null,
    })

    // 6. The owner removes bob, so the next requests of bob are refused.
    const unshared = await owner.sessions({
      op: 'unshare',
      threadId,
      userId: 'bob',
    })
    expect((await unshared.json()).members).toEqual([
      { userId: 'e2e', role: 'owner' },
    ])
    expect(await bob.events(threadId)).toEqual(FORBIDDEN)
    expect(
      await refusalOf(await bob.send(threadId, `access-bob-again-${testId}`)),
    ).toEqual(FORBIDDEN)
  })
})
