---
'@tanstack/ai': patch
---

Fix `generateVideo` / `getVideoJobStatus` rejecting video adapters that declare a narrowed per-model duration union (e.g. Gemini's `4 | 6 | 8` for Veo or `10` for Omni Flash) at the type level. The activity's `TAdapter extends VideoAdapter<string, any, any, any>` constraints left the input-modality and duration generics at their defaults, so `duration?: number` failed contravariance against the adapter's literal union. All video-activity constraints and helper conditionals now span all six `VideoAdapter` generics.
