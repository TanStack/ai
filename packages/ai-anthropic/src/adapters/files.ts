import { toFile } from '@anthropic-ai/sdk'
import {
  BaseFilesAdapter,
  normalizeFileUploadInput,
} from '@tanstack/ai/adapters'
import {
  createAnthropicClient,
  getAnthropicCredentialFromEnv,
} from '../utils/client'
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
export class AnthropicFilesAdapter extends BaseFilesAdapter<'anthropic'> {
  readonly name = 'anthropic' as const
  private readonly client: Anthropic_SDK

  constructor(config: AnthropicFilesConfig) {
    super()
    this.client = createAnthropicClient(config)
  }

  async upload(input: FileUploadInput): Promise<FileHandle<'anthropic'>> {
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

  async get(id: string): Promise<FileHandle<'anthropic'>> {
    const result = await this.client.beta.files.retrieveMetadata(id, {
      betas: [FILES_API_BETA],
    })
    return toFileHandle(result)
  }

  async delete(id: string): Promise<void> {
    await this.client.beta.files.delete(id, { betas: [FILES_API_BETA] })
  }
}

function toFileHandle(file: FileMetadata): FileHandle<'anthropic'> {
  return {
    id: file.id,
    provider: 'anthropic',
    mimeType: file.mime_type,
    sizeBytes: file.size_bytes,
    filename: file.filename,
  }
}

/**
 * Create an Anthropic Files adapter with an explicit credential. It reads no
 * credential from the environment. `config.auth` picks how it goes out.
 */
export function createAnthropicFiles(
  apiKey: string,
  config?: Omit<AnthropicFilesConfig, 'apiKey'>,
): AnthropicFilesAdapter {
  return new AnthropicFilesAdapter({ ...config, apiKey })
}

/**
 * Create an Anthropic Files adapter with the credential from the environment:
 * `ANTHROPIC_AUTH_TOKEN`, then `ANTHROPIC_OAUTH_TOKEN`, then
 * `ANTHROPIC_API_KEY`. A `config.auth` wins over the detected kind.
 */
export function anthropicFiles(
  config?: Omit<AnthropicFilesConfig, 'apiKey'>,
): AnthropicFilesAdapter {
  const { credential, auth } = getAnthropicCredentialFromEnv()
  return createAnthropicFiles(credential, {
    ...config,
    auth: config?.auth ?? auth,
  })
}
