---
'@tanstack/ai-react': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-solid': patch
---

fix(ai-react, ai-preact, ai-vue, ai-solid): propagate `useChat` callback changes

`onResponse`, `onChunk`, and `onCustomEvent` were captured by reference at client creation time. When a parent component re-rendered with fresh closures, the `ChatClient` kept calling the originals. Every framework now wraps these callbacks so the latest `options.xxx` is read at call time (via `optionsRef.current` in React/Preact, and direct option access in Vue/Solid, matching the pattern already used for `onFinish` / `onError`). Clearing a callback (setting it to `undefined`) now correctly no-ops instead of continuing to invoke the stale handler.
