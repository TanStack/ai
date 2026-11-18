import { describe, expect, it, vi } from 'vitest'
import { createGoogleGenAI } from '../src/client'
import * as sdk from '../src/generated/client/sdk'

// Wraps the generated operations so a test can see which one ran.
vi.mock('../src/generated/client/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof sdk>()
  return Object.fromEntries(
    Object.entries(actual).map(([name, operation]) => [name, vi.fn(operation)]),
  )
})

// The fetch client sends `generateContent` and `streamGenerateContent`
// through the Kubb operations generated from the OpenAPI document.

function client(response: () => Response) {
  vi.clearAllMocks()
  const fetchFn = vi.fn<typeof fetch>(async () => response())
  const gemini = createGoogleGenAI(
    { apiKey: 'test-key', httpOptions: { headers: { 'x-custom': 'yes' } } },
    fetchFn,
  )
  const sent = () => {
    const [url, init] = fetchFn.mock.calls[0] ?? []
    return {
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    }
  }
  return { gemini, sent }
}

const candidate = (text: string) => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] } }],
})

describe('generated Gemini client', () => {
  it('sends generateContent on the generated path and parses the JSON', async () => {
    const { gemini, sent } = client(() => Response.json(candidate('hi')))

    const result = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'hello',
    })

    const request = sent()
    expect(request.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    )
    expect(request.method).toBe('POST')
    expect(request.headers.get('x-goog-api-key')).toBe('test-key')
    expect(request.headers.get('x-custom')).toBe('yes')
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(request.body).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    })
    expect(
      sdk.geminiPostV1BetaModelsModelsidGeneratecontent,
    ).toHaveBeenCalledOnce()
    expect(result.candidates?.[0]?.content?.parts?.[0]?.text).toBe('hi')
  })

  it('streams streamGenerateContent with alt=sse and parses each event', async () => {
    const { gemini, sent } = client(
      () =>
        new Response(
          ['a', 'b']
            .map((text) => `data: ${JSON.stringify(candidate(text))}\n\n`)
            .join(''),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    )

    const stream = await gemini.models.generateContentStream({
      model: 'tunedModels/my-model',
      contents: 'hello',
    })
    const texts: Array<string | undefined> = []
    for await (const chunk of stream)
      texts.push(chunk.candidates?.[0]?.content?.parts?.[0]?.text)

    const request = sent()
    expect(request.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/tunedModels/my-model:streamGenerateContent?alt=sse',
    )
    expect(request.method).toBe('POST')
    expect(request.body).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    })
    expect(
      sdk.geminiPostV1BetaTunedmodelsTunedmodelsidStreamgeneratecontent,
    ).toHaveBeenCalledOnce()
    expect(texts).toEqual(['a', 'b'])
  })

  it('keeps the hand-written path for another API version', async () => {
    const { gemini, sent } = client(() => Response.json(candidate('hi')))

    await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'hello',
      config: { httpOptions: { apiVersion: 'v1' } },
    })

    expect(
      sdk.geminiPostV1BetaModelsModelsidGeneratecontent,
    ).not.toHaveBeenCalled()
    expect(sent().url).toBe(
      'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',
    )
  })
})
