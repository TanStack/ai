import {
  ByokBlockedError,
  PROVIDER_IDS,
  byokHeaderName,
  isProviderId,
  maskKey,
  providerValidateConfig,
} from '@tanstack/ai/byok'
import { memoryStorage } from './storage'
import type { ProviderId } from '@tanstack/ai/byok'
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
  status: Record<ProviderId, KeyStatus>
  locked: boolean
  prompt: ByokPrompt | null
}

export type ValidationStatus = 'valid' | 'invalid' | 'unsupported'

export interface DefineByokOptions {
  storage?: KeyringStorage
}

const EMPTY: KeyStatus = { state: 'empty' }

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

function recordFromProviders<T>(
  getValue: (provider: ProviderId) => T,
): Record<ProviderId, T> {
  const record = {} as Record<ProviderId, T>
  for (const provider of PROVIDER_IDS) {
    record[provider] = getValue(provider)
  }
  return record
}

export class ByokClient {
  readonly storage: KeyringStorage
  #keys: Keyring = {}
  #statuses: Partial<Record<ProviderId, KeyStatus>> = {}
  #locked: boolean
  #prompt: ByokPrompt | null = null
  #coverage: Partial<Record<ProviderId, boolean>> = {}
  readonly #listeners = new Set<() => void>()
  #snapshot: ByokSnapshot

  constructor(options: DefineByokOptions = {}) {
    this.storage = options.storage ?? memoryStorage()
    this.#locked = Boolean(this.storage.unlockable)
    this.#snapshot = this.#buildSnapshot()
    void this.#hydrate()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  getSnapshot = (): ByokSnapshot => this.#snapshot

  #buildSnapshot(): ByokSnapshot {
    return {
      status: recordFromProviders(
        (provider) => this.#statuses[provider] ?? EMPTY,
      ),
      locked: this.#locked,
      prompt: this.#prompt,
    }
  }

  keys(): Keyring {
    return { ...this.#keys }
  }

  request(provider: ProviderId, reason: ByokPrompt['reason']): void {
    this.#prompt = { provider, reason }
    this.#emit()
  }

  setServerCoverage(flags: Partial<Record<ProviderId, boolean>>): void {
    this.#coverage = { ...this.#coverage, ...flags }
  }

  headers(provider?: ProviderId): Record<string, string> {
    const headers: Record<string, string> = {}
    if (provider) {
      const key = this.#keys[provider]
      if (key) headers[byokHeaderName(provider)] = key
      return headers
    }
    for (const id of PROVIDER_IDS) {
      const key = this.#keys[id]
      if (key) headers[byokHeaderName(id)] = key
    }
    return headers
  }

  async prepare(provider?: ProviderId): Promise<void> {
    if (this.storage.unlockable && this.#locked) {
      await this.unlock()
    }
    if (!provider) return
    if (this.#keys[provider]) return
    if (this.#coverage[provider]) return
    this.request(provider, 'missing')
    throw new ByokBlockedError(provider, 'missing')
  }

  async update(
    providerOrKey: ProviderId | string,
    key?: string,
  ): Promise<void> {
    let provider: ProviderId
    let nextKey: string
    if (key === undefined) {
      if (!this.#prompt) {
        throw new Error('byok.update(key) cannot run when prompt is null')
      }
      provider = this.#prompt.provider
      nextKey = providerOrKey
    } else {
      if (!isProviderId(providerOrKey)) {
        throw new Error(`Unknown BYOK provider: ${providerOrKey}`)
      }
      provider = providerOrKey
      nextKey = key
    }
    if (this.storage.unlockable && this.#locked) {
      await this.unlock()
    }
    const next = { ...this.#keys, [provider]: nextKey }
    this.#keys = next
    this.#statuses[provider] = { state: 'set', masked: maskKey(nextKey) }
    this.#locked = false
    this.#prompt = null
    this.#emit()
    await this.storage.save(next)
  }

  async clear(provider?: ProviderId): Promise<void> {
    if (provider) {
      if (this.storage.unlockable && this.#locked) {
        await this.unlock()
      }
      const next = { ...this.#keys }
      delete next[provider]
      this.#keys = next
      this.#statuses[provider] = EMPTY
      this.#emit()
      await this.storage.save(next)
      return
    }
    this.#keys = {}
    this.#statuses = {}
    this.#locked = false
    this.#prompt = null
    this.#emit()
    await this.storage.clear()
  }

  async unlock(): Promise<void> {
    if (!this.storage.unlockable) return
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
    this.#emit()
  }

  async validate(provider: ProviderId, key?: string): Promise<KeyStatus> {
    const target = key ?? this.#keys[provider]
    if (!target) {
      const existing = this.#statuses[provider]
      if (existing?.state === 'locked') return existing
      this.#statuses[provider] = EMPTY
      this.#emit()
      return EMPTY
    }
    const masked = maskKey(target)
    this.#statuses[provider] = { state: 'validating', masked }
    this.#emit()
    const config = providerValidateConfig(provider)
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
        if (Object.keys(preview).length === 0) this.#locked = false
        this.#emit()
      } catch {
        // peek is best-effort
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
      this.#emit()
    } catch {
      // load is best-effort on construct
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
