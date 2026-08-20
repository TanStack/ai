import {
  BaseFilesAdapter,
  normalizeFileUploadInput,
} from '@tanstack/ai/adapters'
import { createGeminiClient, getGeminiApiKeyFromEnv } from '../utils/client'
import type { File as GeminiFile, GoogleGenAI } from '@google/genai'
import type { FileHandle, FileUploadInput } from '@tanstack/ai/adapters'
import type { GeminiClientConfig } from '../utils/client'

export interface GeminiFilesConfig extends GeminiClientConfig {}

/**
 * Gemini Files adapter — uploads media to the Gemini Files API and references
 * it by its file URI. Pair with `geminiText()` / `geminiImage()`: reference the
 * returned handle via `fileSourceFromHandle(handle)`, which uses the handle URI
 * (Gemini fetches it server-side as `fileData.fileUri`).
 */
export class GeminiFilesAdapter extends BaseFilesAdapter {
  readonly name = 'gemini' as const
  private readonly client: GoogleGenAI

  constructor(config: GeminiFilesConfig) {
    super()
    this.client = createGeminiClient(config)
  }

  async upload(input: FileUploadInput): Promise<FileHandle> {
    const { blob, mimeType } = normalizeFileUploadInput(input)
    const file = await this.client.files.upload({
      file: blob,
      ...(mimeType ? { config: { mimeType } } : {}),
    })
    return toFileHandle(file)
  }

  async get(id: string): Promise<FileHandle> {
    return toFileHandle(await this.client.files.get({ name: id }))
  }

  async delete(id: string): Promise<void> {
    await this.client.files.delete({ name: id })
  }
}

function toFileHandle(file: GeminiFile): FileHandle {
  // `name` (e.g. "files/abc-123") is the lifecycle id; `uri` is the URL Gemini
  // fetches when the handle is referenced in a message.
  if (!file.name) {
    throw new Error('gemini: files.upload returned a file without a name')
  }
  const expiresAt = file.expirationTime
    ? Date.parse(file.expirationTime)
    : undefined
  return {
    id: file.name,
    provider: 'gemini',
    ...(file.uri ? { uri: file.uri } : {}),
    ...(file.mimeType ? { mimeType: file.mimeType } : {}),
    ...(file.sizeBytes ? { sizeBytes: Number(file.sizeBytes) } : {}),
    ...(expiresAt !== undefined && !Number.isNaN(expiresAt)
      ? { expiresAt }
      : {}),
  }
}

/**
 * Create a Gemini Files adapter with an explicit API key.
 */
export function createGeminiFiles(
  apiKey: string,
  config?: Omit<GeminiFilesConfig, 'apiKey'>,
): GeminiFilesAdapter {
  return new GeminiFilesAdapter({ apiKey, ...config })
}

/**
 * Create a Gemini Files adapter, reading the API key from `GOOGLE_API_KEY` /
 * `GEMINI_API_KEY`.
 */
export function geminiFiles(
  config?: Omit<GeminiFilesConfig, 'apiKey'>,
): GeminiFilesAdapter {
  return createGeminiFiles(getGeminiApiKeyFromEnv(), config)
}
