---
'@tanstack/ai-openrouter': patch
---

Update `@openrouter/sdk` to `0.13.20`. This removes the duplicate `rootDir` key from the published SDK package metadata (fixes #712) and picks up the fix to the `getVideoContent` download helper, which previously requested `Accept: application/octet-stream` and matched the streamed 200 response without a content type, so the upstream `video/mp4` body failed to match. The SDK now requests `Accept: video/mp4` and matches the stream with `ctype: "video/mp4"`.
