import { test, expect } from './fixtures'

/**
 * `@tanstack/ai-effect` against aimock. The route runs `AI.chat` with an
 * Effect tool that reads a `Weather` service from a `Layer`, and
 * `AI.generateImage` as an Effect. Fixtures: `fixtures/effect-chat/basic.json`.
 */

const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNgYPgPAAEDAQA2dBFAAAAAAElFTkSuQmCC'

type WireEvent = {
  type: string
  delta?: string
  content?: string
}

function eventsOf(sse: string): Array<WireEvent> {
  return sse
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)))
}

function routeUrl(testId: string, aimockPort: number, kind?: 'image') {
  const params = new URLSearchParams({
    testId,
    aimockPort: String(aimockPort),
  })
  if (kind) params.set('kind', kind)
  return `/api/effect-chat?${params}`
}

test.describe('ai-effect', () => {
  test('chat runs the Effect tool with the Layer service and streams the answer', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const res = await request.post(routeUrl(testId, aimockPort))
    expect(res.ok()).toBe(true)

    const events = eventsOf(await res.text())
    const toolResult = events.find((event) => event.type === 'TOOL_CALL_RESULT')
    expect(JSON.parse(toolResult?.content ?? 'null')).toEqual({
      forecast: 'Sunny and 21C in Oslo',
    })

    const text = events
      .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
      .map((event) => event.delta)
      .join('')
    expect(text).toBe('Pack sunglasses for Oslo.')
    expect(events.at(-1)?.type).toBe('RUN_FINISHED')
  })

  test('generateImage returns the image as JSON', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const res = await request.post(routeUrl(testId, aimockPort, 'image'))
    expect(res.ok()).toBe(true)

    const result: { images: Array<{ b64Json?: string }> } = await res.json()
    expect(result.images).toEqual([
      expect.objectContaining({ b64Json: PIXEL_PNG }),
    ])
  })
})
