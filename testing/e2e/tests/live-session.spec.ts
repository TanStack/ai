import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

const OFFER = 'v=0 offer-e2e'

interface LiveSessionBody {
  session?: {
    instructions?: string
    delegation?: { responses?: { tools?: Array<{ name?: string }> } }
  }
  transport?: { sdp?: string }
}

/** Reads every body that the aimock `/v1/live/sessions` mount received. */
async function liveSessionBodies(
  request: APIRequestContext,
  aimockPort: number,
): Promise<Array<LiveSessionBody | null>> {
  const response = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/live/sessions/requests`,
  )
  return response.json()
}

test.describe('realtimeSession() with openaiLiveSession()', () => {
  test('relays the offer and the server options win', async ({
    request,
    aimockPort,
  }) => {
    const response = await request.post('/api/live-session', {
      data: {
        sdp: OFFER,
        config: {
          instructions: 'client',
          tools: [
            {
              name: 'getWeather',
              description: 'Get the weather',
              inputSchema: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
              },
            },
          ],
        },
      },
    })
    expect(response.status()).toBe(200)
    const answer = await response.json()
    expect(answer.sdp).toBe('v=0 answer-e2e')
    expect(answer.sessionId).toBe('sess_e2e')

    const upstream = (await liveSessionBodies(request, aimockPort))
      .filter((body) => body?.transport?.sdp === OFFER)
      .at(-1)
    expect(upstream?.session?.instructions).toBe('server wins')
    expect(
      upstream?.session?.delegation?.responses?.tools?.map((tool) => tool.name),
    ).toEqual(['getWeather'])
  })

  test('rejects a body with no sdp before any upstream call', async ({
    request,
    aimockPort,
  }) => {
    const response = await request.post('/api/live-session', {
      data: { config: {} },
    })
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toEqual(expect.any(String))
    expect(body.error.length).toBeGreaterThan(0)

    // The other test always sends an offer. A body with no offer came from here.
    const bodies = await liveSessionBodies(request, aimockPort)
    expect(bodies.filter((b) => typeof b?.transport?.sdp !== 'string')).toEqual(
      [],
    )
  })
})
