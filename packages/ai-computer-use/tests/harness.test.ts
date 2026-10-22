import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeText } from '@tanstack/ai/testing'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { mediaIdOf } from '@tanstack/ai-harness/media'
import { permissions } from '@tanstack/ai-harness/plugins'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { computerUse, keepNewestScreenshots } from '../src/harness'
import type { ModelMessage, TextOptions } from '@tanstack/ai'
import type { FakeResponse } from '@tanstack/ai/testing'
import type { HarnessHost, HarnessSession } from '@tanstack/ai-harness'
import type { ComputerDriver } from '../src/types'

const PNG_BYTES = new Uint8Array([137, 80, 78, 71])
const PNG_BASE64 = 'iVBORw=='
const CLICK = { action: { type: 'click', x: 10, y: 20, button: 'left' } }
const CHECK = { id: 'sc_1', code: 'malicious_instructions', message: 'Look.' }

const hosts: Array<HarnessHost> = []
afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close()))
})

/** A driver that counts its clicks. */
function createDriver() {
  const clicks: Array<string> = []
  const noop = async () => {}
  const driver: ComputerDriver = {
    display: { width: 1024, height: 768 },
    environment: 'browser',
    screenshot: async () => PNG_BYTES,
    click: async () => {
      clicks.push('click')
    },
    move: noop,
    mouseDown: noop,
    mouseUp: noop,
    scroll: noop,
    keyDown: noop,
    keyUp: noop,
    press: noop,
    type: noop,
  }
  return { driver, clicks }
}

/** A session whose model plays `answers`, then says `ok`. */
async function open(
  answers: Array<FakeResponse>,
  options: { permissions?: boolean } = {},
) {
  const { driver, clicks } = createDriver()
  const requests: Array<TextOptions> = []
  const fake = fakeText()
  const steps = [...answers, { text: 'ok' }]
  fake.setResponses(
    steps.map((answer) => ({ request }: { request: TextOptions }) => {
      requests.push(request)
      return answer
    }),
  )
  const plugin = computerUse({ driver, screenshotDelay: 0 })
  const harness = defineHarness({
    name: 'test/computer-use',
    adapter: fake,
    plugins: () => (options.permissions ? [permissions(), plugin] : [plugin]),
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  hosts.push(host)
  const session = await host.open(harness, { threadId: 't' })
  return { session, requests, clicks }
}

const toolMessages = (messages: ReadonlyArray<ModelMessage>) =>
  messages.filter((message) => message.role === 'tool')

/** Wait for the one open approval, answer it, and wait for the turn that resumes. */
async function answer(session: HarnessSession, value: unknown) {
  await vi.waitFor(() =>
    expect(session.snapshot().pendingWaits).toHaveLength(1),
  )
  const [wait] = session.snapshot().pendingWaits
  if (!wait) throw new Error('No approval.')
  const inputId = `answer:${wait.waitId}`
  await session.resolve({
    resume: [{ interruptId: wait.waitId, status: 'resolved', payload: value }],
    inputId,
  })
  await session.settled({ inputId })
  return wait.message ?? ''
}

describe('keepNewestScreenshots', () => {
  const image = (value: string) => ({
    type: 'image' as const,
    source: { type: 'data' as const, value, mimeType: 'image/png' },
  })
  const step = (id: string, name = 'computer'): Array<ModelMessage> => [
    {
      role: 'assistant',
      content: null,
      toolCalls: [
        { id, type: 'function', function: { name, arguments: '{}' } },
      ],
    },
    { role: 'tool', toolCallId: id, content: [image(id)] },
  ]

  it('swaps all but the newest screenshots for a 1x1 image', () => {
    const messages = [...step('a'), ...step('b'), ...step('c', 'read_file')]
    const kept = keepNewestScreenshots(messages, new Set(['computer']), 1)

    const values = toolMessages(kept).map((message) =>
      JSON.stringify(message.content),
    )
    expect(values[0]).not.toContain('"a"')
    expect(values[1]).toContain('"b"')
    // Another tool keeps its image.
    expect(values[2]).toContain('"c"')
    // The transcript is not changed.
    expect(JSON.stringify(messages)).toContain('"a"')
  })

  it('gives the same array when no screenshot is too old', () => {
    const messages = [...step('a'), ...step('b')]
    expect(keepNewestScreenshots(messages, new Set(['computer']), 2)).toBe(
      messages,
    )
  })
})

describe('computerUse', () => {
  it('stores the screenshot in the media store, and the model gets its bytes', async () => {
    const { session, requests, clicks } = await open([
      { toolCalls: [{ name: 'computer', input: CLICK }] },
    ])

    await session.send('click')

    expect(clicks).toEqual(['click'])
    const [result] = toolMessages(await session.transcript())
    const [part] = Array.isArray(result?.content) ? result.content : []
    expect(mediaIdOf(part)).toBeDefined()
    expect(JSON.stringify(requests[1]?.messages)).toContain(PNG_BASE64)
  })

  it('asks before a call with safety checks, and runs it after a yes', async () => {
    const { session, clicks } = await open(
      [
        {
          toolCalls: [
            {
              name: 'computer',
              input: { ...CLICK, pending_safety_checks: [CHECK] },
            },
          ],
        },
      ],
      { permissions: true },
    )

    await session.send('click')
    const message = await answer(session, { answer: 'once' })

    expect(message).toContain('Allow computer')
    expect(clicks).toEqual(['click'])
  })

  it('asks before a call with safety checks, and skips it after a no', async () => {
    const { session, clicks } = await open(
      [
        {
          toolCalls: [
            {
              name: 'computer',
              input: { ...CLICK, pending_safety_checks: [CHECK] },
            },
          ],
        },
      ],
      { permissions: true },
    )

    await session.send('click')
    await answer(session, { answer: 'reject' })

    expect(clicks).toEqual([])
  })

  it('runs a call with no safety checks without a question', async () => {
    const { session, clicks } = await open(
      [{ toolCalls: [{ name: 'computer', input: CLICK }] }],
      { permissions: true },
    )

    await session.send('click')

    expect(session.snapshot().pendingWaits).toEqual([])
    expect(clicks).toEqual(['click'])
  })

  it('refuses a click in plan mode', async () => {
    const { session, requests, clicks } = await open(
      [{ toolCalls: [{ name: 'computer', input: CLICK }] }],
      { permissions: true },
    )
    await session.runCommand({ name: 'mode', input: 'plan' })

    await session.send('click')

    expect(clicks).toEqual([])
    expect(JSON.stringify(requests[1]?.messages)).toContain(
      'This tool is not allowed in plan mode.',
    )
  })

  it('refuses a call with safety checks without permissions()', async () => {
    const { session, requests, clicks } = await open([
      {
        toolCalls: [
          {
            name: 'computer',
            input: { ...CLICK, pending_safety_checks: [CHECK] },
          },
        ],
      },
    ])

    await session.send('click')

    expect(clicks).toEqual([])
    expect(JSON.stringify(requests[1]?.messages)).toContain(
      'Add permissions() to the plugins of the harness.',
    )
  })
})
