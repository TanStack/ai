import {
  ByokBlockedError,
  byokHeaderName,
  isProviderId,
  maskKey,
} from '@tanstack/ai/byok'
import { memoryStorage } from './storage'
import type { ProviderId } from '@tanstack/ai/byok'
import type { Keyring, KeyringStorage } from './storage'

export type KeyStatus =
  | { state: 'empty' }
  | { state: 'set'; masked: string }
  | { state: 'locked'; masked: string }
  | { state: 'error'; masked: string; message: string }

export type ByokPrompt = {
  provider: ProviderId
  reason: 'missing' | 'locked'
}

export type ByokSnapshot = {
  status: Partial<Record<string, KeyStatus>>
  locked: boolean
  prompt: ByokPrompt | null
  storageError: string | null
}

export interface DefineByokOptions {
  storage?: KeyringStorage
}

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
  const isTypeofDOMExceptionIsNotUndefinedAndErrorIsDOMException =
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'NotAllowedError'
  if (isTypeofDOMExceptionIsNotUndefinedAndErrorIsDOMException) {
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
  const isTypeofValueIsNotObjectOrMissingValue =
    typeof value !== 'object' || value === null
  if (isTypeofValueIsNotObjectOrMissingValue) return {}
  const keys: Keyring = {}
  const objectEntries = Object.entries(value)
  for (const [provider, key] of objectEntries) {
    const isProviderIdAndTypeofKeyIsStringAndNonemptyKey =
      isProviderId(provider) && typeof key === 'string' && key.length > 0
    if (isProviderIdAndTypeofKeyIsStringAndNonemptyKey) {
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
  readonly #listeners = new Set<() => void>()
  #snapshot: ByokSnapshot
  #storageError: string | null = null
  readonly #ready: Promise<void>

  constructor(options: DefineByokOptions = {}) {
    this.storage = options.storage ?? memoryStorage()
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
    const objectEntries = Object.entries(this.#keys)
    for (const [id, key] of objectEntries) {
      if (key) headers[byokHeaderName(id)] = key
    }
    return headers
  }

  async prepare(provider?: ProviderId): Promise<void> {
    await this.#ready
    const isUnlockableAndLocked = this.storage.unlockable && this.#locked
    if (isUnlockableAndLocked) {
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
    const isUnlockableAndLocked = this.storage.unlockable && this.#locked
    if (isUnlockableAndLocked) {
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
      const isUnlockableAndLocked = this.storage.unlockable && this.#locked
      if (isUnlockableAndLocked) {
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
      const objectEntries = Object.entries(loaded)
      for (const [id, value] of objectEntries) {
        const isNotIsProviderIdOrNotValue = !isProviderId(id) || !value
        if (isNotIsProviderIdOrNotValue) continue
        const existing = this.#statuses[id]
        const isNotExistingOrStateIsLocked =
          !existing || existing.state === 'locked'
        if (isNotExistingOrStateIsLocked) {
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
    const prompt = this.#prompt
    if (prompt && isProviderId(prompt.provider)) {
      return prompt.provider
    }
    const objectEntries = Object.entries(this.#statuses)
    for (const [id, status] of objectEntries) {
      if (status?.state === 'locked' && isProviderId(id)) return id
    }
    return undefined
  }

  async #hydrate(): Promise<void> {
    if (this.storage.unlockable) {
      if (!this.storage.peek) return
      try {
        const preview = await this.storage.peek()
        const objectEntries = Object.entries(preview)
        for (const [id, last4] of objectEntries) {
          const isNotIsProviderIdOrCondition =
            !isProviderId(id) || this.#statuses[id]
          if (isNotIsProviderIdOrCondition) continue
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
      const objectEntries2 = Object.entries(loaded)
      for (const [id, value] of objectEntries2) {
        const isNotIsProviderIdOrNotValue = !isProviderId(id) || !value
        if (isNotIsProviderIdOrNotValue) continue
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
