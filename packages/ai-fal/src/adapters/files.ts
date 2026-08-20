import { fal } from '@fal-ai/client'
import {
  BaseFilesAdapter,
  normalizeFileUploadInput,
} from '@tanstack/ai/adapters'
import { configureFalClient } from '../utils/client'
import type { StorageSettings } from '@fal-ai/client'
import type { FileHandle, FileUploadInput } from '@tanstack/ai/adapters'
import type { FalClientConfig } from '../utils/client'

export interface FalFilesConfig extends FalClientConfig {
  /**
   * Optional lifecycle for uploaded objects — one of fal's presets
   * (`'1h' | '1d' | '7d' | '30d' | '1y' | 'never' | 'immediate'`) or a number
   * of seconds. Applied as the object's `X-Fal-Object-Lifecycle-Preference`.
   */
  expiresIn?: StorageSettings['expiresIn']
}

/**
 * fal Files adapter — uploads media to fal storage via `fal.storage.upload`.
 * The handle is a storage URL, so `fileSourceFromHandle(handle)` references it
 * as a normal URL (fal endpoints accept it directly). Upload-only: fal storage
 * has no retrieval/deletion API, so `get`/`delete` are unavailable.
 */
export class FalFilesAdapter extends BaseFilesAdapter {
  readonly name = 'fal' as const
  private readonly expiresIn?: StorageSettings['expiresIn']

  constructor(config?: FalFilesConfig) {
    super()
    configureFalClient(config)
    this.expiresIn = config?.expiresIn
  }

  async upload(input: FileUploadInput): Promise<FileHandle> {
    const { blob, mimeType } = normalizeFileUploadInput(input)
    const url = await fal.storage.upload(
      blob,
      this.expiresIn ? { lifecycle: { expiresIn: this.expiresIn } } : undefined,
    )
    return {
      id: url,
      provider: 'fal',
      uri: url,
      ...(mimeType ? { mimeType } : {}),
    }
  }
}

/**
 * Create a fal Files adapter. Reads the API key from `FAL_KEY` unless one is
 * provided in `config`.
 */
export function falFiles(config?: FalFilesConfig): FalFilesAdapter {
  return new FalFilesAdapter(config)
}
