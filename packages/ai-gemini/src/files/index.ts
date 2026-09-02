import { FileState } from '@google/genai'
import { createGeminiClient, getGeminiApiKeyFromEnv } from '../utils'
import type { GeminiVideoMetadata } from '../message-types'
import type { VideoPart } from '@tanstack/ai'

/**
 * A file uploaded to the Gemini Files API and ready to reference in a message.
 */
export interface GeminiUploadedFile {
  /** Resource name, e.g. `"files/abc123"`. */
  name: string
  /** File URI to reference from message content (as a `url` source). */
  uri: string
  /** MIME type reported by the Files API. */
  mimeType: string
}

/**
 * Options for {@link uploadGeminiFile}.
 */
export interface GeminiUploadFileOptions {
  /**
   * API key. Falls back to `GOOGLE_API_KEY` / `GEMINI_API_KEY` from the
   * environment when omitted.
   */
  apiKey?: string
  /**
   * MIME type of the file (e.g. `"video/mp4"`). Recommended so the Files API
   * processes and serves the file with the correct type.
   */
  mimeType?: string
  /** Poll interval while the file is `PROCESSING`, in ms. Default `5000`. */
  pollIntervalMs?: number
  /** Max time to wait for processing, in ms. Default `300000` (5 min). */
  timeoutMs?: number
}

/**
 * Upload a file via the Gemini Files API and wait until it is `ACTIVE`.
 *
 * Large media (notably video) must be uploaded rather than inlined as base64;
 * the Files API processes uploads asynchronously. This wraps the upload +
 * poll-until-ready loop and returns a reference you can drop into message
 * content as a `url` source (see {@link geminiVideoPart}).
 *
 * @throws if the upload has no URI, or processing fails or times out.
 */
export async function uploadGeminiFile(
  file: string | Blob,
  options: GeminiUploadFileOptions = {},
): Promise<GeminiUploadedFile> {
  const {
    apiKey = getGeminiApiKeyFromEnv(),
    mimeType,
    pollIntervalMs = 5000,
    timeoutMs = 300_000,
  } = options

  const client = createGeminiClient({ apiKey })

  let uploaded = await client.files.upload({
    file,
    ...(mimeType && { config: { mimeType } }),
  })

  const fileName = uploaded.name
  if (!fileName) {
    throw new Error('Gemini file upload did not return a file name.')
  }

  const deadline = Date.now() + timeoutMs
  while (uploaded.state === FileState.PROCESSING) {
    if (Date.now() > deadline) {
      throw new Error(
        `Gemini file processing timed out after ${timeoutMs}ms (${fileName}).`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    uploaded = await client.files.get({ name: fileName })
  }

  if (uploaded.state === FileState.FAILED) {
    throw new Error(
      `Gemini file processing failed: ${uploaded.error?.message ?? String(uploaded.state)}`,
    )
  }
  if (!uploaded.uri) {
    throw new Error('Gemini file upload did not return a URI.')
  }

  return {
    name: fileName,
    uri: uploaded.uri,
    mimeType: uploaded.mimeType ?? mimeType ?? 'application/octet-stream',
  }
}

/**
 * Build a TanStack AI video content part from an uploaded Gemini file.
 *
 * Pass `metadata` to control understanding — e.g.
 * `{ processing: 'agentic' }` to route through the agentic Interactions path,
 * or `{ fps, startOffset, endOffset }` for single-pass sampling controls.
 */
export function geminiVideoPart(
  file: GeminiUploadedFile,
  metadata?: GeminiVideoMetadata,
): VideoPart<GeminiVideoMetadata> {
  return {
    type: 'video',
    source: { type: 'url', value: file.uri, mimeType: file.mimeType },
    ...(metadata && { metadata }),
  }
}
