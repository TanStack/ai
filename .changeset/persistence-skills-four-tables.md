---
'@tanstack/ai-persistence': patch
---

The adapter skills now say to write all four chat tables and stores on every dialect. The Drizzle skill gets a full Postgres schema block instead of a prose note, so an agent does not translate the SQLite schema by hand and drop `interrupts` and `metadata`.
