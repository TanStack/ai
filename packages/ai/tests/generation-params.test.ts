import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  generationParamsFromBody,
  generationParamsFromRequest,
} from '../src/client'

describe('generation params helpers', () => {
  it('extracts envelope data and forwarded props separately', () => {
    const params = generationParamsFromBody('image', {
      data: { prompt: 'draw a mountain' },
      forwardedProps: { tenantId: 'acme' },
      threadId: 'thread-1',
      runId: 'run-1',
    })

    expect(params).toEqual({
      input: { prompt: 'draw a mountain' },
      forwardedProps: { tenantId: 'acme' },
      threadId: 'thread-1',
      runId: 'run-1',
    })
  })

  it('throws when an envelope is missing data', () => {
    expect(() =>
      generationParamsFromBody('audio', {
        forwardedProps: { tenantId: 'acme' },
      }),
    ).toThrow(/data/)
  })

  it('treats non-envelope bodies as raw input with empty forwarded props', () => {
    const params = generationParamsFromBody('tts', {
      text: 'hello',
      threadId: 'raw-thread',
    })

    expect(params).toEqual({
      input: {
        text: 'hello',
        threadId: 'raw-thread',
      },
      forwardedProps: {},
    })
  })

  it('treats valid raw input with incidental data as raw input', () => {
    const body = {
      prompt: 'draw a mountain',
      data: { traceId: 'trace-1' },
    }

    expect(generationParamsFromBody('image', body)).toEqual({
      input: body,
      forwardedProps: {},
    })
  })

  it('treats valid raw input with incidental forwarded props as raw input', () => {
    const body = {
      prompt: 'draw a mountain',
      forwardedProps: { ignored: true },
    }

    expect(generationParamsFromBody('image', body)).toEqual({
      input: body,
      forwardedProps: {},
    })
  })

  it('extracts identity only from envelopes', () => {
    const raw = generationParamsFromBody('video', {
      prompt: 'launch',
      runId: 'raw-run',
    })
    const envelope = generationParamsFromBody('video', {
      data: { prompt: 'launch' },
      runId: 'envelope-run',
    })

    expect(raw).toEqual({
      input: { prompt: 'launch', runId: 'raw-run' },
      forwardedProps: {},
    })
    expect(envelope.runId).toBe('envelope-run')
  })

  it('throws when envelope forwarded props are not an object', () => {
    expect(() =>
      generationParamsFromBody('image', {
        data: { prompt: 'draw a mountain' },
        forwardedProps: 'invalid',
      }),
    ).toThrow(/forwardedProps/)
  })

  it('throws when envelope identity fields are not strings', () => {
    expect(() =>
      generationParamsFromBody('image', {
        data: { prompt: 'draw a mountain' },
        threadId: 123,
      }),
    ).toThrow(/threadId/)
    expect(() =>
      generationParamsFromBody('image', {
        data: { prompt: 'draw a mountain' },
        runId: 123,
      }),
    ).toThrow(/runId/)
  })

  it('parses request JSON before extracting params', async () => {
    const request = new Request('https://example.test/generate', {
      method: 'POST',
      body: JSON.stringify({
        data: { audio: 'base64-audio' },
        forwardedProps: { locale: 'en' },
      }),
    })

    await expect(
      generationParamsFromRequest('transcription', request),
    ).resolves.toEqual({
      input: { audio: 'base64-audio' },
      forwardedProps: { locale: 'en' },
    })
  })

  it('throws a clear error for malformed request JSON', async () => {
    const request = new Request('https://example.test/generate', {
      method: 'POST',
      body: '{',
    })

    await expect(generationParamsFromRequest('image', request)).rejects.toThrow(
      /Invalid JSON request body/,
    )
  })

  it('throws a clear error for non-object request JSON', async () => {
    const request = new Request('https://example.test/generate', {
      method: 'POST',
      body: JSON.stringify(null),
    })

    await expect(generationParamsFromRequest('image', request)).rejects.toThrow(
      /JSON object/,
    )
  })

  it('narrows input by generation kind', () => {
    const image = generationParamsFromBody('image', {
      data: { prompt: 'draw a mountain' },
    })
    const speech = generationParamsFromBody('tts', {
      data: { text: 'hello' },
    })

    expectTypeOf(image.input).toHaveProperty('prompt')
    expectTypeOf(speech.input).toHaveProperty('text')

    if (false) {
      // @ts-expect-error tts input is not image input
      expectTypeOf(speech.input).toHaveProperty('prompt')

      // @ts-expect-error kind is required
      generationParamsFromBody({ data: { prompt: 'draw a mountain' } })
    }
  })
})
