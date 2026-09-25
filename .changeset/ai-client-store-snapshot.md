---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-octane': minor
---

Hold client UI state in a TanStack Store atom. Framework hooks read `getSnapshot()` instead of copying fields through change callbacks. React `useChat()` first commits `initialMessages` and `initialResumeSnapshot`, then applies browser persistence after attach. This timing applies to client-only rendering and keeps the server snapshot stable during SSR hydration.

The snapshot `messages` and `queue` arrays are frozen in every adapter. An in-place change such as `messages.push()` throws a `TypeError`. Use `setMessages` to change messages. The hook return types now show this: `messages` and `queue` are `ReadonlyArray`, and so is `RealtimeClientState.messages`. If you pass `messages` to your own component or function, type that parameter as `ReadonlyArray<UIMessage>`.

A message that did not change keeps the same object from one snapshot to the next. Memoized message rows do not render again when a different message streams.

`ChatClient` adds `subscribeSnapshot` / `getSnapshot`. The live connection method stays `subscribe()`. Generation, video, realtime, and BYOK clients expose `subscribe` / `getSnapshot`. `AudioRecorder.subscribe` still passes the new state value.

`RealtimeClient` behavior changes: `connect()` now clears the messages and the pending user and assistant transcripts from the previous session. `interrupt()` now clears `pendingAssistantTranscript`.
