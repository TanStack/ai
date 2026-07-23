import type { ChatPersistedState, ChatStorageAdapter } from './types'

export interface WebStoragePersistenceOptions<TValue> {
  keyPrefix?: string
  /**
   * Defaults to `JSON.stringify`. Override only for values JSON can't
   * round-trip losslessly (a `Map`, a `bigint`, a `Date` you need back as a
   * `Date` rather than an ISO string).
   */
  serialize?: (value: TValue) => string
  /** Defaults to `JSON.parse`. */
  deserialize?: (value: string) => TValue
}

export interface IndexedDBPersistenceOptions {
  databaseName?: string
  objectStoreName?: string
  keyPrefix?: string
}

type StorageName = 'localStorage' | 'sessionStorage' | 'indexedDB'

/**
 * Thrown by a storage adapter when its backing store is absent — most commonly
 * during server-side rendering, where `localStorage` / `sessionStorage` /
 * `indexedDB` do not exist on `globalThis`. The adapters check availability
 * lazily, **per operation**, so constructing an adapter never throws; the error
 * surfaces from `getItem` / `setItem` / `removeItem` (rejected promise for
 * IndexedDB). The chat persistence layer treats it as best-effort and routes it
 * to `onError` / `console.warn` rather than breaking chat.
 */
export class StorageUnavailableError extends Error {
  constructor(storageName: StorageName) {
    super(`${storageName} is not available in this environment.`)
    this.name = 'StorageUnavailableError'
  }
}

function stringifyJson<TValue>(value: TValue): string {
  const stringify: (input: unknown) => unknown = JSON.stringify
  const serialized = stringify(value)
  if (typeof serialized !== 'string') {
    throw new TypeError('The value is not JSON serializable.')
  }
  return serialized
}

function createWebStoragePersistence<TValue>(
  storageName: 'localStorage' | 'sessionStorage',
  options: WebStoragePersistenceOptions<TValue>,
): ChatStorageAdapter<TValue> {
  const keyPrefix = options.keyPrefix ?? 'tanstack-ai:'
  const serialize = options.serialize ?? stringifyJson
  const deserialize = options.deserialize ?? JSON.parse
  const key = (id: string) => `${keyPrefix}${id}`

  const getStorage = (): Storage => {
    const browserGlobals: {
      localStorage?: Storage
      sessionStorage?: Storage
    } = globalThis
    const storage = browserGlobals[storageName]
    if (!storage) {
      throw new StorageUnavailableError(storageName)
    }
    return storage
  }

  return {
    getItem(id) {
      const item = getStorage().getItem(key(id))
      return item === null ? null : deserialize(item)
    },
    setItem(id, value) {
      getStorage().setItem(key(id), serialize(value))
    },
    removeItem(id) {
      getStorage().removeItem(key(id))
    },
  }
}

/**
 * A `ChatStorageAdapter` backed by `window.localStorage` (persists across
 * reloads and browser restarts). Keys are namespaced with `keyPrefix`, which
 * defaults to `tanstack-ai:`. Every operation reads `localStorage` lazily and
 * throws {@link StorageUnavailableError} when it is absent (e.g. SSR), so the
 * adapter can be constructed safely on the server.
 *
 * The `serialize` / `deserialize` codec defaults to `JSON.stringify` /
 * `JSON.parse`, so the common case needs no codec. `TValue` defaults to
 * {@link ChatPersistedState}, so `localStoragePersistence()` drops straight into
 * the `persistence` option with no type argument. Pass a codec only for values
 * JSON can't round-trip losslessly, and a type argument for non-chat storage.
 */
export function localStoragePersistence<TValue = ChatPersistedState>(
  options: WebStoragePersistenceOptions<TValue> = {},
): ChatStorageAdapter<TValue> {
  return createWebStoragePersistence('localStorage', options)
}

/**
 * A `ChatStorageAdapter` backed by `window.sessionStorage` (scoped to the tab
 * and cleared when it closes). Identical to {@link localStoragePersistence} in
 * every other respect: `ChatPersistedState` default `TValue`, `tanstack-ai:`
 * default `keyPrefix`, lazy per-operation {@link StorageUnavailableError} on
 * SSR, and a JSON codec that defaults to `JSON.stringify` / `JSON.parse`.
 */
export function sessionStoragePersistence<TValue = ChatPersistedState>(
  options: WebStoragePersistenceOptions<TValue> = {},
): ChatStorageAdapter<TValue> {
  return createWebStoragePersistence('sessionStorage', options)
}

/**
 * A `ChatStorageAdapter` backed by IndexedDB, for values too large for Web
 * Storage or that benefit from structured-clone storage. All operations are
 * async and the database opens lazily on first use; keys are namespaced with
 * `keyPrefix` (default `tanstack-ai:`). When IndexedDB is unavailable (e.g.
 * SSR) each operation rejects with {@link StorageUnavailableError}.
 *
 * No serialize/deserialize codec is needed or accepted — values are stored via
 * IndexedDB's native structured clone, so `Date`, `Map`, `ArrayBuffer`, etc.
 * round-trip without a JSON step. `TValue` defaults to {@link ChatPersistedState}.
 */
export function indexedDBPersistence<TValue = ChatPersistedState>(
  options: IndexedDBPersistenceOptions = {},
): ChatStorageAdapter<TValue> {
  const databaseName = options.databaseName ?? 'tanstack-ai'
  const objectStoreName = options.objectStoreName ?? 'persistence'
  const keyPrefix = options.keyPrefix ?? 'tanstack-ai:'
  let databasePromise: Promise<IDBDatabase> | undefined

  const openDatabase = (): Promise<IDBDatabase> => {
    if (databasePromise) {
      return databasePromise
    }

    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const browserGlobals: { indexedDB?: IDBFactory } = globalThis
      const factory = browserGlobals.indexedDB
      if (!factory) {
        reject(new StorageUnavailableError('indexedDB'))
        return
      }

      let request: IDBOpenDBRequest
      let openFailed = false
      try {
        request = factory.open(databaseName)
      } catch (error) {
        reject(error)
        return
      }

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(objectStoreName)) {
          request.result.createObjectStore(objectStoreName)
        }
      }
      request.onerror = () => {
        openFailed = true
        reject(request.error ?? new Error(`Failed to open ${databaseName}.`))
      }
      request.onblocked = () => {
        openFailed = true
        reject(
          new Error(
            `Opening IndexedDB database "${databaseName}" was blocked.`,
          ),
        )
      }
      request.onsuccess = () => {
        const database = request.result
        if (openFailed) {
          database.close()
          return
        }
        database.onversionchange = () => {
          database.close()
          databasePromise = undefined
        }
        resolve(database)
      }
    }).catch((error: unknown) => {
      databasePromise = undefined
      throw error
    })

    return databasePromise
  }

  const runRequest = async <TResult>(
    mode: IDBTransactionMode,
    createRequest: (store: IDBObjectStore) => IDBRequest<TResult>,
  ): Promise<TResult> => {
    const database = await openDatabase()
    return new Promise<TResult>((resolve, reject) => {
      let request: IDBRequest<TResult>
      let result: TResult
      try {
        const transaction = database.transaction(objectStoreName, mode)
        request = createRequest(transaction.objectStore(objectStoreName))
        request.onsuccess = () => {
          result = request.result
        }
        request.onerror = () => {
          reject(request.error ?? new Error('IndexedDB request failed.'))
        }
        transaction.oncomplete = () => {
          resolve(result)
        }
        transaction.onerror = () => {
          reject(
            transaction.error ?? new Error('IndexedDB transaction failed.'),
          )
        }
        transaction.onabort = () => {
          reject(
            transaction.error ?? new Error('IndexedDB transaction aborted.'),
          )
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  const key = (id: string) => `${keyPrefix}${id}`
  return {
    getItem(id) {
      return runRequest('readonly', (store) => store.get(key(id)))
    },
    setItem(id, value) {
      return runRequest('readwrite', (store) => store.put(value, key(id))).then(
        () => undefined,
      )
    },
    removeItem(id) {
      return runRequest('readwrite', (store) => store.delete(key(id))).then(
        () => undefined,
      )
    },
  }
}
