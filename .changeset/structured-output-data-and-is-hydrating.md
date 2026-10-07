---
'@tanstack/ai': patch
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-octane': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-remix': minor
---

`StructuredOutputPart.data` is no longer optional when `status` is `'complete'`. After you check `part.status === 'complete'`, TypeScript knows `part.data` is set.

Migration: if you validate messages with a schema typed as `UIMessage` (for example `z.ZodType<UIMessage>`), split the `structured-output` part by `status`. Give `'complete'` a required `data` field.

Add `isHydrating` to `useChat` (and `injectChat`, `createChat`) and an `onHydratingChange` callback plus `getIsHydrating()` to `ChatClient`. It is `true` while the chat is rebuilt from persistence (the server hydrate with `persistence: true`, or an async storage adapter). It turns `false` when the transcript is in place and any in-flight run is re-joined, or when the load fails.
