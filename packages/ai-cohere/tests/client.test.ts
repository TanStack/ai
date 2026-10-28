import { describe, expect, it } from 'vitest'
import { resolveCohereTransport } from '../src/utils/client'

describe('resolveCohereTransport', () => {
  it('defaults to api.cohere.com with no headers', () => {
    expect(resolveCohereTransport({ apiKey: 'k' })).toEqual({
      baseUrl: 'https://api.cohere.com',
      headers: {},
    })
  })

  it('maps baseURL and defaultHeaders', () => {
    expect(
      resolveCohereTransport({
        apiKey: 'k',
        baseURL: 'https://gw.example/cohere/',
        defaultHeaders: { 'cf-aig-authorization': 'Bearer t' },
      }),
    ).toEqual({
      baseUrl: 'https://gw.example/cohere',
      headers: { 'cf-aig-authorization': 'Bearer t' },
    })
  })

  it('keeps baseUrl and headers working, normalized names win', () => {
    expect(
      resolveCohereTransport({
        apiKey: 'k',
        baseUrl: 'https://old.example',
        headers: { a: '1', b: 'old' },
        baseURL: 'https://new.example',
        defaultHeaders: { b: 'new' },
      }),
    ).toEqual({
      baseUrl: 'https://new.example',
      headers: { b: 'new' },
    })
  })
})
