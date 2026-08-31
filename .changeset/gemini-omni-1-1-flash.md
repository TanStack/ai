---
'@tanstack/ai-gemini': patch
---

Add Gemini Omni 1.1 Flash (`gemini-omni-1.1-flash`) as the GA Interactions video model.

`geminiVideo('gemini-omni-1.1-flash')` uses the existing Interactions video path. `gemini-omni-flash-preview` stays as a deprecated alias until it shuts down on 2026-09-30. `modelOptions.resolution` maps onto `response_format.resolution` (`360p` | `720p` | `1080p` | `4k`, default 720p). Duration stays 3–10 seconds per call.
