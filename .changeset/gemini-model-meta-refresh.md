---
'@tanstack/ai-gemini': minor
---

Sync Gemini model metadata with Google's current published model list (#620, #621).

**Added**

- `gemini-3.1-flash-lite` (stable GA) — joins the existing `gemini-3.1-flash-lite-preview` entry and qualifies for the native combined tools + `responseSchema` streaming path (`GEMINI_COMBINED_TOOLS_AND_SCHEMA_MODELS`).

**Removed (retired by Google — these ids now 404 against the Gemini API or are no longer published)**

- `gemini-3-pro-preview` (verified 404; superseded by `gemini-3.1-pro-preview`)
- `gemini-2.5-flash-preview-09-2025` (superseded by stable `gemini-2.5-flash`)
- `gemini-2.5-flash-lite-preview-09-2025` (superseded by stable `gemini-2.5-flash-lite`)
- `gemini-2.0-flash` and `gemini-2.0-flash-lite` (2.0 line retired from Google's published list)
- `gemini-2.0-flash-preview-image-generation` (image; superseded by `gemini-2.5-flash-image`)

**Fixed**

- `gemini-3.5-flash` was missing from `GeminiChatModelToolCapabilitiesByName`, leaving its provider-tool typing broken.

If you were passing a removed id to `geminiText()` / `geminiSummarize()`, switch to the listed successor (e.g. `gemini-2.0-flash` → `gemini-2.5-flash`).
