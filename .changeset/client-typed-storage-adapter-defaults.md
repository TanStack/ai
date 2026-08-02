---
'@tanstack/ai-client': minor
---

`localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence`
are no longer generic. Each returns a `ChatStorageAdapter<ChatPersistedState>`,
and `WebStoragePersistenceOptions` types its `serialize` / `deserialize` codec
over `ChatPersistedState`.

The type parameter existed so one adapter could back both the chat and the
generation `persistence` option. Generation `persistence` is now `boolean`
(server-driven only), so chat is the sole option that takes a storage adapter and
the parameter had no second value to hold.

A bare `localStoragePersistence()` is unchanged. A call that passed an explicit
type argument for a standalone store, `localStoragePersistence<MyValue>()`, no
longer compiles: build that store with your own object literal, since these
factories are for chat state.
