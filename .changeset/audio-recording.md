---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
---

Add `AudioRecorder` (`@tanstack/ai-client`) and framework hooks for recording an
audio message in the browser: `useAudioRecorder` (React/Solid/Vue),
`createAudioRecorder` (Svelte), and `injectAudioRecorder` (Angular). The
recording exposes a ready-to-use audio content part (`.part`) for `sendMessage`
and base64 (`.base64`) for the generation hooks. Native recorder output
(webm/mp4), no transcoding, no new dependency.

Each hook also returns a reactive `content` field — the latest resolved
recording (`AudioRecording | null`), available without awaiting `stop()`. Pass
`onComplete: (recording) => T | Promise<T>` to transform the output: `stop()`
then resolves to `T` and `content` becomes `T | null`. Omitting `onComplete`
keeps the raw `AudioRecording`.
