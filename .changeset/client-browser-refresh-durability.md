---
'@tanstack/ai-client': minor
---

Add browser-refresh durability to the `persistence` option.

The client `persistence` adapter now stores one combined record per chat id, the message transcript plus a resume snapshot, so a full page reload restores the conversation, rehydrates any pending interrupt, and rejoins a run that was still streaming (via `joinRun`, when the connection is durability-backed). A bare `UIMessage[]` from an older store is still read for backward compatibility.

New web storage adapters are exported for this: `localStoragePersistence`, `sessionStoragePersistence`, and `indexedDBPersistence` (plus `StorageUnavailableError` and the `ChatPersistedState` / `ChatStorageAdapter` types). Because durability rides the existing `persistence` option, every framework integration (`react`, `solid`, `vue`, `svelte`, `angular`, `preact`) gets it with no framework-specific code.
