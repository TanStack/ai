import type { ProviderId } from '@tanstack/ai/byok'

export type Keyring = Partial<Record<ProviderId, string>>
export type KeyPreview = Partial<Record<ProviderId, string>>

export interface KeyringStorage {
  readonly id: string
  readonly label: string
  readonly persistent: boolean
  readonly unlockable?: boolean
  readonly warning?: string
  peek?: () => KeyPreview | Promise<KeyPreview>
  load: () => Keyring | Promise<Keyring>
  save: (keys: Keyring) => void | Promise<void>
  clear: () => void | Promise<void>
}

export function memoryStorage(): KeyringStorage {
  return {
    id: 'memory',
    label: 'Session only (not saved)',
    persistent: false,
    load: () => ({}),
    save: () => {},
    clear: () => {},
  }
}
