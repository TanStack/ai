import type { ChatStorageAdapter } from './types'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | Array<JsonValue>
  | { [key: string]: JsonValue }

export interface StorageCodec<TValue> {
  serialize: (value: TValue) => string
  deserialize: (value: string) => TValue
}

export interface WebStoragePersistenceOptions<TValue> {
  keyPrefix?: string
  serialize?: (value: TValue) => string
  deserialize?: (value: string) => TValue
}

export interface IndexedDBPersistenceOptions {
  databaseName?: string
  objectStoreName?: string
  keyPrefix?: string
}

type NonJsonValue =
  | bigint
  | Date
  | symbol
  | undefined
  | ((...args: Array<never>) => unknown)

type IsJsonSerializable<TValue> = [TValue] extends [JsonPrimitive]
  ? true
  : [TValue] extends [NonJsonValue]
    ? false
    : TValue extends ReadonlyArray<infer TItem>
      ? IsJsonSerializable<TItem>
      : TValue extends object
        ? false extends {
            [TKey in keyof TValue]-?: IsJsonSerializable<TValue[TKey]>
          }[keyof TValue]
          ? false
          : true
        : false

type WebStorageArguments<TValue> =
  IsJsonSerializable<TValue> extends true
    ? [options?: WebStoragePersistenceOptions<TValue>]
    : [options: WebStoragePersistenceOptions<TValue> & StorageCodec<TValue>]

type StorageName = 'localStorage' | 'sessionStorage' | 'indexedDB'

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

export function localStoragePersistence<TValue = JsonValue>(
  ...[options = {}]: WebStorageArguments<TValue>
): ChatStorageAdapter<TValue> {
  return createWebStoragePersistence('localStorage', options)
}

export function sessionStoragePersistence<TValue = JsonValue>(
  ...[options = {}]: WebStorageArguments<TValue>
): ChatStorageAdapter<TValue> {
  return createWebStoragePersistence('sessionStorage', options)
}

export function indexedDBPersistence<TValue>(
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
