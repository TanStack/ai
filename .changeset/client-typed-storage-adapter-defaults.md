---
'@tanstack/ai-client': minor
---

`localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence`
default their `TValue` back to `ChatPersistedState` instead of `any`.

The `any` default was justified by a claim that "a bare call works for both the
chat **and generation** `persistence` options with no type argument". That is no
longer true: generation `persistence` is now `boolean` (server-driven only), so
chat is the sole `persistence` option that takes a storage adapter — and the
`any` default erased `getItem` / `setItem` type safety for chat users in exchange
for nothing.

A bare `localStoragePersistence()` still needs no type argument. Only a
standalone store holding something other than a chat transcript needs the
explicit one, e.g. `localStoragePersistence<MyValue>()`.
