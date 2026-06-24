---
'@tanstack/ai': patch
---

Fix `generateVideo()` (and the other `generateVideo` activity entry points) rejecting video adapters that declare per-model typed durations. The activity's `TAdapter extends VideoAdapter<string, any, any, any>` bound let the sixth `TModelDurationByName` generic fall back to its `Record<string, number>` default; because `createVideoJob` is a contravariant function-valued property, a concrete adapter whose `duration` is narrowed to a literal union (e.g. Veo's `4 | 6 | 8`, OpenRouter Seedance's `4..15`) failed the bound, so the documented `generateVideo({ adapter: geminiVideo('veo-3.1-generate-preview'), ... })` pattern did not type-check. The constraint now leaves the size and duration generics unpinned (`VideoAdapter<string, any, any, any, any, any>`); the real per-model types are still recovered by inference (`VideoSizeForAdapter` / `VideoDurationForAdapter`).
