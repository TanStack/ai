import { OpenAI, toFile } from 'openai'
import {
  BaseFilesAdapter,
  normalizeFileUploadInput,
} from '@tanstack/ai/adapters'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type { FileHandle, FileUploadInput } from '@tanstack/ai/adapters'
import type { FileObject, FilePurpose } from 'openai/resources/files'
import type { OpenAIClientConfig } from '../utils/client'

export interface OpenAIFilesConfig extends OpenAIClientConfig {
  /**
   * Default `purpose` for uploads. Files uploaded for vision/document input to
   * the Responses API use `'user_data'` (the flexible default). Override per
   * upload need — e.g. `'vision'` — via this config.
   * @default 'user_data'
   */
  purpose?: FilePurpose
}

/**
 * OpenAI Files adapter — uploads media to the OpenAI Files API and references
 * it by `file_id`. Pair with `openaiText()` (Responses API): reference the
 * returned handle in a message via `fileSourceFromHandle(handle)`.
 */
export class OpenAIFilesAdapter extends BaseFilesAdapter {
  readonly name = 'openai' as const
  protected client: OpenAI
  private readonly purpose: FilePurpose

  constructor(config: OpenAIFilesConfig) {
    super()
    const { purpose, ...clientOptions } = config
    this.client = new OpenAI(clientOptions)
    this.purpose = purpose ?? 'user_data'
  }

  async upload(input: FileUploadInput): Promise<FileHandle> {
    const { blob, mimeType, filename } = normalizeFileUploadInput(input)
    const file = await toFile(blob, filename, {
      ...(mimeType ? { type: mimeType } : {}),
    })
    const result = await this.client.files.create({
      file,
      purpose: this.purpose,
    })
    return toFileHandle(result)
  }

  async get(id: string): Promise<FileHandle> {
    return toFileHandle(await this.client.files.retrieve(id))
  }

  async delete(id: string): Promise<void> {
    await this.client.files.delete(id)
  }
}

function toFileHandle(file: FileObject): FileHandle {
  return {
    id: file.id,
    provider: 'openai',
    sizeBytes: file.bytes,
    filename: file.filename,
    ...(file.expires_at ? { expiresAt: file.expires_at * 1000 } : {}),
  }
}

/**
 * Create an OpenAI Files adapter with an explicit API key.
 */
export function createOpenaiFiles(
  apiKey: string,
  config?: Omit<OpenAIFilesConfig, 'apiKey'>,
): OpenAIFilesAdapter {
  return new OpenAIFilesAdapter({ apiKey, ...config })
}

/**
 * Create an OpenAI Files adapter, reading the API key from `OPENAI_API_KEY`.
 */
export function openaiFiles(
  config?: Omit<OpenAIFilesConfig, 'apiKey'>,
): OpenAIFilesAdapter {
  return createOpenaiFiles(getOpenAIApiKeyFromEnv(), config)
}
