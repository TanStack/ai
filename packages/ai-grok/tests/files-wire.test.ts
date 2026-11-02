import { describe, expect, it } from 'vitest'
import { GrokFilesAdapter } from '../src/adapters/files'

interface SentRequest {
  method: string
  url: string
  authorization: string | null
  form?: FormData
  json?: unknown
}

/**
 * Runs the adapter against a fake `fetch`. The fake answers the upload with a
 * stored file and every other call with a public URL. Gives back the sent
 * requests.
 */
function adapterWithFakeFetch(expiresAfter?: number) {
  const sent: Array<SentRequest> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const isUpload = request.url.endsWith('/files')
    sent.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.get('authorization'),
      ...(isUpload
        ? { form: await request.formData() }
        : { json: await request.json() }),
    })
    const body = isUpload
      ? { id: 'file_1', bytes: 4, filename: 'chart.png' }
      : { public_url: 'https://files-cdn.x.ai/u/1' }
    return Response.json(body)
  }
  const adapter = new GrokFilesAdapter({
    apiKey: 'test-key',
    fetch,
    ...(expiresAfter !== undefined ? { expiresAfter } : {}),
  })
  return { adapter, sent }
}

describe('grok files wire', () => {
  it('uploads the file as multipart, then mints its public URL', async () => {
    const { adapter, sent } = adapterWithFakeFetch(86_400)

    const handle = await adapter.upload({
      data: 'AAAA',
      mimeType: 'image/png',
      filename: 'chart.png',
    })

    expect(handle.uri).toBe('https://files-cdn.x.ai/u/1')
    expect(sent.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'POST https://api.x.ai/v1/files',
      'POST https://api.x.ai/v1/files/file_1/public-url',
    ])
    expect(sent.map((request) => request.authorization)).toEqual([
      'Bearer test-key',
      'Bearer test-key',
    ])
    const file = sent[0]?.form?.get('file')
    expect(file).toBeInstanceOf(File)
    expect(file instanceof File && [file.name, file.type, file.size]).toEqual([
      'chart.png',
      'image/png',
      3,
    ])
    expect(sent[0]?.form?.get('purpose')).toBe('assistants')
    expect(sent[1]?.json).toEqual({ expires_after: 86_400 })
  })

  it('revokes a public URL with an empty JSON body', async () => {
    const { adapter, sent } = adapterWithFakeFetch()

    await adapter.revokePublicUrl('file_1')

    expect(sent).toEqual([
      {
        method: 'POST',
        url: 'https://api.x.ai/v1/files/file_1/public-url/revoke',
        authorization: 'Bearer test-key',
        json: {},
      },
    ])
  })
})
