import {
  indexedDBPersistence,
  localStoragePersistence,
  sessionStoragePersistence,
} from '../src/index'
import type {
  ChatPersistenceOptions,
  ChatStorageAdapter,
  UIMessage,
} from '../src/index'

const local = localStoragePersistence<{
  count: number
  labels: Array<string>
}>()
const session = sessionStoragePersistence<Array<string>>()
const indexed = indexedDBPersistence<{ createdAt: Date }>()

const localAdapter: ChatStorageAdapter<{
  count: number
  labels: Array<string>
}> = local
const sessionAdapter: ChatStorageAdapter<Array<string>> = session
const indexedAdapter: ChatStorageAdapter<{ createdAt: Date }> = indexed

// @ts-expect-error - default Web Storage JSON cannot preserve Date instances
localStoragePersistence<{ createdAt: Date }>()
// @ts-expect-error - both codec directions are required for non-JSON values
sessionStoragePersistence<{ createdAt: Date }>({
  serialize: (value) => value.createdAt.toISOString(),
})

localStoragePersistence<{ createdAt: Date }>({
  serialize: (value) => value.createdAt.toISOString(),
  deserialize: (value) => ({ createdAt: new Date(value) }),
})

declare const messagePersistence: ChatStorageAdapter<Array<UIMessage>>
// @ts-expect-error - chat persistence must name the client lane explicitly
const directPersistence: ChatPersistenceOptions = messagePersistence

void localAdapter
void sessionAdapter
void indexedAdapter
void directPersistence
