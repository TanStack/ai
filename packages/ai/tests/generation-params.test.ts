import { describe, expect, it } from 'vitest'
import {
  generationParamsFromBody,
  generationParamsFromRequest,
} from '../src/client'

describe('generationParamsFromBody', () => {
  it('reads the input from the forwardedProps of a RunAgentInput envelope', () => {
    const params = generationParamsFromBody('image', {
      threadId: 'thread-1',
      runId: 'run-1',
      state: {},
      messages: [],
      tools: [],
      context: [],
      forwardedProps: { prompt: 'A red fox', numberOfImages: 2 },
    })

    expect(params).toEqual({
      input: { prompt: 'A red fox', numberOfImages: 2 },
      forwardedProps: { prompt: 'A red fox', numberOfImages: 2 },
      threadId: 'thread-1',
      runId: 'run-1',
    })
  })

  it('does not read the input from a data field', () => {
    expect(() =>
      generationParamsFromBody('image', {
        threadId: 'thread-1',
        runId: 'run-1',
        forwardedProps: {},
        data: { prompt: 'A red fox' },
      }),
    ).toThrow('Generation image input must include prompt.')
  })

  it('rejects an envelope whose forwardedProps is not an object', () => {
    expect(() =>
      generationParamsFromBody('image', {
        threadId: 'thread-1',
        runId: 'run-1',
        forwardedProps: 'A red fox',
      }),
    ).toThrow('Generation request forwardedProps must be an object.')
  })

  it.each([
    ['no threadId', { forwardedProps: { prompt: 'A red fox' } }],
    [
      'an empty threadId',
      { threadId: '', forwardedProps: { prompt: 'A red fox' } },
    ],
    ['a bare input body', { prompt: 'A red fox' }],
  ])('rejects %s', (_case, body) => {
    expect(() => generationParamsFromBody('image', body)).toThrow(
      'Generation request needs a threadId.',
    )
  })

  it('rejects a body with no runId', () => {
    expect(() =>
      generationParamsFromBody('image', {
        threadId: 'thread-1',
        forwardedProps: { prompt: 'A red fox' },
      }),
    ).toThrow('Generation request needs a runId.')
  })
})

describe('generationParamsFromRequest', () => {
  it('reads a speech envelope from a request', async () => {
    const request = new Request('http://localhost/api/speech', {
      method: 'POST',
      body: JSON.stringify({
        threadId: 'thread-2',
        runId: 'run-2',
        forwardedProps: { text: 'Hello', voice: 'alloy' },
      }),
    })

    const params = await generationParamsFromRequest('tts', request)

    expect(params.input).toEqual({ text: 'Hello', voice: 'alloy' })
    expect(params.threadId).toBe('thread-2')
    expect(params.runId).toBe('run-2')
  })
})
