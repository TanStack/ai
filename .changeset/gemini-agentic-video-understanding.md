---
'@tanstack/ai-gemini': minor
---

Add agentic video understanding to the Gemini text adapter.

Set `metadata.processing: 'agentic'` on a video content part to route the request through the Gemini Interactions API for multi-pass "agentic" video understanding (GA on `gemini-3.7-flash`, `gemini-3.6-flash`, and `gemini-3.5-flash-lite`). Omit it for the default single-pass `generateContent` sampling. New `uploadGeminiFile()` and `geminiVideoPart()` helpers cover the Files API upload + poll-until-ACTIVE flow, and the three models now carry an `agentic_video` capability.
