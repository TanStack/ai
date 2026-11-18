import { describe, expect, it, vi } from 'vitest'
import { createCohereClient } from '../src/client'

type Call = [url: string, init: RequestInit]

describe('generated Cohere client', () => {
  it('sends an embed request to the generated /v2/embed path', async () => {
    const fetcher = vi
      .fn<(...args: Call) => Promise<Response>>()
      .mockResolvedValue(
        Response.json({
          id: 'e-1',
          embeddings: { float: [[0.1, 0.2]] },
          meta: { billed_units: { input_tokens: 3 } },
        }),
      )
    const controller = new AbortController()
    const result = await createCohereClient(
      {
        apiKey: 'k',
        baseURL: 'https://gw.example/cohere/',
        defaultHeaders: { 'X-Gateway': 'g' },
      },
      fetcher,
    ).embed(
      {
        model: 'embed-v4.0',
        inputs: [
          {
            content: [
              { type: 'text', text: 'hi' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,AA' },
              },
            ],
          },
        ],
        input_type: 'search_document',
        embedding_types: ['float'],
        output_dimension: 256,
      },
      controller.signal,
    )

    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://gw.example/cohere/v2/embed')
    expect(init.method).toBe('POST')
    expect(init.signal).toBe(controller.signal)
    expect(init.headers).toEqual({
      Authorization: 'Bearer k',
      'Content-Type': 'application/json',
      'X-Gateway': 'g',
    })
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'embed-v4.0',
      inputs: [
        {
          content: [
            { type: 'text', text: 'hi' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AA' },
            },
          ],
        },
      ],
      input_type: 'search_document',
      embedding_types: ['float'],
      output_dimension: 256,
    })
    expect(result.embeddings.float).toEqual([[0.1, 0.2]])
  })

  it('throws the Cohere error message for a non-2xx response', async () => {
    const fetcher = vi
      .fn<(...args: Call) => Promise<Response>>()
      .mockResolvedValue(
        Response.json({ message: 'invalid api token' }, { status: 401 }),
      )
    await expect(
      createCohereClient({ apiKey: 'k' }, fetcher).embed({
        model: 'embed-v4.0',
        input_type: 'search_query',
        texts: ['hi'],
      }),
    ).rejects.toThrow('Cohere embed failed (401): invalid api token')
    expect(fetcher.mock.calls[0]![0]).toBe('https://api.cohere.com/v2/embed')
  })
})
