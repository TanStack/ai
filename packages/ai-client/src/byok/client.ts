import {
  ByokBlockedError,
  byokHeaderName,
  byokValidateMap,
  isProviderId,
  maskKey,
} from '@tanstack/ai/byok'
import { memoryStorage } from './storage'
import type {
  ByokProvider,
  ProviderId,
  ProviderValidateConfig,
} from '@tanstack/ai/byok'
import type { Keyring, KeyringStorage } from './storage'

export type KeyStatus =
  | { state: 'empty' }
  | { state: 'set'; masked: string }
  | { state: 'locked'; masked: string }
  | { state: 'validating'; masked: string }
  | { state: 'valid'; masked: string }
  | { state: 'invalid'; masked: string }
  | { state: 'error'; masked: string; message: string }

export type ByokPrompt = {
  provider: ProviderId
  reason: 'missing' | 'locked' | 'invalid'
}

export type ByokSnapshot = {
  status: Partial<Record<string, KeyStatus>>
  locked: boolean
  prompt: ByokPrompt | null
  storageError: string | null
}

export type ValidationStatus = 'valid' | 'invalid' | 'unsupported'

export interface DefineByokOptions {
  storage?: KeyringStorage
  /**
   * Adapter-exported {@link ByokProvider} objects. Each one must have an `id`
   * slug. Their `validate` entries are used unless `validate` overrides them.
   */
  providers?: ReadonlyArray<ByokProvider>
  /**
   * Optional per-provider key checks. Ids without an entry stay `set`
   * (no network). Wins over `providers` for the same slug.
   */
  validate?: Readonly<Record<string, ProviderValidateConfig>>
}

const EMPTY: KeyStatus = { state: 'empty' }

export const EMPTY_BYOK_SNAPSHOT: ByokSnapshot = {
  status: {},
  locked: false,
  prompt: null,
  storageError: null,
}

function requireProviderId(value: string): ProviderId {
  if (!isProviderId(value)) {
    throw new Error(`Invalid BYOK provider id: ${value}`)
  }
  return value
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : fallback
}

function isByokCeremonyCancel(error: unknown): boolean {
  if (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'NotAllowedError'
  ) {
    return true
  }
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError') return true
    const message = error.message.toLowerCase()
    return message.includes('cancelled') || message.includes('not allowed')
  }
  return false
}

function sanitizeKeyring(value: unknown): Keyring {
  if (typeof value !== 'object' || value === null) return {}
  const keys: Keyring = {}
  for (const [provider, key] of Object.entries(value)) {
    if (isProviderId(provider) && typeof key === 'string' && key.length > 0) {
      keys[provider] = key
    }
  }
  return keys
}

export class ByokClient {
  readonly storage: KeyringStorage
  #keys: Keyring = {}
  #statuses: Partial<Record<string, KeyStatus>> = {}
  #locked: boolean
  #prompt: ByokPrompt | null = null
  #coverageAll = false
  #coverage: Record<string, boolean> = {}
  readonly #validate: Readonly<Record<string, ProviderValidateConfig>>
  readonly #listeners = new Set<() => void>()
  #snapshot: ByokSnapshot
  #storageError: string | null = null
  readonly #ready: Promise<void>

  constructor(options: DefineByokOptions = {}) {
    this.storage = options.storage ?? memoryStorage()
    this.#validate = {
      ...(options.providers ? byokValidateMap(options.providers) : {}),
      ...options.validate,
    }
    this.#locked = Boolean(this.storage.unlockable)
    this.#snapshot = this.#buildSnapshot()
    this.#ready = this.#hydrate()
  }

  /** Resolves when constructor hydration (peek/load) finishes. */
  ready = (): Promise<void> => this.#ready

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  getSnapshot = (): ByokSnapshot => this.#snapshot

  #buildSnapshot(): ByokSnapshot {
    return {
      status: { ...this.#statuses },
      locked: this.#locked,
      prompt: this.#prompt,
      storageError: this.#storageError,
    }
  }

  keys(): Keyring {
    return { ...this.#keys }
  }

  request(provider: ProviderId, reason: ByokPrompt['reason']): void {
    this.#prompt = { provider: requireProviderId(provider), reason }
    this.#emit()
  }

  /**
   * `true` — the server can fill any slug from env.
   * `false` — no env coverage.
   * A record merges per-id flags and clears the all/none boolean.
   */
  setServerCoverage(flags: boolean | Readonly<Record<string, boolean>>): void {
    if (typeof flags === 'boolean') {
      this.#coverageAll = flags
      this.#coverage = {}
      return
    }
    this.#coverageAll = false
    this.#coverage = { ...this.#coverage, ...flags }
  }

  #hasCoverage(provider: string): boolean {
    return this.#coverageAll || this.#coverage[provider] === true
  }

  headers(provider?: ProviderId): Record<string, string> {
    const headers: Record<string, string> = {}
    if (provider) {
      requireProviderId(provider)
      const key = this.#keys[provider]
      if (key) headers[byokHeaderName(provider)] = key
      return headers
    }
    for (const [id, key] of Object.entries(this.#keys)) {
      if (key) headers[byokHeaderName(id)] = key
    }
    return headers
  }

  async prepare(provider?: ProviderId): Promise<void> {
    await this.#ready
    if (this.storage.unlockable && this.#locked) {
      await this.unlock()
    }
    if (!provider) return
    requireProviderId(provider)
    if (this.#keys[provider]) return
    if (this.#hasCoverage(provider)) return
    this.request(provider, 'missing')
    throw new ByokBlockedError(provider, 'missing')
  }

  async update(
    providerOrKey: ProviderId | string,
    key?: string,
  ): Promise<void> {
    await this.#ready
    let provider: ProviderId
    let nextKey: string
    if (key === undefined) {
      if (!this.#prompt) {
        throw new Error('byok.update(key) cannot run when prompt is null')
      }
      provider = this.#prompt.provider
      nextKey = providerOrKey
    } else {
      provider = requireProviderId(providerOrKey)
      nextKey = key
    }
    nextKey = nextKey.trim()
    if (nextKey.length === 0) {
      throw new Error('BYOK key must be non-empty')
    }
    if (this.storage.unlockable && this.#locked) {
      await this.unlock()
    }
    const previousKeys = this.#keys
    const previousStatuses = { ...this.#statuses }
    const previousLocked = this.#locked
    const previousPrompt = this.#prompt
    const previousStorageError = this.#storageError
    const next = { ...this.#keys, [provider]: nextKey }
    try {
      await this.storage.save(next)
    } catch (error) {
      this.#keys = previousKeys
      this.#statuses = previousStatuses
      this.#locked = previousLocked
      this.#prompt = previousPrompt
      this.#storageError = previousStorageError
      this.#statuses[provider] = {
        state: 'error',
        masked: maskKey(nextKey),
        message: errorMessage(error, `Failed to persist ${provider} key`),
      }
      this.#emit()
      throw error
    }
    this.#keys = next
    this.#statuses[provider] = { state: 'set', masked: maskKey(nextKey) }
    this.#locked = false
    this.#prompt = null
    this.#storageError = null
    this.#emit()
  }

  async clear(provider?: ProviderId): Promise<void> {
    await this.#ready
    if (provider) {
      requireProviderId(provider)
      if (this.storage.unlockable && this.#locked) {
        await this.unlock()
      }
      const previousKeys = this.#keys
      const previousStatuses = { ...this.#statuses }
      const next = { ...this.#keys }
      delete next[provider]
      try {
        await this.storage.save(next)
      } catch (error) {
        this.#keys = previousKeys
        this.#statuses = previousStatuses
        this.#emit()
        throw error
      }
      this.#keys = next
      delete this.#statuses[provider]
      this.#emit()
      return
    }
    const previousKeys = this.#keys
    const previousStatuses = this.#statuses
    const previousLocked = this.#locked
    const previousPrompt = this.#prompt
    try {
      await this.storage.clear()
    } catch (error) {
      this.#keys = previousKeys
      this.#statuses = previousStatuses
      this.#locked = previousLocked
      this.#prompt = previousPrompt
      this.#emit()
      throw error
    }
    this.#keys = {}
    this.#statuses = {}
    this.#locked = false
    this.#prompt = null
    this.#storageError = null
    this.#emit()
  }

  async unlock(): Promise<void> {
    await this.#ready
    if (!this.storage.unlockable) return
    try {
      const loaded = sanitizeKeyring(await this.storage.load())
      this.#keys = { ...loaded, ...this.#keys }
      for (const [id, value] of Object.entries(loaded)) {
        if (!isProviderId(id) || !value) continue
        const existing = this.#statuses[id]
        if (!existing || existing.state === 'locked') {
          this.#statuses[id] = { state: 'set', masked: maskKey(value) }
        }
      }
      this.#locked = false
      this.#storageError = null
      this.#emit()
    } catch (error) {
      if (isByokCeremonyCancel(error)) {
        const provider = this.#lockedProvider()
        if (provider) {
          this.request(provider, 'locked')
          throw new ByokBlockedError(provider, 'locked')
        }
      }
      this.#storageError = errorMessage(error, 'Failed to unlock keyring')
      this.#emit()
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  #lockedProvider(): ProviderId | undefined {
    if (this.#prompt && isProviderId(this.#prompt.provider)) {
      return this.#prompt.provider
    }
    for (const [id, status] of Object.entries(this.#statuses)) {
      if (status?.state === 'locked' && isProviderId(id)) return id
    }
    return undefined
  }

  async validate(provider: ProviderId, key?: string): Promise<KeyStatus> {
    requireProviderId(provider)
    const target = key ?? this.#keys[provider]
    if (!target) {
      const existing = this.#statuses[provider]
      if (existing?.state === 'locked') return existing
      delete this.#statuses[provider]
      this.#emit()
      return EMPTY
    }
    const masked = maskKey(target)
    this.#statuses[provider] = { state: 'validating', masked }
    this.#emit()
    const config = this.#validate[provider]
    if (!config) {
      const result: KeyStatus = { state: 'set', masked }
      this.#statuses[provider] = result
      this.#emit()
      return result
    }
    try {
      const response = await fetch(config.url, {
        method: 'GET',
        headers: config.headers(target),
      })
      let result: KeyStatus
      if (response.ok) result = { state: 'valid', masked }
      else if (response.status === 401 || response.status === 403) {
        result = { state: 'invalid', masked }
      } else {
        result = {
          state: 'error',
          masked,
          message: `Could not validate ${provider} key: ${response.status} ${response.statusText}`,
        }
      }
      this.#statuses[provider] = result
      this.#emit()
      return result
    } catch (error) {
      const result: KeyStatus = {
        state: 'error',
        masked,
        message: error instanceof Error ? error.message : String(error),
      }
      this.#statuses[provider] = result
      this.#emit()
      return result
    }
  }

  async #hydrate(): Promise<void> {
    if (this.storage.unlockable) {
      if (!this.storage.peek) return
      try {
        const preview = await this.storage.peek()
        for (const [id, last4] of Object.entries(preview)) {
          if (!isProviderId(id) || this.#statuses[id]) continue
          this.#statuses[id] = {
            state: 'locked',
            masked: last4 ? last4 : '••',
          }
        }
        this.#locked = Object.keys(preview).length > 0
        this.#storageError = null
        this.#emit()
      } catch (error) {
        this.#storageError = errorMessage(error, 'Failed to read keyring')
        this.#emit()
      }
      return
    }
    try {
      const loaded = sanitizeKeyring(await this.storage.load())
      this.#keys = { ...loaded, ...this.#keys }
      for (const [id, value] of Object.entries(loaded)) {
        if (!isProviderId(id) || !value) continue
        this.#statuses[id] = { state: 'set', masked: maskKey(value) }
      }
      this.#storageError = null
      this.#emit()
    } catch (error) {
      this.#storageError = errorMessage(error, 'Failed to read keyring')
      this.#emit()
    }
  }

  #emit(): void {
    this.#snapshot = this.#buildSnapshot()
    for (const listener of this.#listeners) listener()
  }
}

export function defineByok(options: DefineByokOptions = {}): ByokClient {
  return new ByokClient(options)
}
