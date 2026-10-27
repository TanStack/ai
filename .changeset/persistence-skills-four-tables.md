---
'@tanstack/ai-persistence': patch
---

The adapter skills now say to write all four chat tables and stores on every dialect. The Drizzle skill gets a full Postgres schema block instead of a prose note, so an agent does not translate the SQLite schema by hand and drop `interrupts` and `metadata`.

The conformance step in every adapter skill now skips the optional `activities` store, which the testkit requires to be provided or declared. The Drizzle recipe's Postgres and SQLite code was run through the testkit on PGlite and libsql and passes.
