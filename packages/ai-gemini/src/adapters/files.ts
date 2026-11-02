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
export class GeminiFilesAdapter extends BaseFilesAdapter<'gemini'> {
  readonly name = 'gemini' as const
  private readonly client: GoogleGenAI

  constructor(config: GeminiFilesConfig) {
    super()
    this.client = createGeminiClient(config)
  }

  async upload(
    input: FileUploadInput,
    options?: { abortSignal?: AbortSignal },
  ): Promise<FileHandle<'gemini'>> {
    const { blob, mimeType } = normalizeFileUploadInput(input)
    const abortSignal = options?.abortSignal
    const file = await this.client.files.upload({
      file: blob,
      ...(mimeType || abortSignal
        ? {
            config: {
              ...(mimeType ? { mimeType } : {}),
              ...(abortSignal ? { abortSignal } : {}),
            },
          }
        : {}),
    })
    return toFileHandle(file)
  }

  async get(
    id: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<FileHandle<'gemini'>> {
    return toFileHandle(
      await this.client.files.get({ name: id, ...signalConfig(options) }),
    )
  }

  async delete(
    id: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<void> {
    await this.client.files.delete({ name: id, ...signalConfig(options) })
  }
}

function toFileHandle(file: GeminiFile): FileHandle<'gemini'> {
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
  return new GeminiFilesAdapter({ ...config, apiKey })
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

/** SDK config that carries the caller's abort signal, if any. */
function signalConfig(options?: { abortSignal?: AbortSignal }) {
  return options?.abortSignal
    ? { config: { abortSignal: options.abortSignal } }
    : {}
}
