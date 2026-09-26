---
'@tanstack/ai-gemini': major
---

Remove the deprecated `gemini-omni-flash-preview` model id, which shut down on 2026-09-30. Use the GA id `gemini-omni-1.1-flash` instead. This removes the `GEMINI_OMNI_FLASH_PREVIEW` model metadata, its entries in `GEMINI_VIDEO_MODELS`, `GEMINI_INTERACTIONS_VIDEO_MODELS`, `GeminiVideoModelDurationByName`, and `GEMINI_VIDEO_DURATIONS`, plus the deprecated `createGeminiVideo`/`geminiVideo` overloads that accepted the preview id.
