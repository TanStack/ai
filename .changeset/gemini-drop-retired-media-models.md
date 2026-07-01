---
'@tanstack/ai-gemini': minor
---

Drop retired Gemini media models and add **Veo 3.1 Lite**.

The following models return `404 NOT_FOUND` from the Gemini Developer API and have been removed from the adapter's model lists and type maps:

- `imagen-3.0-generate-002` (superseded by the Imagen 4 family)
- `veo-2.0-generate-001`
- `veo-3.0-generate-001`
- `veo-3.0-fast-generate-001`

Added `veo-3.1-lite-generate-preview` (Veo 3.1 Lite) — the lowest-cost Veo 3.1 tier ($0.05/sec, 720p, video + audio), with the same `4 | 6 | 8` second durations as the rest of the Veo 3.1 family.

If you were referencing one of the removed model ids, switch to a current model (e.g. `imagen-4.0-generate-001`, `veo-3.1-generate-preview`, or `veo-3.1-lite-generate-preview`).
