// `files.upload` of @google/genai 2.10.0 for a Blob. Loaded on the first
// upload, so the text adapters do not bundle it.
import type { ApiClient } from './api'
import type { File as GeminiFile, UploadFileParameters } from '@google/genai'

const MAX_CHUNK_SIZE = 8 * 1024 * 1024
const UPLOAD_STATUS_HEADER = 'x-goog-upload-status'
/** Waits `ms`. Rejects with the abort reason when `signal` aborts first. */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

/**
 * Port of `ApiClient.uploadFile` + `uploadBlob` for a Blob: a resumable
 * upload in chunks of 8 MiB.
 */
export async function uploadBlob(
  api: ApiClient,
  file: Blob,
  config: UploadFileParameters['config'],
) {
  const name =
    config?.name && !config.name.startsWith('files/')
      ? `files/${config.name}`
      : config?.name
  const mimeType = config?.mimeType ?? file.type
  if (!mimeType) {
    throw new Error(
      'Can not determine mimeType. Please provide mimeType in the config.',
    )
  }
  const sizeBytes = String(file.size)
  const start = await api.request({
    path: 'upload/v1beta/files',
    method: 'POST',
    abortSignal: config?.abortSignal,
    body: JSON.stringify({
      file: { mimeType, name, displayName: config?.displayName, sizeBytes },
    }),
    httpOptions: config?.httpOptions ?? {
      apiVersion: '',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': sizeBytes,
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
    },
  })
  const uploadUrl = start.headers.get('x-goog-upload-url')
  if (uploadUrl === null) {
    throw new Error(
      'Failed to get upload url. Server did not return the x-google-upload-url in the headers',
    )
  }
  // The SDK sends the upload to the host of the client base URL.
  const finalUrl = new URL(uploadUrl)
  const baseUrl = new URL(api.httpOptions.baseUrl ?? uploadUrl)
  finalUrl.protocol = baseUrl.protocol
  finalUrl.host = baseUrl.host
  finalUrl.port = baseUrl.port

  let response = new Response()
  for (let offset = 0; offset < file.size;) {
    const chunkSize = Math.min(MAX_CHUNK_SIZE, file.size - offset)
    const isLast = offset + chunkSize >= file.size
    for (let attempt = 0, delay = 1000; attempt < 3; attempt++) {
      response = await api.request({
        path: '',
        method: 'POST',
        abortSignal: config?.abortSignal,
        body: file.slice(offset, offset + chunkSize),
        httpOptions: {
          apiVersion: '',
          baseUrl: finalUrl.toString(),
          headers: {
            'X-Goog-Upload-Command': isLast ? 'upload, finalize' : 'upload',
            'X-Goog-Upload-Offset': String(offset),
            'Content-Length': String(chunkSize),
          },
        },
      })
      if (response.headers.get(UPLOAD_STATUS_HEADER)) break
      await sleep(delay, config?.abortSignal)
      delay *= 2
    }
    offset += chunkSize
    if (response.headers.get(UPLOAD_STATUS_HEADER) !== 'active') break
    if (file.size <= offset) {
      throw new Error(
        'All content has been uploaded, but the upload status is not finalized.',
      )
    }
  }
  const result: { file: GeminiFile } = await response.json()
  if (response.headers.get(UPLOAD_STATUS_HEADER) !== 'final') {
    throw new Error('Failed to upload file: Upload status is not finalized.')
  }
  return result.file
}
