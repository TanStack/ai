---
"@tanstack/ai-angular": patch
"@tanstack/ai-svelte": patch
"@tanstack/ai-react": patch
"@tanstack/ai-solid": patch
"@tanstack/ai-vue": patch
---

Fix audio-recorder transforming overloads so options without `onComplete`
(e.g. `{ onError }`) keep `AudioRecording` instead of collapsing
`recording`/`stop()` to `unknown` (issue #1001).

The transforming overload now requires `onComplete`, matching the fix already
landed in the Octane port (#1000). Runtime behavior is unchanged.