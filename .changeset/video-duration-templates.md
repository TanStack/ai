---
'@tanstack/ai': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-lovable': minor
---

`snapDuration` and `snapToDurationOption` accept seconds (`6`), a numeric string (`"6"`), a seconds template (`"6s"`), or a keyword the model lists (`"auto"`). `durationToSeconds` reads the numeric forms. Sora (`sora-2`, `sora-2-pro`) accepts `4 | 8 | 12`, `"4" | "8" | "12"`, or `"4s" | "8s" | "12s"` and sends `"4" | "8" | "12"`. Lovable Veo accepts the same three spellings for 4, 6, and 8 seconds.
