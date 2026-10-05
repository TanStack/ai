import { test, expect } from './fixtures'
import { z } from 'zod'
import type { Page } from '@playwright/test'
import {
  getMessages,
  runTest,
  selectScenario,
  waitForTestComplete,
} from './tools-test/helpers'

test('canonical tool input survives the browser and the next turn', async ({
  page,
  testId,
  aimockPort,
}) => {
  await selectScenario(page, 'canonical-tool-input', testId, aimockPort)
  await runTest(page)
  await waitForTestComplete(page)
  const first = await getMessages(page)
  const call = first
    .flatMap((message) => message.parts ?? [])
    .find((part) => part.type === 'tool-call')
  expect(call.arguments).toBe('{"component":"database"}')
  expect(call.input).toEqual({ component: 'database' })
  await runTest(page)
  await expect
    .poll(async () => JSON.stringify(await getMessages(page)))
    .toContain('History arguments: {\\"component\\":\\"database\\"}')
})

const EventSchema = z.object({
  type: z.string(),
  toolName: z.string(),
  details: z.string().optional(),
})

async function events(page: Page) {
  const text = await page.locator('#event-log-json').textContent()
  return z.array(EventSchema).parse(JSON.parse(text || '[]'))
}

const cases = [
  { side: 'server', kind: 'valid', raw: '{"count":2}', input: { count: 2 } },
  {
    side: 'server',
    kind: 'coercible',
    raw: '{"count":"3"}',
    input: { count: 3 },
  },
  { side: 'server', kind: 'rejected', raw: '{"count":{}}' },
  {
    side: 'client',
    kind: 'valid',
    raw: '{"message":"hello","type":"info"}',
    message: 'hello',
  },
  {
    side: 'client',
    kind: 'coercible',
    raw: '{"message":7,"type":"info"}',
    message: '7',
  },
  { side: 'client', kind: 'rejected', raw: '{"message":{},"type":"info"}' },
]

for (const entry of cases) {
  test(`${entry.side} tool input: ${entry.kind}`, async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(
      page,
      `replay-${entry.side}-${entry.kind}`,
      testId,
      aimockPort,
    )
    await runTest(page)
    await expect
      .poll(async () => JSON.stringify(await getMessages(page)))
      .toContain('Validation finished.')
    const messages = await getMessages(page)
    const name =
      entry.side === 'server' ? 'measure_replay' : 'show_notification'
    const calls = messages
      .flatMap((message) => message.parts ?? [])
      .filter((part) => part.type === 'tool-call' && part.name === name)
    expect(calls).toHaveLength(1)
    expect(calls[0].arguments).toBe(entry.raw)
    const log = await events(page)
    const executed = log.filter((event) =>
      entry.side === 'server'
        ? event.type === 'custom-event' && event.toolName === 'replay:executed'
        : event.type === 'execution-complete' && event.toolName === name,
    )
    if (entry.kind === 'rejected') {
      expect(executed).toHaveLength(0)
      expect(
        log.filter(
          (event) =>
            event.type === 'execution-start' && event.toolName === name,
        ),
      ).toHaveLength(0)
      expect(JSON.stringify(calls[0])).toContain('Input validation failed')
    } else {
      expect(executed).toHaveLength(1)
      if (entry.side === 'server') {
        expect(JSON.parse(executed[0].details || 'null')).toEqual({
          input: entry.input,
          toolCallId: calls[0].id,
        })
      } else {
        expect(executed[0].details).toBe(entry.message)
        expect(
          log.filter(
            (event) =>
              event.type === 'execution-start' && event.toolName === name,
          ),
        ).toHaveLength(1)
      }
    }
  })
}

for (const durable of [false, true]) {
  test(`${durable ? 'durable' : 'ephemeral'} approval edits validate once across host restarts`, async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: {
        scenario: 'replay-validation-resume',
        durable,
        testId,
        aimockPort,
      },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      pending: { hooks: 0, clientDescriptors: 0 },
      correlationRejected: true,
      phaseTwo: {
        raw: { count: '2' },
        input: { count: 5 },
        transforms: 1,
        arguments: '{"count":"2"}',
      },
      invalidOutputRejected: true,
      phaseThree: {
        raw: { count: '2' },
        transforms: 1,
        arguments: '{"count":"2"}',
        results: 1,
      },
      text: 'Resume finished.',
    })
  })

  test(`${durable ? 'durable' : 'ephemeral'} denied approval does not dispatch a client tool`, async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: {
        scenario: 'replay-validation-denied',
        durable,
        testId,
        aimockPort,
      },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      hooks: 0,
      clientDescriptors: 0,
      text: 'Resume finished.',
    })
  })
}

test('local stop does not mark a saved assistant row as a provider failure', async ({
  page,
  testId,
  aimockPort,
}) => {
  await selectScenario(page, 'client-tool-stop', testId, aimockPort)
  await runTest(page)
  await expect
    .poll(
      async () =>
        (await events(page)).filter(
          (event) =>
            event.type === 'execution-start' &&
            event.toolName === 'show_notification',
        ).length,
    )
    .toBe(1)
  await page.locator('#stop-button').click()
  await expect
    .poll(
      async () =>
        (await events(page)).filter(
          (event) =>
            event.type === 'execution-complete' &&
            event.toolName === 'show_notification',
        ).length,
    )
    .toBe(1)
  const messages = await getMessages(page)
  const assistants = messages.filter((message) => message.role === 'assistant')
  expect(assistants.length).toBeGreaterThan(0)
  for (const message of assistants) {
    expect(message.metadata?.tanstack?.stopReason).toBeUndefined()
    expect(message.error).toBeUndefined()
  }
})
