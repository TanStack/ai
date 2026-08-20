import { toFile } from '@anthropic-ai/sdk'
import {
  BaseFilesAdapter,
  normalizeFileUploadInput,
} from '@tanstack/ai/adapters'
import { createAnthropicClient, getAnthropicApiKeyFromEnv } from '../utils/client'
import type Anthropic_SDK from '@anthropic-ai/sdk'
import type { FileMetadata } from '@anthropic-ai/sdk/resources/beta/files'
import type { FileHandle, FileUploadInput } from '@tanstack/ai/adapters'
import type { AnthropicClientConfig } from '../utils/client'

/** Beta header required for the Anthropic Files API. */
const FILES_API_BETA = 'files-api-2025-04-14'

export interface AnthropicFilesConfig extends AnthropicClientConfig {}

/**
 * Anthropic Files adapter — uploads media to the Anthropic Files API (beta) and
 * references it by `file_id`. Pair with `anthropicText()`: reference the
 * returned handle in an image/document message via `fileSourceFromHandle`.
 */
export class AnthropicFilesAdapter extends BaseFilesAdapter {
  readonly name = 'anthropic' as const
  private readonly client: Anthropic_SDK

  constructor(config: AnthropicFilesConfig) {
    super()
    this.client = createAnthropicClient(config)
  }

  async upload(input: FileUploadInput): Promise<FileHandle> {
    const { blob, mimeType, filename } = normalizeFileUploadInput(input)
    const file = await toFile(blob, filename, {
      ...(mimeType ? { type: mimeType } : {}),
    })
    const result = await this.client.beta.files.upload({
      file,
      betas: [FILES_API_BETA],
    })
    return toFileHandle(result)
  }

  async get(id: string): Promise<FileHandle> {
    const result = await this.client.beta.files.retrieveMetadata(id, {
      betas: [FILES_API_BETA],
    })
    return toFileHandle(result)
  }

  async delete(id: string): Promise<void> {
    await this.client.beta.files.delete(id, { betas: [FILES_API_BETA] })
  }
}

function toFileHandle(file: FileMetadata): FileHandle {
  return {
    id: file.id,
    provider: 'anthropic',
    mimeType: file.mime_type,
    sizeBytes: file.size_bytes,
    filename: file.filename,
  }
}

/**
 * Create an Anthropic Files adapter with an explicit API key.
 */
export function createAnthropicFiles(
  apiKey: string,
  config?: Omit<AnthropicFilesConfig, 'apiKey'>,
): AnthropicFilesAdapter {
  return new AnthropicFilesAdapter({ apiKey, ...config })
}

/**
 * Create an Anthropic Files adapter, reading the API key from `ANTHROPIC_API_KEY`.
 */
export function anthropicFiles(
  config?: Omit<AnthropicFilesConfig, 'apiKey'>,
): AnthropicFilesAdapter {
  return createAnthropicFiles(getAnthropicApiKeyFromEnv(), config)
}
