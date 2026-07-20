import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  StorageUnavailableError,
  indexedDBPersistence,
  localStoragePersistence,
  sessionStoragePersistence,
} from '../src/storage-adapters'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

function openDatabase(factory: IDBFactory, name: string, version: number) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, version)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe.each([
  ['localStoragePersistence', 'localStorage', localStoragePersistence],
  ['sessionStoragePersistence', 'sessionStorage', sessionStoragePersistence],
] as const)('%s', (_name, globalName, createAdapter) => {
  beforeEach(() => {
    vi.stubGlobal(globalName, memoryStorage())
  })

  it('round-trips JSON values under the configured prefix and removes them', () => {
    const adapter = createAdapter<{ count: number; labels: Array<string> }>({
      keyPrefix: 'custom:',
    })
    const storage = globalThis[globalName]

    adapter.setItem('entry', { count: 2, labels: ['a', 'b'] })

    expect(storage.getItem('custom:entry')).toBe(
      JSON.stringify({ count: 2, labels: ['a', 'b'] }),
    )
    expect(adapter.getItem('entry')).toEqual({
      count: 2,
      labels: ['a', 'b'],
    })
    adapter.removeItem('entry')
    expect(adapter.getItem('entry')).toBeNull()
  })

  it('uses existing codec hooks for values outside JSON semantics', () => {
    const adapter = createAdapter<{ createdAt: Date }>({
      serialize: (value) => value.createdAt.toISOString(),
      deserialize: (value) => ({ createdAt: new Date(value) }),
    })

    adapter.setItem('dated', { createdAt: new Date('2026-01-02T00:00:00Z') })

    expect(adapter.getItem('dated')).toEqual({
      createdAt: new Date('2026-01-02T00:00:00Z'),
    })
  })

  it('constructs during SSR but throws an observable unavailable error on use', () => {
    vi.stubGlobal(globalName, undefined)
    const adapter = createAdapter<{ value: string }>()

    expect(() => adapter.getItem('entry')).toThrow(StorageUnavailableError)
    expect(() => adapter.setItem('entry', { value: 'x' })).toThrow(
      StorageUnavailableError,
    )
    expect(() => adapter.removeItem('entry')).toThrow(StorageUnavailableError)
  })
})

describe('indexedDBPersistence', () => {
  let factory: IDBFactory

  beforeEach(() => {
    factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
  })

  it('round-trips structured-clone values, namespaces keys, and removes them', async () => {
    const first = indexedDBPersistence<{ createdAt: Date }>({
      databaseName: 'roundtrip',
      keyPrefix: 'first:',
    })
    const second = indexedDBPersistence<{ createdAt: Date }>({
      databaseName: 'roundtrip',
      keyPrefix: 'second:',
    })
    const value = { createdAt: new Date('2026-03-04T00:00:00Z') }

    await first.setItem('entry', value)
    await second.setItem('entry', {
      createdAt: new Date('2026-05-06T00:00:00Z'),
    })

    await expect(first.getItem('entry')).resolves.toEqual(value)
    await expect(second.getItem('entry')).resolves.not.toEqual(value)
    await first.removeItem('entry')
    await expect(first.getItem('entry')).resolves.toBeUndefined()
    await expect(second.getItem('entry')).resolves.toBeDefined()
  })

  it('caches its opened database connection', async () => {
    const open = vi.spyOn(factory, 'open')
    const adapter = indexedDBPersistence<string>({ databaseName: 'cached' })

    await adapter.setItem('a', 'one')
    await adapter.getItem('a')
    await adapter.removeItem('a')

    expect(open).toHaveBeenCalledTimes(1)
  })

  it('closes its connection on versionchange so upgrades are not blocked', async () => {
    const adapter = indexedDBPersistence<string>({
      databaseName: 'versionchange',
    })
    await adapter.setItem('a', 'one')

    const upgraded = await openDatabase(factory, 'versionchange', 2)

    expect(upgraded.version).toBe(2)
    upgraded.close()
  })

  it('rejects open failures and does not cache the rejection', async () => {
    const openError = new Error('open failed')
    const open = vi.spyOn(factory, 'open').mockImplementation(() => {
      throw openError
    })
    const adapter = indexedDBPersistence<string>({ databaseName: 'failed' })

    await expect(adapter.getItem('a')).rejects.toBe(openError)
    await expect(adapter.getItem('a')).rejects.toBe(openError)
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('constructs during SSR and rejects operations when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const adapter = indexedDBPersistence<string>({ databaseName: 'ssr' })

    await expect(adapter.getItem('a')).rejects.toBeInstanceOf(
      StorageUnavailableError,
    )
    await expect(adapter.setItem('a', 'one')).rejects.toBeInstanceOf(
      StorageUnavailableError,
    )
    await expect(adapter.removeItem('a')).rejects.toBeInstanceOf(
      StorageUnavailableError,
    )
  })
})
