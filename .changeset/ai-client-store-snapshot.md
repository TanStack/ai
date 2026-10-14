---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-octane': minor
'@tanstack/ai-remix': minor
---

Hold client UI state in a TanStack Store atom. Framework hooks read `getSnapshot()` instead of copying fields through change callbacks. React `useChat()` first commits `initialMessages` and `initialResumeSnapshot`, then applies browser persistence after attach. This timing applies to client-only rendering and keeps the server snapshot stable during SSR hydration. Until the stored transcript is applied, `isHydrating` is `true`.

The snapshot `messages` and `queue` arrays are frozen in every adapter. An in-place change such as `messages.push()` throws a `TypeError`. Use `setMessages` to change messages. The hook return types now show this: `messages` and `queue` are `ReadonlyArray`, and so is `RealtimeClientState.messages`. If you pass `messages` to your own component or function, type that parameter as `ReadonlyArray<UIMessage>`.

Snapshot message `parts` are frozen at runtime too, but their TypeScript type stays mutable, because a readonly part list is not assignable to `UIMessage`. Tool `input`, `output`, and subagent transcripts on a snapshot are copies.

A message or part that did not change keeps the same object from one snapshot to the next. Memoized message rows do not render again when a different message streams.

`ChatClient` adds `subscribeSnapshot` / `getSnapshot`. The live connection method stays `subscribe()`. Generation, video, realtime, and BYOK clients expose `subscribe` / `getSnapshot`. `AudioRecorder.subscribe` still passes the new state value.

`RealtimeClient` behavior changes: when `connect()` connects, it clears the messages and the pending user and assistant transcripts from the previous session. A transcript that arrives while the microphone starts is kept. A failed connection keeps the previous transcript. `interrupt()` now clears `pendingAssistantTranscript`.

`setMessages` accepts the hook's readonly `messages`, including nested subagent cards. A listener that throws does not skip the other listeners in any client, and it does not leave `isLoading` stuck. The error goes to `reportError` in the browser and to `console.error` in other runtimes.
