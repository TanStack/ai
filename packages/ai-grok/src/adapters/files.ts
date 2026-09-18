import { OpenAI, toFile } from 'openai'
import {
  BaseFilesAdapter,
  normalizeFileUploadInput,
} from '@tanstack/ai/adapters'
import { getGrokApiKeyFromEnv, withGrokDefaults } from '../utils/client'
import type { FileHandle, FileUploadInput } from '@tanstack/ai/adapters'
import type { GrokClientConfig } from '../utils/client'

/**
 * Bounds xAI accepts for a public URL's `expires_after`, in seconds:
 * one hour to thirty days.
 */
const MIN_EXPIRES_AFTER_SECONDS = 3_600
const MAX_EXPIRES_AFTER_SECONDS = 2_592_000

export interface GrokFilesConfig extends GrokClientConfig {
  /**
   * Lifetime of the generated public URL, in seconds. xAI accepts 3600
   * (one hour) to 2592000 (thirty days). Omit for a URL that does not expire.
   */
  expiresAfter?: number
}

/** Response of `POST /v1/files/{file_id}/public-url`. */
interface GrokPublicUrlResponse {
  public_url: string
  /** Epoch seconds. Absent when the URL does not expire. */
  expires_at?: number
}

/**
 * Grok (xAI) Files adapter.
 *
 * Uploads to the xAI Files API, then mints a **public URL** for the stored
 * object and uses that URL as the handle's wire reference. xAI's own
 * `file_id` form is only accepted on `input_file` (documents) and only by
 * agentic-capable models, while its image path takes a URL. A public URL
 * works for both, so one handle covers every modality and every chat model.
 *
 * Pair with `grokText()`: reference the returned handle via
 * `fileSourceFromHandle(handle)`.
 *
 * Limits xAI enforces: 50 MiB per file, and PNG, JPEG, MP4, or PDF only.
 */
export class GrokFilesAdapter extends BaseFilesAdapter<'grok'> {
  readonly name = 'grok' as const
  private readonly client: OpenAI
  private readonly expiresAfter?: number

  constructor(config: GrokFilesConfig) {
    super()
    const { expiresAfter, ...clientOptions } = config
    if (expiresAfter !== undefined) {
      if (
        !Number.isInteger(expiresAfter) ||
        expiresAfter < MIN_EXPIRES_AFTER_SECONDS ||
        expiresAfter > MAX_EXPIRES_AFTER_SECONDS
      ) {
        throw new Error(
          `grok: expiresAfter must be a whole number of seconds between ` +
            `${MIN_EXPIRES_AFTER_SECONDS} and ${MAX_EXPIRES_AFTER_SECONDS} ` +
            `(received ${expiresAfter}).`,
        )
      }
    }
    this.client = new OpenAI(withGrokDefaults(clientOptions))
    this.expiresAfter = expiresAfter
  }

  async upload(input: FileUploadInput): Promise<FileHandle<'grok'>> {
    const { blob, mimeType, filename } = normalizeFileUploadInput(input)
    const file = await toFile(blob, filename, {
      ...(mimeType ? { type: mimeType } : {}),
    })
    const uploaded = await this.client.files.create({
      file,
      purpose: 'assistants',
    })

    // Minting the public URL is idempotent: asking again for a file that
    // already has one returns the same URL.
    const publicUrl = await this.client.post<GrokPublicUrlResponse>(
      `/files/${uploaded.id}/public-url`,
      {
        body:
          this.expiresAfter !== undefined
            ? { expires_after: this.expiresAfter }
            : {},
      },
    )
    if (!publicUrl.public_url) {
      throw new Error(
        `grok: files/${uploaded.id}/public-url returned no public_url, so ` +
          `the handle has no wire reference.`,
      )
    }

    return {
      id: uploaded.id,
      provider: 'grok',
      uri: publicUrl.public_url,
      ...(mimeType ? { mimeType } : {}),
      ...(uploaded.bytes !== undefined ? { sizeBytes: uploaded.bytes } : {}),
      ...(uploaded.filename ? { filename: uploaded.filename } : {}),
      ...(publicUrl.expires_at
        ? { expiresAt: publicUrl.expires_at * 1000 }
        : {}),
    }
  }

  async get(id: string): Promise<FileHandle<'grok'>> {
    const file = await this.client.files.retrieve(id)
    // `retrieve` reports the stored object, not its public URL. Re-minting is
    // idempotent, so this returns the URL the upload already created.
    const publicUrl = await this.client.post<GrokPublicUrlResponse>(
      `/files/${id}/public-url`,
      { body: {} },
    )
    return {
      id: file.id,
      provider: 'grok',
      ...(publicUrl.public_url ? { uri: publicUrl.public_url } : {}),
      ...(file.bytes !== undefined ? { sizeBytes: file.bytes } : {}),
      ...(file.filename ? { filename: file.filename } : {}),
      ...(publicUrl.expires_at
        ? { expiresAt: publicUrl.expires_at * 1000 }
        : {}),
    }
  }

  async delete(id: string): Promise<void> {
    await this.client.files.delete(id)
  }

  /**
   * Revoke a file's public URL without deleting the file. The handle's `uri`
   * stops resolving; the stored object and its `id` survive.
   */
  async revokePublicUrl(id: string): Promise<void> {
    await this.client.post(`/files/${id}/public-url/revoke`, { body: {} })
  }
}

/**
 * Create a Grok Files adapter with an explicit API key.
 */
export function createGrokFiles(
  apiKey: string,
  config?: Omit<GrokFilesConfig, 'apiKey'>,
): GrokFilesAdapter {
  return new GrokFilesAdapter({ apiKey, ...config })
}

/**
 * Create a Grok Files adapter, reading the API key from `XAI_API_KEY`.
 */
export function grokFiles(
  config?: Omit<GrokFilesConfig, 'apiKey'>,
): GrokFilesAdapter {
  return createGrokFiles(getGrokApiKeyFromEnv(), config)
}
