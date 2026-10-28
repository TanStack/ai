import { z } from 'zod'
import { test, expect } from '../fixtures'
import { selectScenario, runTest, waitForTestComplete } from './helpers'
import type { Page } from '@playwright/test'

const RuntimeContextOutputSchema = z.object({
  userId: z.string(),
  tenantId: z.string(),
  source: z.string(),
})

const ToolCallPartSchema = z.object({
  type: z.literal('tool-call'),
  name: z.string(),
  output: z.unknown().optional(),
})

const MessageSchema = z.object({
  parts: z.array(z.unknown()).optional(),
})

const ToolEventSchema = z.object({
  type: z.string(),
  toolName: z.string(),
  details: z.string().optional(),
})

async function getToolOutput(page: Page, name: string) {
  const text = await page.locator('#messages-json-content').textContent()
  const messages = z.array(MessageSchema).parse(JSON.parse(text || '[]'))

  for (const message of messages) {
    for (const partData of message.parts ?? []) {
      const part = ToolCallPartSchema.safeParse(partData)
      if (part.success && part.data.name === name && part.data.output) {
        return part.data.output
      }
    }
  }

  return undefined
}

async function getRuntimeContextOutput(page: Page, name: string) {
  const output = await getToolOutput(page, name)
  return output === undefined ? null : RuntimeContextOutputSchema.parse(output)
}

async function getEvents(page: Page) {
  const text = await page.locator('#event-log-json').textContent()
  return z.array(ToolEventSchema).parse(JSON.parse(text || '[]'))
}

test.describe('Runtime Context E2E Tests', () => {
  test('server context is available to server tools', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'server-context', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page)

    await expect
      .poll(() => getRuntimeContextOutput(page, 'read_server_context'))
      .toEqual({
        userId: 'server-user-context',
        tenantId: 'server-tenant-context',
        source: 'server-route',
      })
  })

  test('client context is available to client tools', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'client-context', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page)

    await expect
      .poll(() => getRuntimeContextOutput(page, 'read_client_context'))
      .toEqual({
        userId: 'client-user-context',
        tenantId: 'client-tenant-context',
        source: 'client-local',
      })

    const events = await getEvents(page)
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'execution-complete',
        toolName: 'read_client_context',
        details: 'client-user-context/client-tenant-context',
      }),
    )
  })

  test('client forwarded props can be mapped into server context', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'client-server-context', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page)

    await expect
      .poll(() => getRuntimeContextOutput(page, 'read_server_context'))
      .toEqual({
        userId: 'client-forwarded-user-context',
        tenantId: 'server-tenant-context',
        source: 'forwarded-props',
      })
  })
})
