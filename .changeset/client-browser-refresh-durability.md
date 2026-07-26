---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-preact': minor
---

Add browser-refresh durability to the `persistence` option.

The client `persistence` adapter now stores one combined record per chat id, the message transcript plus a resume snapshot, so a full page reload restores the conversation, rehydrates any pending interrupt, and rejoins a run that was still streaming (via `joinRun`, when the connection is durability-backed). A bare `UIMessage[]` from an older store is still read for backward compatibility.

**If you hand-rolled a `persistence` adapter, update its write path.** `setItem` now receives the combined `{ messages, resume? }` record where it used to receive a bare `UIMessage[]`, so an adapter that assumed an array will write the new shape and then fail to parse it back — and because adapter reads are best-effort, the failure is silent: the conversation simply does not restore. Read `{ messages, resume? }` in `getItem` (a bare array is still accepted), or switch to the `localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence` adapters below, which handle it for you.

The `persistence` option also accepts an object form, `{ store, messages?: boolean }`. `messages: false` caches only the tiny resume pointer (which run to rejoin, which interrupts are pending), keeping large transcripts off the client, durability rejoin and interrupt restore still work, and the server stays authoritative for history. A bare adapter is shorthand for `{ store, messages: true }`.

New web storage adapters are exported for this: `localStoragePersistence`, `sessionStoragePersistence`, and `indexedDBPersistence` (plus `StorageUnavailableError` and the `ChatPersistedState` / `ChatStorageAdapter` / `ChatPersistenceConfig` / `ChatPersistenceOption` types). Because durability rides the existing `persistence` option, every framework integration (`react`, `solid`, `vue`, `svelte`, `angular`, `preact`) gets it with no framework-specific code.
