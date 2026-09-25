import { expect, test } from '@playwright/test'
import { sendMessage, waitForResponse } from './helpers'
import type { APIRequestContext, Page } from '@playwright/test'

/**
 * Server-authoritative history paging (`persistence: true` + `history.pageSize`).
 *
 * Provider-free: `/api/message-history-paging` streams a fixed reply. Exempt
 * from aimock.
 */

const SEED = [
  { id: 'u1', role: 'user' as const, content: 'one' },
  { id: 'a1', role: 'assistant' as const, content: 'one-reply' },
  { id: 'u2', role: 'user' as const, content: 'two' },
  { id: 'a2', role: 'assistant' as const, content: 'two-reply' },
  { id: 'u3', role: 'user' as const, content: 'three' },
  { id: 'a3', role: 'assistant' as const, content: 'three-reply' },
]

const SEED_IDS = ['u1', 'a1', 'u2', 'a2', 'u3', 'a3']

interface InspectBody {
  stored: Array<{ id?: string; role: string; content: string }>
  lastIncomingIds: Array<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readHydrate(value: unknown): {
  messageIds: Array<string>
  page?: { truncated: boolean; cursor?: string }
} {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    throw new Error('hydrate body is missing messages')
  }
  const messageIds: Array<string> = []
  for (const entry of value.messages) {
    if (!isRecord(entry) || typeof entry.id !== 'string') {
      throw new Error('hydrate message id is missing')
    }
    messageIds.push(entry.id)
  }
  if (!isRecord(value.page)) {
    return { messageIds }
  }
  if (typeof value.page.truncated !== 'boolean') {
    throw new Error('hydrate page.truncated is missing')
  }
  return {
    messageIds,
    page: {
      truncated: value.page.truncated,
      cursor:
        typeof value.page.cursor === 'string' ? value.page.cursor : undefined,
    },
  }
}

function readInspect(value: unknown): InspectBody {
  if (!isRecord(value) || !Array.isArray(value.stored)) {
    throw new Error('inspect body is missing stored')
  }
  if (!Array.isArray(value.lastIncomingIds)) {
    throw new Error('inspect body is missing lastIncomingIds')
  }
  const stored: InspectBody['stored'] = []
  for (const entry of value.stored) {
    if (!isRecord(entry) || typeof entry.role !== 'string') {
      throw new Error('inspect stored row is invalid')
    }
    stored.push({
      id: typeof entry.id === 'string' ? entry.id : undefined,
      role: entry.role,
      content: typeof entry.content === 'string' ? entry.content : '',
    })
  }
  const lastIncomingIds: Array<string> = []
  for (const id of value.lastIncomingIds) {
    if (typeof id !== 'string') {
      throw new Error('inspect lastIncomingIds must be strings')
    }
    lastIncomingIds.push(id)
  }
  return { stored, lastIncomingIds }
}

function threadId(label: string) {
  return `hist-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function apiPath(store: 'array' | 'page', extra = '') {
  const params = extra === '' ? '' : `&${extra}`
  return store === 'page'
    ? `/api/message-history-paging?store=page${params}`
    : `/api/message-history-paging?${extra}`
}

async function seedThread(
  request: APIRequestContext,
  store: 'array' | 'page',
  id: string,
  messages: typeof SEED,
) {
  const response = await request.post(apiPath(store, 'seed=1'), {
    data: { threadId: id, messages },
  })
  expect(response.ok()).toBe(true)
}

async function inspectThread(
  request: APIRequestContext,
  store: 'array' | 'page',
  id: string,
) {
  const response = await request.get(
    apiPath(store, `inspect=1&threadId=${encodeURIComponent(id)}`),
  )
  expect(response.ok()).toBe(true)
  return readInspect(await response.json())
}

async function paintedIds(page: Page) {
  const raw = await page.getByTestId('painted-ids').getAttribute('data-ids')
  return raw === null || raw === '' ? [] : raw.split(',')
}

test.describe('message history paging', () => {
  for (const store of ['array', 'page'] as const) {
    test(`${store} store hydrates the newest window and Load older prepends`, async ({
      page,
      request,
    }) => {
      const id = threadId(store)
      await seedThread(request, store, id, SEED)

      const hydrate = await request.get(
        apiPath(store, `threadId=${encodeURIComponent(id)}&limit=2`),
      )
      expect(hydrate.ok()).toBe(true)
      const hydrateBody = readHydrate(await hydrate.json())
      expect(hydrateBody.messageIds).toEqual(['u3', 'a3'])
      expect(hydrateBody.page).toEqual({ truncated: true, cursor: 'u3' })

      await page.goto(
        `/message-history-paging?threadId=${encodeURIComponent(id)}&store=${store}&pageSize=2`,
      )
      await expect(page.getByTestId('hydration-marker')).toBeAttached()
      await expect(page.getByTestId('painted-ids')).toHaveAttribute(
        'data-ids',
        'u3,a3',
      )
      await expect(page.getByTestId('has-older')).toHaveAttribute(
        'data-has-older',
        'true',
      )

      await page.getByTestId('load-older').click()
      await expect(page.getByTestId('painted-ids')).toHaveAttribute(
        'data-ids',
        'u2,a2,u3,a3',
      )

      await page.getByTestId('load-older').click()
      await expect(page.getByTestId('painted-ids')).toHaveAttribute(
        'data-ids',
        'u1,a1,u2,a2,u3,a3',
      )
      await expect(page.getByTestId('has-older')).toHaveAttribute(
        'data-has-older',
        'false',
      )
      await expect(page.getByTestId('load-older')).toHaveCount(0)
      expect(await paintedIds(page)).toEqual(SEED_IDS)
    })
  }

  test('a one-message send keeps stored extras (no paging client)', async ({
    request,
  }) => {
    const id = threadId('short-send')
    await seedThread(request, 'array', id, [
      { id: 'u1', role: 'user', content: 'one' },
      { id: 'a1', role: 'assistant', content: 'one-reply' },
    ])

    const response = await request.post(apiPath('array', 'run=1'), {
      data: {
        threadId: id,
        messages: [{ id: 'u-new', role: 'user', content: 'next' }],
      },
    })
    expect(response.ok()).toBe(true)
    const body = readInspect(await response.json())

    expect(body.lastIncomingIds).toEqual(['u-new'])
    expect(body.stored.map((message) => message.id)).toEqual([
      'u1',
      'a1',
      'u-new',
      expect.any(String),
    ])
    expect(body.stored.map((message) => message.content)).toEqual([
      'one',
      'one-reply',
      'next',
      'PAGE_OK',
    ])
  })

  test('a paged client send posts only the new turn and keeps stored extras', async ({
    page,
    request,
  }) => {
    const id = threadId('paged-send')
    await seedThread(request, 'array', id, SEED)

    await page.goto(
      `/message-history-paging?threadId=${encodeURIComponent(id)}&pageSize=2`,
    )
    await expect(page.getByTestId('hydration-marker')).toBeAttached()
    await expect(page.getByTestId('painted-ids')).toHaveAttribute(
      'data-ids',
      'u3,a3',
    )

    await sendMessage(page, 'next')
    await waitForResponse(page)
    await expect(page.getByTestId('assistant-message').last()).toContainText(
      'PAGE_OK',
    )

    const body = await inspectThread(request, 'array', id)
    expect(body.lastIncomingIds).toHaveLength(1)
    expect(SEED_IDS.includes(body.lastIncomingIds[0] ?? '')).toBe(false)
    expect(body.stored.map((message) => message.id).slice(0, 6)).toEqual(
      SEED_IDS,
    )
    expect(
      body.stored.some(
        (message) => message.role === 'user' && message.content === 'next',
      ),
    ).toBe(true)
    expect(
      body.stored.some(
        (message) =>
          message.role === 'assistant' && message.content === 'PAGE_OK',
      ),
    ).toBe(true)
    expect(body.stored).toHaveLength(8)
  })
})
