---
'@tanstack/ai-persistence': patch
---

Persistence adapter skills now type-check, and the Drizzle and custom Postgres recipes run the persistence conformance suite. The custom recipe includes the interrupt and metadata stores. The Prisma recipe is type-checked only, because it needs a generated client.
