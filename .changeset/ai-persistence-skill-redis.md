---
'@tanstack/ai-persistence': patch
---

Update the Redis guidance in the `ai-persistence/build-custom-adapter` skill: keep `runs` and `interrupts` indexes in sorted sets written by one Lua script together with the record, instead of advising against Redis for interrupts.
