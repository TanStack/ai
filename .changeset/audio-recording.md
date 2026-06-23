---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
---

Add `AudioRecorder` (`@tanstack/ai-client`) and framework hooks for recording an
audio message in the browser: `useAudioRecorder` (React/Solid/Vue) and
`createAudioRecorder` (Svelte). The recording exposes a ready-to-use audio
content part (`.part`) for `sendMessage` and base64 (`.base64`) for the
generation hooks. Native recorder output (webm/mp4), no transcoding, no new
dependency.
